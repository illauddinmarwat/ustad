-- Phase 4 slice 2: subscriptions foundation (additive, flag-gated).
-- No booking state machine changes.

insert into public.app_settings (key, value)
values ('phase4_subscriptions_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('worker_pro', 'customer_plus')),
  role_target text not null check (role_target in ('worker', 'customer')),
  title text not null,
  price_pkr numeric(12,2) not null check (price_pkr >= 0),
  billing_period text not null default 'monthly' check (billing_period in ('monthly')),
  perks jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at ();

insert into public.subscription_plans (code, role_target, title, price_pkr, billing_period, perks)
values
  ('worker_pro', 'worker', 'Worker Pro', 1499, 'monthly', '{"priority_badge": true, "insight_reports": true}'::jsonb),
  ('customer_plus', 'customer', 'Customer Plus', 999, 'monthly', '{"priority_support": true, "faster_match": true}'::jsonb)
on conflict (code) do update
set role_target = excluded.role_target,
    title = excluded.title,
    price_pkr = excluded.price_pkr,
    billing_period = excluded.billing_period,
    perks = excluded.perks,
    is_active = true,
    updated_at = now();

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  auto_renew boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_user_subscriptions_updated_at before update on public.user_subscriptions
  for each row execute function public.set_updated_at ();

create unique index if not exists idx_user_subscriptions_one_live
  on public.user_subscriptions (user_id)
  where status in ('trialing', 'active');

create index if not exists idx_user_subscriptions_user on public.user_subscriptions (user_id, created_at desc);

create table if not exists public.subscription_ledger_links (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions (id) on delete cascade,
  payment_ledger_id uuid not null references public.payment_ledger (id) on delete cascade,
  purpose text not null default 'renewal' check (purpose in ('initial', 'renewal', 'manual_adjustment')),
  created_at timestamptz not null default now(),
  unique (subscription_id, payment_ledger_id)
);

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_ledger_links enable row level security;

drop policy if exists "subscription_plans_read_all" on public.subscription_plans;
create policy "subscription_plans_read_all"
  on public.subscription_plans for select
  to authenticated
  using (is_active = true or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "subscription_plans_admin_write" on public.subscription_plans;
create policy "subscription_plans_admin_write"
  on public.subscription_plans for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "user_subscriptions_select_own_or_admin" on public.user_subscriptions;
create policy "user_subscriptions_select_own_or_admin"
  on public.user_subscriptions for select
  to authenticated
  using (
    user_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "subscription_ledger_links_select_own_or_admin" on public.subscription_ledger_links;
create policy "subscription_ledger_links_select_own_or_admin"
  on public.subscription_ledger_links for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_subscriptions s
      where s.id = subscription_ledger_links.subscription_id
        and (s.user_id = auth.uid () or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
    )
  );

create or replace function public.phase4_subscription_perks (p_plan_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select perks from public.subscription_plans where code = p_plan_code and is_active = true;
$$;

-- Internal helper: not exposed via PostgREST or client roles.
revoke all on function public.phase4_subscription_perks (text) from public;
revoke all on function public.phase4_subscription_perks (text) from anon;
revoke all on function public.phase4_subscription_perks (text) from authenticated;
revoke all on function public.phase4_subscription_perks (text) from service_role;

create or replace function public.subscribe_me_to_plan (p_plan_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role text;
  plan_row public.subscription_plans%rowtype;
  new_id uuid;
begin
  select role into profile_role from public.profiles where id = auth.uid ();
  if profile_role is null then
    raise exception 'profile not found';
  end if;

  select * into strict plan_row
  from public.subscription_plans
  where code = p_plan_code and is_active = true;

  if plan_row.role_target <> profile_role then
    raise exception 'plan not valid for role';
  end if;

  update public.user_subscriptions
  set status = 'cancelled',
      ends_at = now(),
      auto_renew = false,
      note = coalesce(note, 'Replaced by newer plan'),
      updated_at = now()
  where user_id = auth.uid ()
    and status in ('trialing', 'active');

  insert into public.user_subscriptions (user_id, plan_id, status, starts_at, auto_renew)
  values (auth.uid (), plan_row.id, 'active', now(), true)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.subscribe_me_to_plan (text) to authenticated;

create or replace function public.get_my_subscription_features ()
returns table (
  subscription_id uuid,
  plan_code text,
  status text,
  ends_at timestamptz,
  is_active boolean,
  perks jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as subscription_id,
    p.code as plan_code,
    s.status,
    s.ends_at,
    (s.status in ('trialing', 'active') and (s.ends_at is null or s.ends_at > now())) as is_active,
    p.perks
  from public.user_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = auth.uid ()
  order by s.created_at desc
  limit 1;
$$;

grant execute on function public.get_my_subscription_features () to authenticated;
