-- Nearby: only show Ustads within an admin-set radius who are inside their working hours.
--   * nearby_radius_km               how far "nearby" reaches (admin setting, default 100 km).
--   * nearby_respect_working_hours   hide Ustads outside their stated hours (admin setting, default on).
-- Working hours are stored as text like '09:00 AM – 06:00 PM' and are compared in Pakistan time.
-- A missing or unreadable value counts as "always available" so nobody vanishes because of a typo.

insert into public.app_settings (key, value) values
  ('nearby_radius_km', '100'::jsonb),
  ('nearby_respect_working_hours', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public._in_working_hours (p_hours text, p_now timestamptz default now())
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
  t_from time;
  t_to time;
  t_now time := (p_now at time zone 'Asia/Karachi')::time;
begin
  if p_hours is null or btrim(p_hours) = '' then
    return true;
  end if;
  parts := regexp_split_to_array(p_hours, '\s*[–-]\s*');
  if array_length(parts, 1) <> 2 then
    return true;
  end if;
  t_from := btrim(parts[1])::time;
  t_to := btrim(parts[2])::time;
  if t_from = t_to then
    return true;
  end if;
  if t_from < t_to then
    return t_now >= t_from and t_now <= t_to;
  end if;
  -- overnight shift, e.g. 10:00 PM – 06:00 AM
  return t_now >= t_from or t_now <= t_to;
exception when others then
  return true;
end;
$$;

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
    where p.role = 'worker'
      and p.status = 'active'
      and wp.lat is not null
      and wp.lng is not null
      and wp.approval_status = 'approved'
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

grant execute on function public.nearby_workers (double precision, double precision, text, int) to anon, authenticated;
