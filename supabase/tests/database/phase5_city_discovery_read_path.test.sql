begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase5_discover_listings'
      and p.prosecdef
  ),
  'phase5_discover_listings exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.phase5_discover_listings(text,text,integer,boolean)', 'EXECUTE'),
  true,
  'phase5_discover_listings execute granted to authenticated'
);

select is(
  public.get_app_setting('phase5_multi_city_enabled'),
  'false'::jsonb,
  'phase5 multi-city flag remains default false'
);

select has_function('public', 'phase5_discover_listings', array['text', 'text', 'integer', 'boolean'], 'phase5_discover_listings signature is stable');

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase5_discover_listings'
      and pg_get_function_result(p.oid) like '%city_code text%'
  ),
  'phase5_discover_listings return shape includes city_code'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase5_discover_listings'
      and pg_get_function_result(p.oid) like '%city_filtered boolean%'
  ),
  'phase5_discover_listings return shape includes city_filtered'
);

select is(
  public.phase5_effective_city_code(),
  'karachi',
  'phase5 deterministic city fallback unchanged'
);

select ok(
  (select count(*) from public.phase5_discover_listings(null, null, 5, false)) >= 0,
  'phase5_discover_listings is callable for ranking-disabled fallback path'
);

select * from finish();
rollback;
