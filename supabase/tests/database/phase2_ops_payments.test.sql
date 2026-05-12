begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'payment_ledger', 'payment_ledger exists');
select has_table('public', 'abuse_reports', 'abuse_reports exists');
select has_table('public', 'app_events', 'app_events exists');
select has_column('public', 'profiles', 'status', 'profiles has status');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_job_paid'
  ),
  'mark_job_paid function exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_set_user_status'
  ),
  'admin_set_user_status function exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_resolve_report'
  ),
  'admin_resolve_report function exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_update_payment_status'
  ),
  'admin_update_payment_status function exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_set_template_active'
  ),
  'admin_set_template_active function exists'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_payment_ledger_job'
  ),
  'payment ledger job index exists'
);

select * from finish();
rollback;
