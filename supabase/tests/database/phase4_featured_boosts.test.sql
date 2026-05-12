begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'listing_boosts', 'listing_boosts table exists');
select has_table('public', 'listing_promo_events', 'listing_promo_events table exists');
select has_column('public', 'listing_boosts', 'boost_weight', 'listing_boosts.boost_weight exists');
select has_column('public', 'listing_promo_events', 'event_name', 'listing_promo_events.event_name exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rank_listings_with_boosts' and p.prosecdef
  ),
  'rank_listings_with_boosts is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'track_listing_promo_event' and p.prosecdef
  ),
  'track_listing_promo_event is security definer'
);

select is(
  public.get_app_setting('phase4_boosts_enabled'),
  'false'::jsonb,
  'phase4_boosts_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rank_listings_with_boosts'
      and pg_get_function_result(p.oid) like '%boosted_score numeric%'
  ),
  'rank_listings_with_boosts output exposes boosted_score'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_listing_promo_events_name_time'
  ),
  'listing promo events time index exists'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_listing_boosts_listing'
  ),
  'listing boosts index exists'
);

select is(
  (select count(*)::int from public.subscription_plans where code in ('worker_pro', 'customer_plus')),
  2,
  'slice 2 seeded plans still present'
);

select cmp_ok(
  (select count(*)::int from public.app_settings where key in ('phase4_realtime_enabled', 'phase4_subscriptions_enabled', 'phase4_boosts_enabled')),
  '>=',
  3,
  'phase4 flags are present together'
);

select * from finish();
rollback;
