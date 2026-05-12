-- Phase 5 slice 5: infra/ops scale hardening hooks (additive only).
-- No booking spine tables/functions are modified.

insert into public.app_settings (key, value)
values ('phase5_scale_hardening_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.ops_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  endpoint_key text not null,
  city_code text not null default 'karachi',
  decision text not null check (decision in ('allow', 'block', 'fallback_allow')),
  retry_after_seconds int check (retry_after_seconds is null or retry_after_seconds >= 0),
  window_seconds int check (window_seconds is null or window_seconds >= 0),
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_queue_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null,
  job_key text not null,
  status text not null check (status in ('queued', 'processing', 'retry_scheduled', 'succeeded', 'failed')),
  attempt int not null default 1 check (attempt >= 1),
  max_attempts int not null default 3 check (max_attempts >= 1),
  next_retry_at timestamptz,
  backoff_seconds int check (backoff_seconds is null or backoff_seconds >= 0),
  last_error text,
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('push', 'sms', 'email', 'whatsapp', 'in_app', 'other')),
  target_ref text not null,
  provider text,
  status text not null check (status in ('queued', 'sent', 'failed', 'retry_scheduled')),
  attempt int not null default 1 check (attempt >= 1),
  next_retry_at timestamptz,
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text,
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ops_rate_limit_events_time
  on public.ops_rate_limit_events (created_at desc);
create index if not exists idx_ops_rate_limit_events_endpoint
  on public.ops_rate_limit_events (endpoint_key, created_at desc);
create index if not exists idx_ops_queue_attempts_queue_status
  on public.ops_queue_attempts (queue_name, status, updated_at desc);
create index if not exists idx_ops_queue_attempts_job
  on public.ops_queue_attempts (job_key, attempt desc);
create index if not exists idx_ops_notification_attempts_channel_status
  on public.ops_notification_attempts (channel, status, created_at desc);

create trigger set_ops_queue_attempts_updated_at before update on public.ops_queue_attempts
  for each row execute function public.set_updated_at ();

alter table public.ops_rate_limit_events enable row level security;
alter table public.ops_queue_attempts enable row level security;
alter table public.ops_notification_attempts enable row level security;

drop policy if exists "ops_rate_limit_events_insert_own_or_anon" on public.ops_rate_limit_events;
create policy "ops_rate_limit_events_insert_own_or_anon"
  on public.ops_rate_limit_events for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid ());

drop policy if exists "ops_rate_limit_events_select_admin_only" on public.ops_rate_limit_events;
create policy "ops_rate_limit_events_select_admin_only"
  on public.ops_rate_limit_events for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "ops_queue_attempts_select_admin_only" on public.ops_queue_attempts;
create policy "ops_queue_attempts_select_admin_only"
  on public.ops_queue_attempts for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "ops_queue_attempts_admin_write" on public.ops_queue_attempts;
create policy "ops_queue_attempts_admin_write"
  on public.ops_queue_attempts for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "ops_notification_attempts_select_admin_only" on public.ops_notification_attempts;
create policy "ops_notification_attempts_select_admin_only"
  on public.ops_notification_attempts for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "ops_notification_attempts_admin_write" on public.ops_notification_attempts;
create policy "ops_notification_attempts_admin_write"
  on public.ops_notification_attempts for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.log_rate_limit_event (
  p_endpoint_key text,
  p_city_code text default null,
  p_decision text default 'allow',
  p_retry_after_seconds int default null,
  p_window_seconds int default null,
  p_event_props jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_decision text := coalesce(nullif(trim(p_decision), ''), 'allow');
begin
  if coalesce(public.get_app_setting('phase5_scale_hardening_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    v_decision := 'fallback_allow';
  end if;

  if v_decision not in ('allow', 'block', 'fallback_allow') then
    v_decision := 'fallback_allow';
  end if;

  insert into public.ops_rate_limit_events (
    user_id,
    endpoint_key,
    city_code,
    decision,
    retry_after_seconds,
    window_seconds,
    event_props
  ) values (
    auth.uid (),
    trim(p_endpoint_key),
    coalesce(nullif(lower(trim(p_city_code)), ''), public.phase5_effective_city_code()),
    v_decision,
    p_retry_after_seconds,
    p_window_seconds,
    coalesce(p_event_props, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_rate_limit_event (text, text, text, int, int, jsonb) to authenticated;

create or replace function public.admin_log_queue_attempt (
  p_queue_name text,
  p_job_key text,
  p_status text,
  p_attempt int default 1,
  p_max_attempts int default 3,
  p_next_retry_at timestamptz default null,
  p_backoff_seconds int default null,
  p_last_error text default null,
  p_event_props jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  insert into public.ops_queue_attempts (
    queue_name,
    job_key,
    status,
    attempt,
    max_attempts,
    next_retry_at,
    backoff_seconds,
    last_error,
    event_props
  ) values (
    trim(p_queue_name),
    trim(p_job_key),
    trim(p_status),
    greatest(coalesce(p_attempt, 1), 1),
    greatest(coalesce(p_max_attempts, 3), 1),
    p_next_retry_at,
    p_backoff_seconds,
    p_last_error,
    coalesce(p_event_props, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_log_queue_attempt (text, text, text, int, int, timestamptz, int, text, jsonb) to authenticated;
