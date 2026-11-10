-- Local development schema for plain PostgreSQL (no Supabase).
-- Same table + rate limit as supabase/schema.sql, minus RLS/publication,
-- plus a NOTIFY trigger that the Vite dev API turns into live updates.
-- Safe to re-run:  npm run db:setup

create table if not exists assignments (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  schedule_id uuid not null,
  moved_by    text not null check (char_length(moved_by) between 1 and 60),
  client_id   text not null check (char_length(client_id) <= 64),
  moved_at    timestamptz not null default now(),
  unique (operator_id, schedule_id)
);

-- Work email of whoever last placed / moved the sticky (added later; null on older rows).
alter table assignments add column if not exists moved_by_email text
  check (moved_by_email is null or char_length(moved_by_email) <= 254);

-- Abuse guard: more than 60 writes per client_id per minute is rejected.
create table if not exists assignment_writes (
  client_id  text not null,
  written_at timestamptz not null default now()
);
create index if not exists assignment_writes_client_time on assignment_writes (client_id, written_at);

create or replace function assignments_rate_limit() returns trigger
language plpgsql as $$
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

drop trigger if exists assignments_rate_limit on assignments;
create trigger assignments_rate_limit
  before insert or update on assignments
  for each row execute function assignments_rate_limit();

-- Live updates: every change is announced on channel "assignments".
create or replace function assignments_notify() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform pg_notify('assignments', json_build_object('op', 'DELETE', 'id', old.id)::text);
    return old;
  end if;
  perform pg_notify('assignments', json_build_object('op', tg_op, 'row', row_to_json(new))::text);
  return new;
end $$;

drop trigger if exists assignments_notify on assignments;
create trigger assignments_notify
  after insert or update or delete on assignments
  for each row execute function assignments_notify();

-- Paper trail: append-only history of every change (same as supabase/schema.sql).
create table if not exists assignment_events (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  action           text not null check (action in ('add', 'move', 'remove')),
  assignment_id    uuid not null,
  operator_id      uuid not null,
  from_schedule_id uuid,
  to_schedule_id   uuid,
  actor            text,
  client_id        text
);
create index if not exists assignment_events_assignment on assignment_events (assignment_id);
alter table assignment_events add column if not exists actor_email text; -- work email; null when unknown

create or replace function assignments_log() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into assignment_events (action, assignment_id, operator_id, to_schedule_id, actor, actor_email, client_id)
    values ('add', new.id, new.operator_id, new.schedule_id, new.moved_by, new.moved_by_email, new.client_id);
  elsif tg_op = 'UPDATE' then
    if new.schedule_id is distinct from old.schedule_id then
      insert into assignment_events (action, assignment_id, operator_id, from_schedule_id, to_schedule_id, actor, actor_email, client_id)
      values ('move', new.id, new.operator_id, old.schedule_id, new.schedule_id, new.moved_by, new.moved_by_email, new.client_id);
    end if;
  else
    insert into assignment_events (action, assignment_id, operator_id, from_schedule_id, actor, actor_email, client_id)
    values ('remove', old.id, old.operator_id, old.schedule_id,
            nullif(current_setting('app.actor', true), ''), nullif(current_setting('app.actor_email', true), ''),
            nullif(current_setting('app.client_id', true), ''));
  end if;
  return null;
end $$;

drop trigger if exists assignments_log on assignments;
create trigger assignments_log
  after insert or update or delete on assignments
  for each row execute function assignments_log();

-- Every history row is announced on the same channel, as op EVENT.
create or replace function assignment_events_notify() returns trigger
language plpgsql as $$
begin
  perform pg_notify('assignments', json_build_object('op', 'EVENT', 'event', row_to_json(new))::text);
  return null;
end $$;

drop trigger if exists assignment_events_notify on assignment_events;
create trigger assignment_events_notify
  after insert on assignment_events
  for each row execute function assignment_events_notify();

create or replace function remove_assignment(p_id uuid, p_actor text, p_client_id text) returns void
language plpgsql as $$
begin
  perform set_config('app.actor', left(coalesce(p_actor, ''), 60), true);
  perform set_config('app.client_id', left(coalesce(p_client_id, ''), 64), true);
  delete from assignments where id = p_id;
end $$;

create or replace function remove_assignment(p_id uuid, p_actor text, p_actor_email text, p_client_id text) returns void
language plpgsql as $$
begin
  perform set_config('app.actor', left(coalesce(p_actor, ''), 60), true);
  perform set_config('app.actor_email', left(coalesce(p_actor_email, ''), 254), true);
  perform set_config('app.client_id', left(coalesce(p_client_id, ''), 64), true);
  delete from assignments where id = p_id;
end $$;
