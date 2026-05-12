-- Phase 1 schema & booking RPC smoke tests (pgTAP).
-- Run locally: `supabase test db` (requires Docker + Supabase CLI).

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'worker_profiles', 'worker_profiles exists');
select has_table('public', 'service_templates', 'service_templates exists');
select has_table('public', 'worker_service_listings', 'worker_service_listings exists');
select has_table('public', 'listing_applications', 'listing_applications exists');
select has_table('public', 'jobs', 'jobs exists');
select has_table('public', 'quotes', 'quotes exists');
select has_table('public', 'messages', 'messages exists');
select has_table('public', 'reviews', 'reviews exists');

select col_is_pk('public', 'profiles', 'id', 'profiles.pk id');
select col_is_pk('public', 'jobs', 'id', 'jobs.pk id');
select has_column('public', 'jobs', 'status', 'jobs.status');
select has_column('public', 'jobs', 'origin', 'jobs.origin');

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'quotes_one_accepted_per_job'
  ),
  'at most one accepted quote index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'jobs_one_per_listing_application'
  ),
  'one job per listing application partial unique index'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_accept_quote' and p.prosecdef
  ),
  'customer_accept_quote security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_confirm_booking' and p.prosecdef
  ),
  'customer_confirm_booking security definer'
);

select * from finish();
rollback;
