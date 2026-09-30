-- Ustads can type a custom area at registration. Admins now see the area + address (and a flag when the
-- area is not in the managed list yet), and approving the worker adds that area to the city's area list.

drop function if exists public.admin_list_worker_approvals (text);

create function public.admin_list_worker_approvals (p_status text default null)
returns table (
  user_id uuid,
  display_name text,
  phone text,
  city text,
  area text,
  address text,
  area_is_new boolean,
  lat double precision,
  lng double precision,
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
    p.area,
    p.address,
    (
      nullif(btrim (p.area), '') is not null
      and not exists (
        select 1
        from public.city_areas ca
        join public.cities c on c.id = ca.city_id
        where lower (c.name) = lower (btrim (p.city))
          and lower (ca.name) = lower (btrim (p.area))
      )
    ) as area_is_new,
    wp.lat,
    wp.lng,
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

  -- A custom area typed at registration joins the city's managed list once the worker is approved.
  if p_status = 'approved' then
    insert into public.city_areas (city_id, name, sort_order)
    select
      c.id,
      btrim (p.area),
      coalesce ((select max (ca.sort_order) from public.city_areas ca where ca.city_id = c.id), 0) + 1
    from public.profiles p
    join public.cities c on lower (c.name) = lower (btrim (p.city))
    where p.id = p_user_id
      and nullif (btrim (p.area), '') is not null
      and not exists (
        select 1
        from public.city_areas ca
        where ca.city_id = c.id
          and lower (ca.name) = lower (btrim (p.area))
      )
    limit 1;
  end if;
end;
$$;

grant execute on function public.admin_set_worker_approval (uuid, text, text) to authenticated;
