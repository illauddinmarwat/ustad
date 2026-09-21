-- Phase 12: direct requests (pgTAP).
-- Structural checks plus denied-case behaviour that needs no seeded users.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_column('public', 'jobs', 'target_worker_id', 'jobs.target_worker_id');
select has_column('public', 'jobs', 'target_expires_at', 'jobs.target_expires_at');
select has_column('public', 'jobs', 'budget_pkr', 'jobs.budget_pkr');
select has_column('public', 'jobs', 'preferred_time', 'jobs.preferred_time');
select has_column('public', 'worker_profiles', 'is_available', 'worker_profiles.is_available');

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_jobs_target_worker'),
  'target worker index exists'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'create_direct_request', 'worker_accept_direct_request', 'worker_quote_direct_request',
       'worker_decline_direct_request', 'customer_accept_direct_quote', 'worker_set_availability',
       'expire_direct_requests'
     )
     and p.prosecdef) = 7,
  'all direct-request functions exist and are security definer'
);

select ok(
  exists (select 1 from public.app_settings where key = 'direct_requests_enabled'),
  'feature flag row seeded'
);

select ok(
  exists (select 1 from public.faqs where slug = 'how-to-request-worker'),
  'FAQ entry seeded'
);

select ok(
  not has_function_privilege('anon', 'public.create_direct_request(uuid,text,text,text,numeric,text,text)', 'execute'),
  'anon cannot create a direct request'
);

select ok(
  not has_function_privilege('authenticated', 'public.expire_direct_requests()', 'execute'),
  'clients cannot run the expiry job'
);

-- Behaviour without seeded users.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

update public.app_settings set value = 'false'::jsonb where key = 'direct_requests_enabled';
select throws_ok(
  $$select public.create_direct_request('00000000-0000-0000-0000-0000000000b1', 't', 'd', 'plumber')$$,
  'direct requests are not enabled',
  'blocked while feature flag is off'
);

update public.app_settings set value = 'true'::jsonb where key = 'direct_requests_enabled';

select throws_ok(
  $$select public.create_direct_request('00000000-0000-0000-0000-0000000000a1', 't', 'd', 'plumber')$$,
  'cannot request yourself',
  'cannot request yourself'
);

select throws_ok(
  $$select public.create_direct_request('00000000-0000-0000-0000-0000000000b1', ' ', 'd', 'plumber')$$,
  'title and description are required',
  'title is required'
);

select throws_ok(
  $$select public.create_direct_request('00000000-0000-0000-0000-0000000000b1', 't', 'd', 'plumber')$$,
  'worker not available for this category',
  'unknown / unapproved worker is rejected'
);

select throws_ok(
  $$select public.worker_decline_direct_request('00000000-0000-0000-0000-0000000000c1')$$,
  'request not found',
  'cannot act on a request that does not exist'
);

select * from finish();
rollback;
