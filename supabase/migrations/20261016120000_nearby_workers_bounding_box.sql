-- nearby_workers computed a great-circle distance for every approved worker on every call (O(workers) per
-- request). Add a latitude/longitude bounding box that an index can answer, so only workers near the
-- customer pay for the trigonometry. Results are identical: the box always contains the whole radius,
-- and the exact distance test still runs on the survivors.

create index if not exists idx_worker_profiles_geo
  on public.worker_profiles (lat, lng)
  where approval_status = 'approved' and lat is not null and lng is not null;

create or replace function public.nearby_workers (
  p_lat double precision,
  p_lng double precision,
  p_category text default null,
  p_limit int default 30
)
returns table (
  user_id uuid, display_name text, city text, bio text, categories text[], avg_rating numeric,
  review_count int, is_verified boolean, rate_pkr numeric, rate_unit text, years_experience int,
  photo_url text, distance_km double precision, is_available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select
      coalesce((select (value #>> '{}')::double precision from public.app_settings where key = 'nearby_radius_km'), 100) as radius_km,
      coalesce((select (value #>> '{}') = 'true' from public.app_settings where key = 'nearby_respect_working_hours'), true) as use_hours
  ),
  -- One degree of latitude is about 111.19 km; longitude shrinks with cos(latitude). The cosine is floored
  -- so the box stays valid (just wide) near the poles.
  box as (
    select
      p_lat - cfg.radius_km / 111.19 as lat_min,
      p_lat + cfg.radius_km / 111.19 as lat_max,
      p_lng - cfg.radius_km / (111.19 * greatest(0.01, cos(radians(p_lat)))) as lng_min,
      p_lng + cfg.radius_km / (111.19 * greatest(0.01, cos(radians(p_lat)))) as lng_max
    from cfg
  ),
  ranked as (
    select
      p.id as user_id, p.display_name, p.city, wp.bio, wp.categories, wp.avg_rating, wp.review_count,
      coalesce(wp.is_verified, false) as is_verified, wp.rate_pkr, wp.rate_unit, wp.years_experience, wp.photo_url,
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(wp.lat)) * cos(radians(wp.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(wp.lat))
        ))
      ) as distance_km,
      wp.is_available,
      wp.working_hours
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.user_id
    cross join box
    where p.role = 'worker'
      and p.status = 'active'
      and wp.approval_status = 'approved'
      and wp.lat between box.lat_min and box.lat_max
      and wp.lng between box.lng_min and box.lng_max
      and (p_category is null or wp.categories @> array[p_category])
  )
  select r.user_id, r.display_name, r.city, r.bio, r.categories, r.avg_rating, r.review_count,
         r.is_verified, r.rate_pkr, r.rate_unit, r.years_experience, r.photo_url, r.distance_km, r.is_available
  from ranked r, cfg
  where r.distance_km <= cfg.radius_km
    and (not cfg.use_hours or public._in_working_hours (r.working_hours))
  order by r.is_available desc, r.distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;
