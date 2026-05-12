-- Phase 4 slice 1: realtime field features (lite, additive only).
-- Keeps Phase 1/2 booking state machine intact.

insert into public.app_settings (key, value)
values ('phase4_realtime_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.job_realtime_states (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  is_en_route boolean not null default false,
  eta_bucket text check (eta_bucket in ('15m', '30m', '45m', '60m_plus')),
  timer_started_at timestamptz,
  timer_accum_seconds int not null default 0 check (timer_accum_seconds >= 0),
  started_work_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_realtime_worker on public.job_realtime_states (worker_id, updated_at desc);

alter table public.job_realtime_states enable row level security;

drop policy if exists "job_realtime_states_select_participants" on public.job_realtime_states;
create policy "job_realtime_states_select_participants"
  on public.job_realtime_states for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_realtime_states.job_id
        and (j.customer_id = auth.uid () or j.worker_id = auth.uid ())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "job_realtime_states_insert_worker_owner" on public.job_realtime_states;
create policy "job_realtime_states_insert_worker_owner"
  on public.job_realtime_states for insert
  to authenticated
  with check (worker_id = auth.uid ());

drop policy if exists "job_realtime_states_update_worker_owner" on public.job_realtime_states;
create policy "job_realtime_states_update_worker_owner"
  on public.job_realtime_states for update
  to authenticated
  using (worker_id = auth.uid ())
  with check (worker_id = auth.uid ());

create or replace function public.phase4_eta_bucket (p_eta_minutes int)
returns text
language plpgsql
immutable
as $$
begin
  if p_eta_minutes is null then
    return null;
  elsif p_eta_minutes <= 15 then
    return '15m';
  elsif p_eta_minutes <= 30 then
    return '30m';
  elsif p_eta_minutes <= 45 then
    return '45m';
  else
    return '60m_plus';
  end if;
end;
$$;

grant execute on function public.phase4_eta_bucket (int) to authenticated;

create or replace function public.worker_set_job_realtime_state (
  p_job_id uuid,
  p_is_en_route boolean default null,
  p_eta_minutes int default null,
  p_timer_running boolean default null
)
returns public.job_realtime_states
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  state_row public.job_realtime_states%rowtype;
  now_ts timestamptz := now();
  next_is_en_route boolean;
  next_eta_bucket text;
  next_timer_started_at timestamptz;
  next_timer_accum int;
  next_started_work_at timestamptz;
begin
  select * into strict j from public.jobs where id = p_job_id for update;
  if j.worker_id is null or j.worker_id <> auth.uid () then
    raise exception 'worker only';
  end if;
  if j.status not in ('assigned', 'completed') then
    raise exception 'job must be assigned or completed';
  end if;

  select * into state_row from public.job_realtime_states where job_id = p_job_id for update;
  if not found then
    insert into public.job_realtime_states (job_id, worker_id)
    values (p_job_id, auth.uid ())
    returning * into state_row;
  end if;

  next_is_en_route := coalesce(p_is_en_route, state_row.is_en_route);
  next_timer_started_at := state_row.timer_started_at;
  next_timer_accum := state_row.timer_accum_seconds;
  next_started_work_at := state_row.started_work_at;

  if p_timer_running is true and state_row.timer_started_at is null then
    next_timer_started_at := now_ts;
    next_started_work_at := coalesce(state_row.started_work_at, now_ts);
  elsif p_timer_running is false and state_row.timer_started_at is not null then
    next_timer_accum := state_row.timer_accum_seconds + greatest(0, floor(extract(epoch from (now_ts - state_row.timer_started_at)))::int);
    next_timer_started_at := null;
  end if;

  if next_is_en_route then
    next_eta_bucket := public.phase4_eta_bucket(coalesce(p_eta_minutes, 30));
  else
    next_eta_bucket := null;
  end if;

  update public.job_realtime_states
  set is_en_route = next_is_en_route,
      eta_bucket = next_eta_bucket,
      timer_started_at = next_timer_started_at,
      timer_accum_seconds = next_timer_accum,
      started_work_at = next_started_work_at,
      updated_at = now_ts
  where job_id = p_job_id
  returning * into state_row;

  return state_row;
end;
$$;

grant execute on function public.worker_set_job_realtime_state (uuid, boolean, int, boolean) to authenticated;
