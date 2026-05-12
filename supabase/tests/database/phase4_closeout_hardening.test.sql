begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'v_analytics_phase4_events'
  ),
  'v_analytics_phase4_events view exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase4_kpi_snapshot'
      and p.prosecdef
  ),
  'phase4_kpi_snapshot exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.phase4_kpi_snapshot(interval)', 'EXECUTE'),
  false,
  'phase4_kpi_snapshot execute revoked for authenticated'
);

select ok(
  exists (
    select 1 from pg_views
    where schemaname = 'public'
      and viewname = 'v_analytics_phase4_events'
      and definition like '%phase4_%'
  ),
  'phase4 analytics view filters phase4 event namespace'
);

select cmp_ok(
  (select count(*)::int from public.app_settings where key like 'phase4_%_enabled'),
  '>=',
  5,
  'phase4 feature flag set remains intact'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase4_kpi_snapshot'
      and pg_get_function_result(p.oid) = 'jsonb'
  ),
  'phase4_kpi_snapshot returns jsonb'
);

select ok(
  exists (
    select 1 from pg_description d
    join pg_class c on c.oid = d.objoid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_analytics_phase4_events'
  ),
  'analytics view is documented with comment'
);

select * from finish();
rollback;
