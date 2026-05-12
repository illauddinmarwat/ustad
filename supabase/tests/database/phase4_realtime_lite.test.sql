-- Phase 4 slice 1: realtime field features (lite).

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'job_realtime_states', 'job_realtime_states table exists');
select has_column('public', 'job_realtime_states', 'is_en_route', 'is_en_route column exists');
select has_column('public', 'job_realtime_states', 'eta_bucket', 'eta_bucket column exists');
select has_column('public', 'job_realtime_states', 'timer_started_at', 'timer_started_at column exists');
select has_column('public', 'job_realtime_states', 'timer_accum_seconds', 'timer_accum_seconds column exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'worker_set_job_realtime_state'
      and p.prosecdef
  ),
  'worker_set_job_realtime_state exists and is security definer'
);

select is(public.phase4_eta_bucket(8), '15m', 'eta bucket <=15');
select is(public.phase4_eta_bucket(30), '30m', 'eta bucket <=30');
select is(public.phase4_eta_bucket(44), '45m', 'eta bucket <=45');
select is(public.phase4_eta_bucket(120), '60m_plus', 'eta bucket >45');

select * from finish();
rollback;
