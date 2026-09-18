-- ─── Phase 11: admin approval gate for skilled-labor registration ─────────
-- Anyone signing up as a worker could previously publish active listings and
-- appear in nearby search immediately. This adds an approval_status gate,
-- enforced at the RLS layer (so every existing ranking/browse RPC that
-- already filters on listing status = 'active' stays correct with no
-- changes), plus admin RPCs to review and decide.

alter table public.worker_profiles
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists rejection_reason text,
  add column if not exists approval_reviewed_at timestamptz,
  add column if not exists approval_reviewed_by uuid references public.profiles (id) on delete set null;

-- Grandfather every worker that already existed before this migration so
-- nobody currently active gets silently locked out.
update public.worker_profiles set approval_status = 'approved';

-- ─── RLS gate: an 'active' listing requires an approved worker ─────────────
drop policy if exists "listings_manage_own_worker" on public.worker_service_listings;
create policy "listings_manage_own_worker"
  on public.worker_service_listings for insert
  to authenticated
  with check (
    worker_id = auth.uid ()
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'worker')
    and (
      status <> 'active'
      or exists (select 1 from public.worker_profiles wp where wp.user_id = auth.uid () and wp.approval_status = 'approved')
    )
  );

drop policy if exists "listings_update_own" on public.worker_service_listings;
create policy "listings_update_own"
  on public.worker_service_listings for update
  to authenticated
  using (worker_id = auth.uid ())
  with check (
    worker_id = auth.uid ()
    and (
      status <> 'active'
      or exists (select 1 from public.worker_profiles wp where wp.user_id = auth.uid () and wp.approval_status = 'approved')
    )
  );

-- ─── nearby_workers: hide unapproved workers from the directory ───────────
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
    and coalesce(wp.approval_status, 'approved') = 'approved'
    and (p_category is null or wp.categories @> array[p_category])
  order by distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.nearby_workers (double precision, double precision, text, int) to anon, authenticated;

-- ─── Admin: list workers by approval status ────────────────────────────────
create or replace function public.admin_list_worker_approvals (p_status text default null)
returns table (
  user_id uuid,
  display_name text,
  phone text,
  city text,
  cnic_number text,
  categories text[],
  years_experience int,
  rate_pkr numeric,
  rate_unit text,
  working_hours text,
  bio text,
  photo_url text,
  cnic_front_url text,
  cnic_back_url text,
  approval_status text,
  rejection_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.phone,
    p.city,
    wp.cnic_number,
    wp.categories,
    wp.years_experience,
    wp.rate_pkr,
    wp.rate_unit,
    wp.working_hours,
    wp.bio,
    wp.photo_url,
    wp.cnic_front_url,
    wp.cnic_back_url,
    wp.approval_status,
    wp.rejection_reason,
    p.created_at
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where p.role = 'worker'
    and (p_status is null or wp.approval_status = p_status)
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_worker_approvals (text) to authenticated;

-- ─── Admin: approve / reject / reset a worker ──────────────────────────────
create or replace function public.admin_set_worker_approval (
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'invalid status';
  end if;

  update public.worker_profiles
  set approval_status = p_status,
      rejection_reason = case when p_status = 'rejected' then p_reason else null end,
      approval_reviewed_at = now(),
      approval_reviewed_by = auth.uid (),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

grant execute on function public.admin_set_worker_approval (uuid, text, text) to authenticated;
