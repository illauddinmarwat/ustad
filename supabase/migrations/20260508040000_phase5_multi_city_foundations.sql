-- Phase 5 slice 1: multi-city rollout foundations (additive only).
-- Guardrails:
--   * Keep booking spine untouched (jobs, listings, applications, Rail A/B RPCs).
--   * All rollout controls stay behind app_settings flags (default false).
--   * New domain concerns live in side tables and admin-only write paths.

insert into public.app_settings (key, value) values
  ('phase5_multi_city_enabled', 'false'::jsonb),
  ('phase5_city_campaigns_enabled', 'false'::jsonb),
  ('phase5_city_community_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code)),
  name text not null,
  country_code text not null default 'PK',
  timezone text not null default 'Asia/Karachi',
  currency_code text not null default 'PKR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.city_rollout_configs (
  city_id uuid primary key references public.cities (id) on delete cascade,
  booking_enabled boolean not null default false,
  discovery_enabled boolean not null default false,
  campaigns_enabled boolean not null default false,
  community_enabled boolean not null default false,
  go_live_at timestamptz,
  notes text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.city_service_availability (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  template_id uuid not null references public.service_templates (id) on delete cascade,
  is_enabled boolean not null default false,
  rollout_stage text not null default 'off' check (rollout_stage in ('off', 'pilot', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, template_id)
);

create index if not exists idx_city_service_availability_city_stage
  on public.city_service_availability (city_id, rollout_stage, updated_at desc);

alter table public.cities enable row level security;
alter table public.city_rollout_configs enable row level security;
alter table public.city_service_availability enable row level security;

drop policy if exists "cities_select_all_authenticated" on public.cities;
create policy "cities_select_all_authenticated"
  on public.cities for select
  to authenticated
  using (true);

drop policy if exists "cities_admin_write" on public.cities;
create policy "cities_admin_write"
  on public.cities for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "city_rollout_configs_select_all_authenticated" on public.city_rollout_configs;
create policy "city_rollout_configs_select_all_authenticated"
  on public.city_rollout_configs for select
  to authenticated
  using (true);

drop policy if exists "city_rollout_configs_admin_write" on public.city_rollout_configs;
create policy "city_rollout_configs_admin_write"
  on public.city_rollout_configs for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "city_service_availability_select_all_authenticated" on public.city_service_availability;
create policy "city_service_availability_select_all_authenticated"
  on public.city_service_availability for select
  to authenticated
  using (true);

drop policy if exists "city_service_availability_admin_write" on public.city_service_availability;
create policy "city_service_availability_admin_write"
  on public.city_service_availability for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.phase5_effective_city_code ()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with enabled as (
    select coalesce(public.get_app_setting('phase5_multi_city_enabled'), 'false'::jsonb) = 'true'::jsonb as on_flag
  )
  select
    case
      when (select on_flag from enabled) then coalesce(
        (select c.code
         from public.cities c
         where c.is_active = true
         order by c.created_at asc
         limit 1),
        'karachi'
      )
      else 'karachi'
    end;
$$;

grant execute on function public.phase5_effective_city_code () to authenticated;

-- Internal rollout helper; execution remains unavailable to client roles.
create or replace function public.phase5_city_rollout_snapshot ()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'multi_city_enabled', coalesce(public.get_app_setting('phase5_multi_city_enabled'), 'false'::jsonb),
    'active_city_count', (select count(*) from public.cities where is_active = true),
    'configured_rollout_count', (select count(*) from public.city_rollout_configs),
    'service_rules_count', (select count(*) from public.city_service_availability)
  );
$$;

revoke all on function public.phase5_city_rollout_snapshot () from public;
revoke all on function public.phase5_city_rollout_snapshot () from anon;
revoke all on function public.phase5_city_rollout_snapshot () from authenticated;
revoke all on function public.phase5_city_rollout_snapshot () from service_role;
