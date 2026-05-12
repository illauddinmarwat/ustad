begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table('public', 'cities', 'cities table exists');
select has_table('public', 'city_rollout_configs', 'city_rollout_configs table exists');
select has_table('public', 'city_service_availability', 'city_service_availability table exists');

select has_column('public', 'cities', 'code', 'cities.code exists');
select has_column('public', 'city_rollout_configs', 'booking_enabled', 'city_rollout_configs.booking_enabled exists');
select has_column('public', 'city_service_availability', 'rollout_stage', 'city_service_availability.rollout_stage exists');

select is(
  public.get_app_setting('phase5_multi_city_enabled'),
  'false'::jsonb,
  'phase5_multi_city_enabled defaults false'
);

select is(
  public.get_app_setting('phase5_city_campaigns_enabled'),
  'false'::jsonb,
  'phase5_city_campaigns_enabled defaults false'
);

select is(
  public.get_app_setting('phase5_city_community_enabled'),
  'false'::jsonb,
  'phase5_city_community_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase5_effective_city_code'
      and p.prosecdef
  ),
  'phase5_effective_city_code exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.phase5_effective_city_code()', 'EXECUTE'),
  true,
  'phase5_effective_city_code execute granted to authenticated'
);

select is(
  has_function_privilege('authenticated', 'public.phase5_city_rollout_snapshot()', 'EXECUTE'),
  false,
  'phase5_city_rollout_snapshot execute revoked for authenticated'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_city_service_availability_city_stage'
  ),
  'city service availability index exists'
);

select is(
  public.phase5_effective_city_code(),
  'karachi',
  'deterministic fallback city code is karachi'
);

select * from finish();
rollback;
