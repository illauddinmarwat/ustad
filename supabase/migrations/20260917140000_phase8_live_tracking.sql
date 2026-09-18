-- ─── Phase 8: live tracking (worker position while en route) ──────────────
-- Additive to phase4_realtime_lite's `job_realtime_states`. The worker app
-- pushes GPS updates via `worker_update_job_location` while `is_en_route`;
-- the customer's tracking screen polls the row (this codebase does not use
-- Supabase Realtime websockets anywhere yet — `job_realtime_states` select
-- already covers job participants, so a plain poll is consistent with how
-- `JobDetailScreen` already reads this table).

alter table public.job_realtime_states
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists location_updated_at timestamptz;

create or replace function public.worker_update_job_location (
  p_job_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns public.job_realtime_states
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  state_row public.job_realtime_states%rowtype;
begin
  select * into strict j from public.jobs where id = p_job_id;
  if j.worker_id is null or j.worker_id <> auth.uid () then
    raise exception 'worker only';
  end if;

  insert into public.job_realtime_states (job_id, worker_id, lat, lng, location_updated_at)
  values (p_job_id, auth.uid (), p_lat, p_lng, now())
  on conflict (job_id) do update
    set lat = excluded.lat,
        lng = excluded.lng,
        location_updated_at = excluded.location_updated_at,
        updated_at = now()
  returning * into state_row;

  return state_row;
end;
$$;

grant execute on function public.worker_update_job_location (uuid, double precision, double precision) to authenticated;
