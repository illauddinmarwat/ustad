-- 1) Admin handling of abuse reports (list with names, resolve or dismiss with a note).
-- 2) Crash and error reporting from the app, with no third-party service: the app sends each error to
--    log_client_error(), admins read them grouped by message.

-- ─── Abuse reports ────────────────────────────────────────────────────────
create or replace function public.admin_list_abuse_reports (
  p_status text default 'open',
  p_limit int default 200
)
returns table (
  id uuid, status text, reason text, admin_note text, created_at timestamptz, resolved_at timestamptz,
  job_id uuid, job_title text,
  reporter_id uuid, reporter_name text,
  reported_user_id uuid, reported_name text, reported_status text, reported_total int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  return query
  select
    r.id, r.status, r.reason, r.admin_note, r.created_at, r.resolved_at,
    r.job_id, j.title,
    r.reporter_id, rp.display_name,
    r.reported_user_id, tp.display_name, tp.status,
    (select count (*)::int from public.abuse_reports x where x.reported_user_id = r.reported_user_id)
  from public.abuse_reports r
  left join public.jobs j on j.id = r.job_id
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.reported_user_id
  where p_status is null or p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit greatest (1, least (coalesce (p_limit, 200), 500));
end;
$$;

create or replace function public.admin_resolve_abuse_report (
  p_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'status must be open, resolved or dismissed';
  end if;
  update public.abuse_reports
  set status = p_status,
      admin_note = nullif (btrim (coalesce (p_note, '')), ''),
      resolved_at = case when p_status = 'open' then null else now () end
  where id = p_id;
  if not found then
    raise exception 'report not found';
  end if;
end;
$$;

revoke all on function public.admin_list_abuse_reports (text, int) from public, anon;
revoke all on function public.admin_resolve_abuse_report (uuid, text, text) from public, anon;
grant execute on function public.admin_list_abuse_reports (text, int) to authenticated;
grant execute on function public.admin_resolve_abuse_report (uuid, text, text) to authenticated;

-- ─── Client errors ────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid (),
  user_id uuid references public.profiles (id) on delete set null,
  message text not null,
  stack text,
  component_stack text,
  fatal boolean not null default false,
  platform text,
  app_version text,
  created_at timestamptz not null default now ()
);
create index if not exists idx_client_errors_time on public.client_errors (created_at desc);
create index if not exists idx_client_errors_user_time on public.client_errors (user_id, created_at desc);

-- No direct access: writes go through log_client_error, reads through admin_list_client_errors.
alter table public.client_errors enable row level security;

create or replace function public.log_client_error (
  p_message text,
  p_stack text default null,
  p_component_stack text default null,
  p_fatal boolean default false,
  p_platform text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  n int;
begin
  if coalesce (btrim (p_message), '') = '' then
    return;
  end if;
  -- A crash loop must not flood the table: 30 per signed-in user per hour, 300 per hour for everyone signed out.
  if uid is not null then
    select count (*) into n from public.client_errors e
      where e.user_id = uid and e.created_at > now () - interval '1 hour';
    if n >= 30 then
      return;
    end if;
  else
    select count (*) into n from public.client_errors e
      where e.user_id is null and e.created_at > now () - interval '1 hour';
    if n >= 300 then
      return;
    end if;
  end if;
  insert into public.client_errors (user_id, message, stack, component_stack, fatal, platform, app_version)
  values (
    uid,
    left (p_message, 500),
    left (p_stack, 4000),
    left (p_component_stack, 2000),
    coalesce (p_fatal, false),
    left (p_platform, 20),
    left (p_app_version, 20)
  );
end;
$$;

revoke all on function public.log_client_error (text, text, text, boolean, text, text) from public;
grant execute on function public.log_client_error (text, text, text, boolean, text, text) to anon, authenticated;

create or replace function public.admin_list_client_errors (
  p_days int default 7
)
returns table (
  message text, occurrences int, users int, fatal boolean, platform text, app_version text,
  first_seen timestamptz, last_seen timestamptz, sample_stack text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  return query
  select
    e.message,
    count (*)::int,
    count (distinct e.user_id)::int,
    bool_or (e.fatal),
    max (e.platform),
    max (e.app_version),
    min (e.created_at),
    max (e.created_at),
    (array_agg (coalesce (e.component_stack, e.stack) order by e.created_at desc))[1]
  from public.client_errors e
  where e.created_at > now () - make_interval (days => greatest (1, least (coalesce (p_days, 7), 90)))
  group by e.message
  order by max (e.created_at) desc
  limit 200;
end;
$$;

revoke all on function public.admin_list_client_errors (int) from public, anon;
grant execute on function public.admin_list_client_errors (int) to authenticated;

-- Keep 30 days of errors.
create or replace function public.purge_client_errors ()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where created_at < now () - interval '30 days';
$$;

revoke all on function public.purge_client_errors () from public, anon, authenticated;
grant execute on function public.purge_client_errors () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('purge-client-errors', '30 3 * * *', 'select public.purge_client_errors ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;
