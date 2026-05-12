-- Phase 5 slice 4: campaign primitives + attribution basics (additive).
-- Booking spine remains untouched.

insert into public.app_settings (key, value)
values ('phase5_attribution_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id) on delete set null,
  code text not null unique,
  name text not null,
  channel text not null check (channel in ('meta', 'google', 'tiktok', 'referral', 'organic', 'other')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  city_id uuid references public.cities (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attribution_touches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  session_key text,
  city_code text not null default 'karachi',
  campaign_id uuid references public.growth_campaigns (id) on delete set null,
  referral_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  event_name text not null default 'app_open',
  touch_mode text not null default 'fallback' check (touch_mode in ('tracked', 'flag_off_fallback', 'service_fallback')),
  touch_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attribution_touches_created_at on public.attribution_touches (created_at desc);
create index if not exists idx_attribution_touches_city on public.attribution_touches (city_code, created_at desc);
create index if not exists idx_attribution_touches_campaign on public.attribution_touches (campaign_id, created_at desc);
create index if not exists idx_referral_codes_owner on public.referral_codes (owner_user_id, created_at desc);

create trigger set_growth_campaigns_updated_at before update on public.growth_campaigns
  for each row execute function public.set_updated_at ();

create trigger set_referral_codes_updated_at before update on public.referral_codes
  for each row execute function public.set_updated_at ();

alter table public.growth_campaigns enable row level security;
alter table public.referral_codes enable row level security;
alter table public.attribution_touches enable row level security;

drop policy if exists "growth_campaigns_select_active_or_admin" on public.growth_campaigns;
create policy "growth_campaigns_select_active_or_admin"
  on public.growth_campaigns for select
  to authenticated
  using (
    is_active = true
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "growth_campaigns_admin_write" on public.growth_campaigns;
create policy "growth_campaigns_admin_write"
  on public.growth_campaigns for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "referral_codes_select_own_or_admin" on public.referral_codes;
create policy "referral_codes_select_own_or_admin"
  on public.referral_codes for select
  to authenticated
  using (
    owner_user_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "referral_codes_insert_own_or_admin" on public.referral_codes;
create policy "referral_codes_insert_own_or_admin"
  on public.referral_codes for insert
  to authenticated
  with check (
    owner_user_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "referral_codes_update_own_or_admin" on public.referral_codes;
create policy "referral_codes_update_own_or_admin"
  on public.referral_codes for update
  to authenticated
  using (
    owner_user_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  )
  with check (
    owner_user_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "attribution_touches_insert_own_or_anon" on public.attribution_touches;
create policy "attribution_touches_insert_own_or_anon"
  on public.attribution_touches for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid ());

drop policy if exists "attribution_touches_select_admin_only" on public.attribution_touches;
create policy "attribution_touches_select_admin_only"
  on public.attribution_touches for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.track_campaign_touch (
  p_session_key text default null,
  p_city_code text default null,
  p_event_name text default 'app_open',
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_referral_code text default null,
  p_touch_props jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_city_code text := coalesce(nullif(lower(trim(p_city_code)), ''), public.phase5_effective_city_code());
  v_mode text := 'tracked';
  v_campaign_id uuid;
begin
  if coalesce(public.get_app_setting('phase5_city_campaigns_enabled'), 'false'::jsonb) <> 'true'::jsonb
     or coalesce(public.get_app_setting('phase5_attribution_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    v_mode := 'flag_off_fallback';
  end if;

  if v_mode = 'tracked' and p_utm_campaign is not null and btrim(p_utm_campaign) <> '' then
    select c.id into v_campaign_id
    from public.growth_campaigns c
    where c.code = lower(trim(p_utm_campaign))
      and c.is_active = true
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
    limit 1;
  end if;

  if v_mode = 'tracked' and p_utm_campaign is not null and btrim(p_utm_campaign) <> '' and v_campaign_id is null then
    v_mode := 'service_fallback';
  end if;

  insert into public.attribution_touches (
    user_id,
    session_key,
    city_code,
    campaign_id,
    referral_code,
    utm_source,
    utm_medium,
    utm_campaign,
    event_name,
    touch_mode,
    touch_props
  ) values (
    auth.uid (),
    nullif(trim(p_session_key), ''),
    v_city_code,
    v_campaign_id,
    nullif(lower(trim(p_referral_code)), ''),
    nullif(lower(trim(p_utm_source)), ''),
    nullif(lower(trim(p_utm_medium)), ''),
    nullif(lower(trim(p_utm_campaign)), ''),
    coalesce(nullif(trim(p_event_name), ''), 'app_open'),
    v_mode,
    coalesce(p_touch_props, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.track_campaign_touch (text, text, text, text, text, text, text, jsonb) to authenticated;
