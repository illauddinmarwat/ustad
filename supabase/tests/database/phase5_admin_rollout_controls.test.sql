begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_upsert_city'
      and p.prosecdef
  ),
  'admin_upsert_city exists and is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_set_city_rollout_config'
      and p.prosecdef
  ),
  'admin_set_city_rollout_config exists and is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_set_city_service_availability'
      and p.prosecdef
  ),
  'admin_set_city_service_availability exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.admin_upsert_city(text,text,text,text,text,boolean)', 'EXECUTE'),
  true,
  'admin_upsert_city execute granted to authenticated'
);

select is(
  has_function_privilege('authenticated', 'public.admin_set_city_rollout_config(text,boolean,boolean,boolean,boolean,timestamp with time zone,text)', 'EXECUTE'),
  true,
  'admin_set_city_rollout_config execute granted to authenticated'
);

select is(
  has_function_privilege('authenticated', 'public.admin_set_city_service_availability(text,uuid,boolean,text)', 'EXECUTE'),
  true,
  'admin_set_city_service_availability execute granted to authenticated'
);

-- Required tables from Slice 1 remain in place.
select has_table('public', 'cities', 'cities table still exists');
select has_table('public', 'city_rollout_configs', 'city_rollout_configs table still exists');
select has_table('public', 'city_service_availability', 'city_service_availability table still exists');

select is(
  public.get_app_setting('phase5_multi_city_enabled'),
  'false'::jsonb,
  'phase5 flag default remains false'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'city_service_availability_rollout_stage_check'
      or pg_get_constraintdef(oid) like '%rollout_stage in (''off'', ''pilot'', ''live'')%'
  ),
  'city_service_availability rollout stage constraint exists'
);

select * from finish();
rollback;
