-- Admin dashboard: read-only, admin-only aggregates so the landing page loads in a few round trips.
-- Nothing here changes data.

-- ─── Action queues + headline totals (one row) ─────────────────────────────
create or replace function public.admin_dashboard_counts ()
returns table (
  pending_workers bigint,
  approved_workers bigint,
  rejected_workers bigint,
  customers bigint,
  pending_payments bigint,
  open_disputes bigint,
  overdue_dues_pkr numeric,
  overdue_30_plus_workers bigint,
  suspended_workers bigint,
  open_posted_jobs bigint,
  new_areas_pending bigint,
  approved_without_location bigint,
  approved_without_photo bigint,
  active_listings bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;

  return query
  select
    (select count (*) from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'pending'),
    (select count (*) from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'approved'),
    (select count (*) from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'rejected'),
    (select count (*) from public.profiles where role = 'customer'),
    (select count (*) from public.payment_ledger where status = 'pending'),
    (select count (*) from public.jobs where status = 'disputed'),
    coalesce ((select sum (commission_pkr) from public.worker_commission_ledger where status = 'overdue'), 0),
    (select count (distinct worker_id) from public.worker_commission_ledger
       where status = 'overdue' and current_date - due_date > 30),
    (select count (*) from public.worker_profiles where commission_suspended),
    (select count (*) from public.jobs where origin = 'customer_job' and status in ('open', 'quoted')),
    (select count (*) from public.worker_profiles wp
       join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'pending'
         and nullif (btrim (p.area), '') is not null
         and not exists (
           select 1 from public.city_areas ca join public.cities c on c.id = ca.city_id
           where lower (c.name) = lower (btrim (p.city)) and lower (ca.name) = lower (btrim (p.area))
         )),
    (select count (*) from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'approved' and (wp.lat is null or wp.lng is null)),
    (select count (*) from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
       where p.role = 'worker' and wp.approval_status = 'approved' and wp.photo_url is null),
    (select count (*) from public.worker_service_listings where status = 'active');
end;
$$;

revoke execute on function public.admin_dashboard_counts () from public, anon;
grant execute on function public.admin_dashboard_counts () to authenticated;

-- ─── KPI cards: this period vs the one before ──────────────────────────────
create or replace function public.admin_kpis (p_days int default 30)
returns table (
  earnings_pkr numeric,
  prev_earnings_pkr numeric,
  commission_pkr numeric,
  prev_commission_pkr numeric,
  jobs_completed bigint,
  prev_jobs_completed bigint,
  new_customers bigint,
  prev_new_customers bigint,
  new_workers bigint,
  prev_new_workers bigint,
  avg_rating numeric,
  prev_avg_rating numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d int := greatest (1, least (p_days, 365));
  cur_from timestamptz := now () - make_interval (days => d);
  prev_from timestamptz := now () - make_interval (days => d * 2);
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;

  return query
  select
    coalesce ((select sum (amount_pkr) from public.payment_ledger
                 where status = 'paid' and created_at >= cur_from), 0),
    coalesce ((select sum (amount_pkr) from public.payment_ledger
                 where status = 'paid' and created_at >= prev_from and created_at < cur_from), 0),
    coalesce ((select sum (l.commission_pkr) from public.worker_commission_ledger l
                 where l.created_at >= cur_from), 0),
    coalesce ((select sum (l.commission_pkr) from public.worker_commission_ledger l
                 where l.created_at >= prev_from and l.created_at < cur_from), 0),
    (select count (*) from public.jobs
       where status in ('completed', 'payment_pending', 'closed') and updated_at >= cur_from),
    (select count (*) from public.jobs
       where status in ('completed', 'payment_pending', 'closed')
         and updated_at >= prev_from and updated_at < cur_from),
    (select count (*) from public.profiles where role = 'customer' and created_at >= cur_from),
    (select count (*) from public.profiles
       where role = 'customer' and created_at >= prev_from and created_at < cur_from),
    (select count (*) from public.profiles where role = 'worker' and created_at >= cur_from),
    (select count (*) from public.profiles
       where role = 'worker' and created_at >= prev_from and created_at < cur_from),
    (select round (avg (rating)::numeric, 2) from public.reviews where created_at >= cur_from),
    (select round (avg (rating)::numeric, 2) from public.reviews
       where created_at >= prev_from and created_at < cur_from);
end;
$$;

revoke execute on function public.admin_kpis (int) from public, anon;
grant execute on function public.admin_kpis (int) to authenticated;

-- ─── Ustads and jobs by city and by skill category ─────────────────────────
create or replace function public.admin_breakdown (p_days int default 30)
returns table (
  dimension text,
  label text,
  workers bigint,
  jobs bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;

  return query
  with w_city as (
    select coalesce (nullif (btrim (p.city), ''), 'Unknown') as label, count (*) as n
    from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
    where p.role = 'worker' and wp.approval_status = 'approved'
    group by 1
  ),
  j_city as (
    select coalesce (nullif (btrim (j.city), ''), 'Unknown') as label, count (*) as n
    from public.jobs j
    where j.created_at >= now () - make_interval (days => greatest (1, least (p_days, 365)))
    group by 1
  ),
  w_cat as (
    select c as label, count (*) as n
    from public.worker_profiles wp join public.profiles p on p.id = wp.user_id
    cross join lateral unnest (wp.categories) as c
    where p.role = 'worker' and wp.approval_status = 'approved'
    group by 1
  ),
  j_cat as (
    select j.category as label, count (*) as n
    from public.jobs j
    where j.created_at >= now () - make_interval (days => greatest (1, least (p_days, 365)))
    group by 1
  )
  select 'city', l.label, coalesce (w.n, 0), coalesce (j.n, 0)
  from (select label from w_city union select label from j_city) l
  left join w_city w on w.label = l.label
  left join j_city j on j.label = l.label
  union all
  select 'category', l.label, coalesce (w.n, 0), coalesce (j.n, 0)
  from (select label from w_cat union select label from j_cat) l
  left join w_cat w on w.label = l.label
  left join j_cat j on j.label = l.label;
end;
$$;

revoke execute on function public.admin_breakdown (int) from public, anon;
grant execute on function public.admin_breakdown (int) to authenticated;

-- ─── Map: approved Ustads with a saved location ────────────────────────────
-- Coordinates are hidden from normal queries, so this is an admin-only function.
create or replace function public.admin_worker_map ()
returns table (
  user_id uuid,
  display_name text,
  phone text,
  city text,
  area text,
  categories text[],
  avg_rating numeric,
  lat double precision,
  lng double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;

  return query
  select p.id, p.display_name, p.phone, p.city, p.area, wp.categories, wp.avg_rating, wp.lat, wp.lng
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where p.role = 'worker'
    and wp.approval_status = 'approved'
    and wp.lat is not null
    and wp.lng is not null
  order by p.display_name;
end;
$$;

revoke execute on function public.admin_worker_map () from public, anon;
grant execute on function public.admin_worker_map () to authenticated;
