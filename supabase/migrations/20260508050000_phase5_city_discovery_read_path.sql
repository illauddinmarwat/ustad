-- Phase 5 slice 2: city-aware discovery read path (additive only).
-- Keeps booking spine and Rail A/B RPCs untouched.

create or replace function public.phase5_discover_listings (
  p_city_code text default null,
  p_category text default null,
  p_limit int default 30,
  p_include_boosts boolean default false
)
returns table (
  id uuid,
  worker_id uuid,
  template_id uuid,
  headline text,
  detail_text text,
  price_pkr numeric,
  status text,
  created_at timestamptz,
  category text,
  worker_display_name text,
  rating numeric,
  review_count int,
  response_rate numeric,
  completion_rate numeric,
  recency_days numeric,
  is_verified boolean,
  score numeric,
  is_boosted boolean,
  boost_weight int,
  boosted_score numeric,
  city_code text,
  city_filtered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with runtime as (
    select
      (
        coalesce(public.get_app_setting('phase5_multi_city_enabled'), 'false'::jsonb) = 'true'::jsonb
      ) as multi_city_on,
      coalesce(nullif(lower(trim(p_city_code)), ''), public.phase5_effective_city_code()) as effective_city_code,
      greatest(coalesce(p_limit, 30), 1) as lim
  ),
  base as (
    select
      x.id,
      x.worker_id,
      x.template_id,
      x.headline,
      x.detail_text,
      x.price_pkr,
      x.status,
      x.created_at,
      x.category,
      x.worker_display_name,
      x.rating,
      x.review_count,
      x.response_rate,
      x.completion_rate,
      x.recency_days,
      x.is_verified,
      x.score,
      x.is_boosted,
      x.boost_weight,
      x.boosted_score
    from public.rank_listings_with_boosts(p_category, (select lim * 4 from runtime)) x
    where p_include_boosts = true

    union all

    select
      v.id,
      v.worker_id,
      v.template_id,
      v.headline,
      v.detail_text,
      v.price_pkr,
      v.status,
      v.created_at,
      v.category,
      v.worker_display_name,
      v.rating,
      v.review_count,
      v.response_rate,
      v.completion_rate,
      v.recency_days,
      v.is_verified,
      v.score,
      false as is_boosted,
      0::int as boost_weight,
      v.score as boosted_score
    from public.rank_listings_v2(p_category, (select lim * 4 from runtime)) v
    where p_include_boosts = false
  ),
  active_city as (
    select c.id, c.code
    from public.cities c
    join runtime r on true
    where c.code = r.effective_city_code
      and c.is_active = true
    limit 1
  ),
  allowed_templates as (
    select distinct s.template_id
    from public.city_service_availability s
    join active_city c on c.id = s.city_id
    where s.is_enabled = true
      and s.rollout_stage in ('pilot', 'live')
  ),
  city_filter_toggle as (
    select
      r.multi_city_on
      and exists (select 1 from active_city)
      and exists (select 1 from allowed_templates) as use_city_filter
    from runtime r
  )
  select
    b.id,
    b.worker_id,
    b.template_id,
    b.headline,
    b.detail_text,
    b.price_pkr,
    b.status,
    b.created_at,
    b.category,
    b.worker_display_name,
    b.rating,
    b.review_count,
    b.response_rate,
    b.completion_rate,
    b.recency_days,
    b.is_verified,
    b.score,
    b.is_boosted,
    b.boost_weight,
    b.boosted_score,
    (select effective_city_code from runtime) as city_code,
    (select use_city_filter from city_filter_toggle) as city_filtered
  from base b
  where
    (select use_city_filter from city_filter_toggle) = false
    or b.template_id in (select template_id from allowed_templates)
  order by b.boosted_score desc, b.created_at desc
  limit (select lim from runtime);
$$;

grant execute on function public.phase5_discover_listings (text, text, int, boolean) to authenticated;
