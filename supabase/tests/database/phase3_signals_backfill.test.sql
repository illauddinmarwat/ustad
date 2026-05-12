-- Phase 3 slice 3c — ranking signal backfill.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'compute_worker_signals' and p.prosecdef
  ),
  'compute_worker_signals is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_backfill_worker_signals'
  ),
  'admin_backfill_worker_signals exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'refresh_my_worker_signals'
  ),
  'refresh_my_worker_signals exists'
);

-- Seed: insert worker + customer + 1 quote (accepted), 1 quote (pending),
-- 1 job assigned, 1 job completed; verify computed signals.
set local session_replication_role = replica;

do $$
declare
  w_id uuid := gen_random_uuid();
  c_id uuid := gen_random_uuid();
  job_id1 uuid;
  job_id2 uuid;
begin
  insert into public.profiles (id, role, display_name) values (w_id, 'worker', 'signals_test_worker');
  insert into public.profiles (id, role, display_name) values (c_id, 'customer', 'signals_test_customer');

  insert into public.jobs (id, customer_id, worker_id, title, category, status, origin, created_at, updated_at)
    values (gen_random_uuid(), c_id, w_id, 'job1', 'general', 'completed', 'customer_job', now() - interval '5 days', now() - interval '4 days')
    returning id into job_id1;
  insert into public.jobs (id, customer_id, worker_id, title, category, status, origin, created_at, updated_at)
    values (gen_random_uuid(), c_id, w_id, 'job2', 'general', 'assigned', 'customer_job', now() - interval '2 days', now() - interval '1 day')
    returning id into job_id2;

  insert into public.quotes (job_id, worker_id, amount_pkr, status, created_at)
    values (job_id1, w_id, 1000, 'accepted', now() - interval '6 days');
  insert into public.quotes (job_id, worker_id, amount_pkr, status, created_at)
    values (job_id2, w_id, 1000, 'pending', now() - interval '3 days');

  insert into public.messages (job_id, sender_id, body, created_at)
    values (job_id1, w_id, 'on the way', now() - interval '4 days');
end $$;

set local session_replication_role = origin;

-- Compute signals for our test worker.
select lives_ok(
  $$ select public.compute_worker_signals((select id from public.profiles where display_name = 'signals_test_worker')) $$,
  'compute_worker_signals runs without error'
);

-- response_rate = 1 accepted / 2 total = 0.5
select is(
  (select response_rate from public.worker_profiles where user_id = (select id from public.profiles where display_name = 'signals_test_worker')),
  0.500::numeric(4,3),
  'response_rate computed = 0.5 from 1 accepted / 2 quotes'
);

-- completion_rate = 1 completed / 2 (assigned+completed) = 0.5
select is(
  (select completion_rate from public.worker_profiles where user_id = (select id from public.profiles where display_name = 'signals_test_worker')),
  0.500::numeric(4,3),
  'completion_rate computed = 0.5 from 1 completed / 2 (assigned+completed)'
);

-- last_active_at populated
select isnt(
  (select last_active_at from public.worker_profiles where user_id = (select id from public.profiles where display_name = 'signals_test_worker')),
  null,
  'last_active_at populated by compute_worker_signals'
);

select * from finish();
rollback;
