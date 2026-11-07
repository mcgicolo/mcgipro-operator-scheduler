-- MCGI Operators Board — run once in Supabase → SQL Editor.
-- Safe to re-run.

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null,            -- operators[].id from public/operators.json
  schedule_id uuid not null,            -- schedules[].id from public/schedule.json
  moved_by    text not null check (char_length(moved_by) between 1 and 60),
  client_id   text not null check (char_length(client_id) <= 64),
  moved_at    timestamptz not null default now(),
  unique (operator_id, schedule_id)     -- an operator only once per duty
);

-- Realtime (INSERT / UPDATE / DELETE)
do $$
begin
  alter publication supabase_realtime add table public.assignments;
exception when duplicate_object then null;
end $$;

-- Anyone with the anon key can read / insert / update / delete (honor system, no accounts).
alter table public.assignments enable row level security;
drop policy if exists "public rw" on public.assignments;
create policy "public rw" on public.assignments
  for all to anon using (true) with check (true);

-- Optional abuse guard: reject more than 60 writes per client_id per minute.
create table if not exists public.assignment_writes (
  client_id  text not null,
  written_at timestamptz not null default now()
);
create index if not exists assignment_writes_client_time on public.assignment_writes (client_id, written_at);
alter table public.assignment_writes enable row level security; -- no policies: not readable via the API

create or replace function public.assignments_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid text := coalesce(new.client_id, old.client_id);
  recent int;
begin
  delete from assignment_writes where written_at < now() - interval '5 minutes';
  select count(*) into recent from assignment_writes
    where client_id = cid and written_at > now() - interval '1 minute';
  if recent >= 60 then
    raise exception 'Too many changes, slow down' using errcode = 'P0001';
  end if;
  insert into assignment_writes (client_id) values (cid);
  return coalesce(new, old);
end $$;

drop trigger if exists assignments_rate_limit on public.assignments;
create trigger assignments_rate_limit
  before insert or update on public.assignments
  for each row execute function public.assignments_rate_limit();

-- ---------------------------------------------------------------- paper trail
-- Append-only history of every change: who added, moved or removed which sticky.
-- Written only by the trigger below (security definer); the anon key can read it but
-- cannot insert, edit or delete rows, so the trail can't be rewritten from the app.
create table if not exists public.assignment_events (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  action           text not null check (action in ('add', 'move', 'remove')),
  assignment_id    uuid not null,
  operator_id      uuid not null,
  from_schedule_id uuid,             -- move / remove
  to_schedule_id   uuid,             -- add / move
  actor            text,             -- nickname; null when unknown (e.g. a delete made outside the app)
  client_id        text              -- device that made the change
);
create index if not exists assignment_events_assignment on public.assignment_events (assignment_id);

alter table public.assignment_events enable row level security;
drop policy if exists "public read" on public.assignment_events;
create policy "public read" on public.assignment_events for select to anon using (true);

do $$
begin
  alter publication supabase_realtime add table public.assignment_events;
exception when duplicate_object then null;
end $$;

create or replace function public.assignments_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into assignment_events (action, assignment_id, operator_id, to_schedule_id, actor, client_id)
    values ('add', new.id, new.operator_id, new.schedule_id, new.moved_by, new.client_id);
  elsif tg_op = 'UPDATE' then
    if new.schedule_id is distinct from old.schedule_id then
      insert into assignment_events (action, assignment_id, operator_id, from_schedule_id, to_schedule_id, actor, client_id)
      values ('move', new.id, new.operator_id, old.schedule_id, new.schedule_id, new.moved_by, new.client_id);
    end if;
  else
    -- A delete carries no row data of its own: remove_assignment() passes who did it.
    insert into assignment_events (action, assignment_id, operator_id, from_schedule_id, actor, client_id)
    values ('remove', old.id, old.operator_id, old.schedule_id,
            nullif(current_setting('app.actor', true), ''), nullif(current_setting('app.client_id', true), ''));
  end if;
  return null;
end $$;

drop trigger if exists assignments_log on public.assignments;
create trigger assignments_log
  after insert or update or delete on public.assignments
  for each row execute function public.assignments_log();

-- Removing through this function records who removed the sticky (a plain delete logs "someone").
-- security invoker: the caller's RLS policy still decides whether the delete is allowed.
create or replace function public.remove_assignment(p_id uuid, p_actor text, p_client_id text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform set_config('app.actor', left(coalesce(p_actor, ''), 60), true);
  perform set_config('app.client_id', left(coalesce(p_client_id, ''), 64), true);
  delete from assignments where id = p_id;
end $$;
grant execute on function public.remove_assignment(uuid, text, text) to anon;
