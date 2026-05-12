-- Phase 4 slice 6: closeout hardening + KPI export helpers (additive only).
-- No booking-state changes.

create or replace view public.v_analytics_phase4_events as
select
  e.created_at,
  e.user_id,
  e.event_name,
  e.event_props
from public.app_events e
where e.event_name like 'phase4_%'
   or e.event_name in ('ranking_impression', 'ranking_clicked', 'ranking_applied');

comment on view public.v_analytics_phase4_events is
  'Phase 4 KPI-friendly app event subset (realtime, boosts, quality, web handoff). RLS still enforced by base table.';

create or replace function public.phase4_kpi_snapshot (
  p_window interval default interval '7 days'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - coalesce(p_window, interval '7 days') as start_at
  ),
  app_counts as (
    select
      count(*) filter (where e.event_name = 'phase4_worker_en_route_started') as realtime_enroute_starts,
      count(*) filter (where e.event_name = 'phase4_job_timer_started') as realtime_timer_starts,
      count(*) filter (where e.event_name = 'phase4_post_job_photo_prompt_submitted') as photo_prompts_submitted,
      count(*) filter (where e.event_name = 'phase4_job_micro_survey_submitted') as micro_surveys_submitted,
      count(*) filter (where e.event_name = 'phase4_guarantee_claim_intake_submitted') as claim_intakes_submitted,
      count(*) filter (where e.event_name = 'phase4_web_checkout_session_created') as web_checkout_sessions_created
    from public.app_events e
    join bounds b on e.created_at >= b.start_at
  ),
  promo_counts as (
    select
      count(*) filter (where p.event_name = 'impression') as promo_impressions,
      count(*) filter (where p.event_name = 'click') as promo_clicks
    from public.listing_promo_events p
    join bounds b on p.created_at >= b.start_at
  ),
  survey_counts as (
    select count(*) as survey_rows
    from public.job_quality_surveys s
    join bounds b on s.created_at >= b.start_at
  ),
  claim_counts as (
    select count(*) as claim_rows_open
    from public.guarantee_claim_intakes c
    join bounds b on c.created_at >= b.start_at
    where c.status in ('open', 'reviewing')
  ),
  checkout_counts as (
    select count(*) as checkout_rows
    from public.web_checkout_sessions w
    join bounds b on w.created_at >= b.start_at
  )
  select jsonb_build_object(
    'window', coalesce(p_window, interval '7 days')::text,
    'realtime_enroute_starts', a.realtime_enroute_starts,
    'realtime_timer_starts', a.realtime_timer_starts,
    'promo_impressions', p.promo_impressions,
    'promo_clicks', p.promo_clicks,
    'photo_prompts_submitted', a.photo_prompts_submitted,
    'micro_surveys_submitted', a.micro_surveys_submitted,
    'claim_intakes_submitted', a.claim_intakes_submitted,
    'web_checkout_sessions_created', a.web_checkout_sessions_created,
    'survey_rows', s.survey_rows,
    'claim_rows_open', c.claim_rows_open,
    'checkout_rows', w.checkout_rows
  )
  from app_counts a, promo_counts p, survey_counts s, claim_counts c, checkout_counts w;
$$;

-- Internal KPI snapshot helper; keep non-public.
revoke all on function public.phase4_kpi_snapshot (interval) from public;
revoke all on function public.phase4_kpi_snapshot (interval) from anon;
revoke all on function public.phase4_kpi_snapshot (interval) from authenticated;
revoke all on function public.phase4_kpi_snapshot (interval) from service_role;
