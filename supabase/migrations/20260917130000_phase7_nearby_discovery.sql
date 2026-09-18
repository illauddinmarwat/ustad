-- ─── Phase 7: location & nearby-Ustad discovery ────────────────────────────
-- Workers publish their last-known lat/lng (client writes it directly via
-- the existing `worker_profiles_upsert_own` RLS policy — no new policy
-- needed). `nearby_workers` is SECURITY DEFINER so both guests (anon) and
-- signed-in customers can browse the directory, matching the existing
-- anon-guest-browse pattern used by `rank_listings_v2` etc.

alter table public.worker_profiles
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists location_updated_at timestamptz;

create or replace function public.nearby_workers (
  p_lat double precision,
  p_lng double precision,
  p_category text default null,
  p_limit int default 30
)
returns table (
  user_id uuid,
  display_name text,
  phone text,
  city text,
  bio text,
  categories text[],
  avg_rating numeric,
  review_count int,
  is_verified boolean,
  rate_pkr numeric,
  rate_unit text,
  years_experience int,
  photo_url text,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.display_name,
    p.phone,
    p.city,
    wp.bio,
    wp.categories,
    wp.avg_rating,
    wp.review_count,
    coalesce(wp.is_verified, false) as is_verified,
    wp.rate_pkr,
    wp.rate_unit,
    wp.years_experience,
    wp.photo_url,
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(wp.lat)) * cos(radians(wp.lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(wp.lat))
      ))
    ) as distance_km
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where p.role = 'worker'
    and wp.lat is not null
    and wp.lng is not null
    and (p_category is null or wp.categories @> array[p_category])
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.nearby_workers (double precision, double precision, text, int) to anon, authenticated;
