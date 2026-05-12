-- Phase 3 cron + analytics views + ML stub.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cron_backfill_worker_signals'
  ),
  'cron_backfill_worker_signals exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rank_listings_ml_candidates'
  ),
  'rank_listings_ml_candidates exists'
);

select ok(
  exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'v_analytics_app_events'
  ),
  'v_analytics_app_events view exists'
);

select ok(
  exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'v_analytics_ranking_events'
  ),
  'v_analytics_ranking_events view exists'
);

-- ML stub returns zero rows
select is(
  (select count(*)::int from public.rank_listings_ml_candidates(null, 10)),
  0,
  'rank_listings_ml_candidates returns no rows (stub)'
);

-- cron function is not executable by PUBLIC (revoked)
select ok(
  not has_function_privilege('anon', 'public.cron_backfill_worker_signals()', 'execute'),
  'cron_backfill_worker_signals not executable by anon'
);

select * from finish();
rollback;
