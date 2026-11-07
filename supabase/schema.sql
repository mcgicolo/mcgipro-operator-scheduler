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
