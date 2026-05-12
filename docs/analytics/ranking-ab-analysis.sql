-- Ranking A/B cohort analysis (Phase 3)
-- Prerequisites: `ranking_impression` and `ranking_clicked` events include
-- `event_props->>'cohort'` (values: `control`, `ranking_v2`) from the mobile app.
-- Run in Supabase SQL editor or export `v_analytics_ranking_events` to your warehouse.

-- ─── Funnel counts by cohort (last 7 days) ───────────────────
with windowed as (
  select *
  from public.v_analytics_ranking_events
  where created_at >= now() - interval '7 days'
),
by_user_cohort as (
  select distinct on (user_id)
    user_id,
    coalesce(event_props->>'cohort', 'unknown') as cohort
  from windowed
  where event_name = 'ranking_impression'
  order by user_id, created_at asc
)
select
  b.cohort,
  count(*) filter (where w.event_name = 'ranking_impression') as impressions,
  count(*) filter (where w.event_name = 'ranking_clicked') as clicks,
  count(*) filter (where w.event_name = 'ranking_applied') as applies,
  count(*) filter (where w.event_name = 'ranking_quote_submitted') as quotes
from windowed w
left join by_user_cohort b on b.user_id = w.user_id
group by b.cohort
order by b.cohort;

-- ─── Click-through rate by cohort ─────────────────────────────
with imp as (
  select user_id, count(*)::numeric as n
  from public.app_events
  where event_name = 'ranking_impression'
    and created_at >= now() - interval '7 days'
  group by user_id
),
clk as (
  select user_id, count(*)::numeric as n
  from public.app_events
  where event_name = 'ranking_clicked'
    and created_at >= now() - interval '7 days'
  group by user_id
),
cohort as (
  select distinct on (user_id)
    user_id,
    coalesce(event_props->>'cohort', 'unknown') as cohort
  from public.app_events
  where event_name = 'ranking_impression'
    and created_at >= now() - interval '7 days'
  order by user_id, created_at asc
)
select
  c.cohort,
  sum(coalesce(clk.n, 0)) / nullif(sum(coalesce(imp.n, 0)), 0) as click_through_rate
from cohort c
left join imp on imp.user_id = c.user_id
left join clk on clk.user_id = c.user_id
group by c.cohort;
