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
