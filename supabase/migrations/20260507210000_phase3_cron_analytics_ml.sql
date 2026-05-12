-- Phase 3 closeout: nightly backfill (pg_cron), analytics views, ML stub.
-- Additive only.

-- ─── Cron-safe backfill (no auth.uid — for pg_cron / database jobs only) ───
create or replace function public.cron_backfill_worker_signals ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  cnt int := 0;
begin
  for uid in
    select distinct worker_id from public.quotes where worker_id is not null
    union
    select distinct worker_id from public.jobs where worker_id is not null
  loop
    perform public.compute_worker_signals(uid);
    cnt := cnt + 1;
  end loop;
  return cnt;
end;
$$;

-- Not exposed via PostgREST: revoke default Supabase grants, keep postgres only.
revoke all on function public.cron_backfill_worker_signals () from public;
revoke all on function public.cron_backfill_worker_signals () from anon;
revoke all on function public.cron_backfill_worker_signals () from authenticated;
revoke all on function public.cron_backfill_worker_signals () from service_role;
grant execute on function public.cron_backfill_worker_signals () to postgres;

-- Nightly schedule: run manually on hosted Supabase after enabling the pg_cron
-- extension — see `docs/analytics/pg-cron-backfill.md`.

-- ─── Analytics views (RLS on app_events still applies; security invoker) ───
create or replace view public.v_analytics_app_events as
select id, user_id, event_name, event_props, created_at
from public.app_events;

comment on view public.v_analytics_app_events is
  'Warehouse-friendly export shape for app_events. SELECT still restricted by RLS (admin-only on base table).';

create or replace view public.v_analytics_ranking_events as
select id, user_id, event_name, event_props, created_at,
       event_props->>'cohort' as cohort
from public.app_events
where event_name in (
  'ranking_impression',
  'ranking_clicked',
  'ranking_applied',
  'ranking_quote_submitted'
);

comment on view public.v_analytics_ranking_events is
  'Subset of app_events for ranking funnel + cohort analysis.';

-- ─── ML candidate stub (optional Phase 3+ layer; returns no rows today) ───
create or replace function public.rank_listings_ml_candidates (
  p_category text default null,
  p_limit int default 30
)
returns table (
  listing_id uuid,
  ml_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid, null::numeric
  where false;
$$;

grant execute on function public.rank_listings_ml_candidates (text, int) to authenticated;

comment on function public.rank_listings_ml_candidates is
  'Placeholder for future ML candidate generation. Returns zero rows; rule-based rank_listings_v2 remains the source of truth.';
