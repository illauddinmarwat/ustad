-- Phase 5 slice 3: admin rollout controls for multi-city.
-- Additive only; booking spine unchanged.

create or replace function public.admin_upsert_city (
  p_code text,
  p_name text,
  p_country_code text default 'PK',
  p_timezone text default 'Asia/Karachi',
  p_currency_code text default 'PKR',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  insert into public.cities (code, name, country_code, timezone, currency_code, is_active, updated_at)
  values (
    lower(trim(p_code)),
    trim(p_name),
    upper(coalesce(nullif(trim(p_country_code), ''), 'PK')),
    coalesce(nullif(trim(p_timezone), ''), 'Asia/Karachi'),
    upper(coalesce(nullif(trim(p_currency_code), ''), 'PKR')),
    coalesce(p_is_active, true),
    now()
  )
  on conflict (code) do update
    set name = excluded.name,
        country_code = excluded.country_code,
        timezone = excluded.timezone,
        currency_code = excluded.currency_code,
        is_active = excluded.is_active,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_city (text, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_set_city_rollout_config (
  p_city_code text,
  p_booking_enabled boolean,
  p_discovery_enabled boolean,
  p_campaigns_enabled boolean,
  p_community_enabled boolean,
  p_go_live_at timestamptz default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  select c.id into strict v_city_id
  from public.cities c
  where c.code = lower(trim(p_city_code));

  insert into public.city_rollout_configs (
    city_id,
    booking_enabled,
    discovery_enabled,
    campaigns_enabled,
    community_enabled,
    go_live_at,
    notes,
    updated_by,
    updated_at
  )
  values (
    v_city_id,
    coalesce(p_booking_enabled, false),
    coalesce(p_discovery_enabled, false),
    coalesce(p_campaigns_enabled, false),
    coalesce(p_community_enabled, false),
    p_go_live_at,
    p_notes,
    auth.uid (),
    now()
  )
  on conflict (city_id) do update
    set booking_enabled = excluded.booking_enabled,
        discovery_enabled = excluded.discovery_enabled,
        campaigns_enabled = excluded.campaigns_enabled,
        community_enabled = excluded.community_enabled,
        go_live_at = excluded.go_live_at,
        notes = excluded.notes,
        updated_by = auth.uid (),
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_city_rollout_config (text, boolean, boolean, boolean, boolean, timestamptz, text) to authenticated;

create or replace function public.admin_set_city_service_availability (
  p_city_code text,
  p_template_id uuid,
  p_is_enabled boolean,
  p_rollout_stage text default 'off'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  if p_rollout_stage not in ('off', 'pilot', 'live') then
    raise exception 'invalid rollout stage';
  end if;

  select c.id into strict v_city_id
  from public.cities c
  where c.code = lower(trim(p_city_code));

  insert into public.city_service_availability (
    city_id,
    template_id,
    is_enabled,
    rollout_stage,
    updated_at
  )
  values (
    v_city_id,
    p_template_id,
    coalesce(p_is_enabled, false),
    p_rollout_stage,
    now()
  )
  on conflict (city_id, template_id) do update
    set is_enabled = excluded.is_enabled,
        rollout_stage = excluded.rollout_stage,
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_city_service_availability (text, uuid, boolean, text) to authenticated;
