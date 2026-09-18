-- ─── Phase 9: admin web dashboard backend (payments, commission, reports, settings) ──
-- Additive only. `payment_ledger` already has `fee_pkr` (used here as the
-- commission amount in PKR) from phase2_ops_payments; this adds the fields
-- the blueprint's admin screens show that weren't captured yet, plus
-- read/aggregate RPCs so the new web app doesn't need raw table access
-- beyond what `payment_ledger_select_participants_or_admin` already grants.

alter table public.payment_ledger
  add column if not exists transaction_id text,
  add column if not exists worker_confirmed boolean not null default false,
  add column if not exists commission_pct numeric(5,2);

insert into public.app_settings (key, value)
values
  ('commission_rate_pct', '15'::jsonb),
  ('payment_methods', '{"easypaisa": true, "jazzcash": true, "cash": true}'::jsonb)
on conflict (key) do nothing;

-- ─── Admin: confirm a payment on the worker's behalf (manual reconciliation) ──
create or replace function public.admin_confirm_payment (
  p_payment_id uuid,
  p_worker_confirmed boolean
)
returns public.payment_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.payment_ledger%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  update public.payment_ledger
  set worker_confirmed = p_worker_confirmed
  where id = p_payment_id
  returning * into row_out;
  return row_out;
end;
$$;

grant execute on function public.admin_confirm_payment (uuid, boolean) to authenticated;

-- ─── Admin: commission dashboard summary + per-worker breakdown ───────────
create or replace function public.admin_commission_summary ()
returns table (
  total_earnings numeric,
  total_commission numeric,
  total_paid_to_workers numeric,
  total_jobs_paid bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount_pkr), 0) as total_earnings,
    coalesce(sum(fee_pkr), 0) as total_commission,
    coalesce(sum(amount_pkr - fee_pkr), 0) as total_paid_to_workers,
    count(*) as total_jobs_paid
  from public.payment_ledger
  where status = 'paid'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin');
$$;

grant execute on function public.admin_commission_summary () to authenticated;

create or replace function public.admin_worker_commission_breakdown (p_limit int default 20)
returns table (
  worker_id uuid,
  display_name text,
  city text,
  total_jobs bigint,
  total_commission numeric,
  net_paid numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.payee_id as worker_id,
    p.display_name,
    p.city,
    count(*) as total_jobs,
    coalesce(sum(pl.fee_pkr), 0) as total_commission,
    coalesce(sum(pl.amount_pkr - pl.fee_pkr), 0) as net_paid
  from public.payment_ledger pl
  join public.profiles p on p.id = pl.payee_id
  where pl.status = 'paid'
    and exists (select 1 from public.profiles a where a.id = auth.uid () and a.role = 'admin')
  group by pl.payee_id, p.display_name, p.city
  order by total_commission desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.admin_worker_commission_breakdown (int) to authenticated;

-- ─── Admin: reports & analytics ────────────────────────────────────────────
create or replace function public.admin_reports_summary (p_days int default 30)
returns table (
  total_earnings numeric,
  prev_total_earnings numeric,
  new_customers bigint,
  prev_new_customers bigint,
  avg_commission_pct numeric,
  active_workers bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(amount_pkr) from public.payment_ledger
      where status = 'paid' and created_at >= now() - (p_days || ' days')::interval), 0),
    coalesce((select sum(amount_pkr) from public.payment_ledger
      where status = 'paid'
        and created_at >= now() - (p_days * 2 || ' days')::interval
        and created_at < now() - (p_days || ' days')::interval), 0),
    coalesce((select count(*) from public.profiles
      where role = 'customer' and created_at >= now() - (p_days || ' days')::interval), 0),
    coalesce((select count(*) from public.profiles
      where role = 'customer'
        and created_at >= now() - (p_days * 2 || ' days')::interval
        and created_at < now() - (p_days || ' days')::interval), 0),
    coalesce((select avg(fee_pkr / nullif(amount_pkr, 0)) * 100 from public.payment_ledger
      where status = 'paid' and created_at >= now() - (p_days || ' days')::interval), 0),
    coalesce((select count(*) from public.worker_profiles wp
      join public.profiles p on p.id = wp.user_id
      where p.role = 'worker' and coalesce(wp.last_active_at, wp.updated_at) >= now() - (p_days || ' days')::interval), 0)
  where exists (select 1 from public.profiles a where a.id = auth.uid () and a.role = 'admin');
$$;

grant execute on function public.admin_reports_summary (int) to authenticated;

create or replace function public.admin_monthly_earnings (p_months int default 6)
returns table (
  month_start date,
  total_pkr numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('month', gs)::date as month_start,
    coalesce((
      select sum(pl.amount_pkr) from public.payment_ledger pl
      where pl.status = 'paid'
        and date_trunc('month', pl.created_at) = date_trunc('month', gs)
    ), 0) as total_pkr
  from generate_series(
    date_trunc('month', now()) - ((greatest(1, least(p_months, 24)) - 1) || ' months')::interval,
    date_trunc('month', now()),
    interval '1 month'
  ) as gs
  where exists (select 1 from public.profiles a where a.id = auth.uid () and a.role = 'admin')
  order by month_start asc;
$$;

grant execute on function public.admin_monthly_earnings (int) to authenticated;

create or replace function public.admin_top_workers (p_limit int default 5)
returns table (
  worker_id uuid,
  display_name text,
  avg_rating numeric,
  review_count int,
  total_jobs_paid bigint,
  total_earnings numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.payee_id as worker_id,
    p.display_name,
    wp.avg_rating,
    wp.review_count,
    count(*) as total_jobs_paid,
    coalesce(sum(pl.amount_pkr), 0) as total_earnings
  from public.payment_ledger pl
  join public.profiles p on p.id = pl.payee_id
  left join public.worker_profiles wp on wp.user_id = pl.payee_id
  where pl.status = 'paid'
    and exists (select 1 from public.profiles a where a.id = auth.uid () and a.role = 'admin')
  group by pl.payee_id, p.display_name, wp.avg_rating, wp.review_count
  order by total_earnings desc
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.admin_top_workers (int) to authenticated;
