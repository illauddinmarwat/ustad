-- Trigger keeps worker_profiles in sync after reviews.insert

begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_worker_profile_from_reviews'
  ),
  'sync_worker_profile_from_reviews exists'
);

select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and c.relname = 'reviews' and t.tgname = 'trg_reviews_sync_worker_profile'
  ),
  'trg_reviews_sync_worker_profile on reviews'
);

select * from finish();
rollback;
