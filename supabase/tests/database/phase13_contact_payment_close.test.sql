-- Phase 13: contact reveal, cash payment, closing, disputes, admin feed (pgTAP).
-- Structure, privileges, and denied cases that need no seeded users.

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table('public', 'job_contacts', 'job_contacts exists');
select has_table('public', 'admin_job_events', 'admin_job_events exists');
select has_column('public', 'payment_ledger', 'received_amount_pkr', 'ledger records received amount');

select ok(
  (select pg_get_constraintdef (oid) from pg_constraint where conname = 'jobs_status_check') like '%payment_pending%'
  and (select pg_get_constraintdef (oid) from pg_constraint where conname = 'jobs_status_check') like '%closed%'
  and (select pg_get_constraintdef (oid) from pg_constraint where conname = 'jobs_status_check') like '%disputed%',
  'jobs.status allows payment_pending, disputed, closed'
);

select ok(
  (select pg_get_constraintdef (oid) from pg_constraint where conname = 'payment_ledger_method_check') like '%cash%',
  'ledger method allows cash'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'customer_set_job_contact', 'get_job_contacts', 'get_my_contact_defaults', 'mark_job_paid',
       'worker_confirm_payment_received', 'flag_unconfirmed_payments', 'admin_resolve_job_dispute',
       'admin_list_job_events'
     )
     and p.prosecdef) = 8,
  'all phase 13 functions exist and are security definer'
);

-- Privacy: phone/address are not readable straight from tables.
select ok(
  not has_table_privilege ('authenticated', 'public.job_contacts', 'select'),
  'clients cannot read job_contacts directly'
);
select ok(
  not has_table_privilege ('authenticated', 'public.job_contacts', 'insert'),
  'clients cannot write job_contacts directly'
);
select ok(
  not has_column_privilege ('authenticated', 'public.profiles', 'phone', 'select'),
  'profiles.phone is not readable by signed-in users'
);
select ok(
  not has_column_privilege ('authenticated', 'public.profiles', 'address', 'select'),
  'profiles.address is not readable by signed-in users'
);
select ok(
  has_column_privilege ('authenticated', 'public.profiles', 'display_name', 'select')
  and has_column_privilege ('authenticated', 'public.profiles', 'role', 'select'),
  'other profile columns stay readable'
);
select ok(
  not has_table_privilege ('authenticated', 'public.admin_job_events', 'select'),
  'clients cannot read the admin feed table'
);

select ok(
  not exists (
    select 1 from pg_proc p, unnest (p.proargnames) as n
    where p.oid = 'public.nearby_workers(double precision,double precision,text,integer)'::regprocedure
      and n = 'phone'
  ),
  'nearby_workers no longer returns phone'
);

select ok(
  not has_function_privilege ('authenticated', 'public.flag_unconfirmed_payments()', 'execute'),
  'clients cannot run the dispute-flagging job'
);
select ok(
  not has_function_privilege ('anon', 'public.mark_job_paid(uuid,numeric,text,text)', 'execute'),
  'anon cannot mark paid'
);

select ok(
  exists (select 1 from public.app_settings where key = 'helpline_number'),
  'helpline placeholder seeded'
);
select ok(
  exists (select 1 from public.faqs where slug in ('when-is-my-number-shared', 'how-payment-works')),
  'privacy and payment FAQ entries seeded'
);

-- Denied cases without seeded users.
select set_config ('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config ('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.mark_job_paid('00000000-0000-0000-0000-0000000000c1', 100, 'cash', null)$$,
  'job not found',
  'cannot pay an unknown job'
);
select throws_ok(
  $$select public.worker_confirm_payment_received('00000000-0000-0000-0000-0000000000c1', 100)$$,
  'job not found',
  'cannot confirm receipt for an unknown job'
);
select throws_ok(
  $$select public.customer_set_job_contact('00000000-0000-0000-0000-0000000000c1', '0300-1234567', 'House 1, Street 2')$$,
  'job not found',
  'cannot share contact for an unknown job'
);
select is (
  (select count(*) from public.get_job_contacts ('00000000-0000-0000-0000-0000000000c1')),
  0::bigint,
  'no contacts for an unknown job'
);
select throws_ok(
  $$select * from public.admin_list_job_events(10)$$,
  'admin only',
  'non-admin cannot read the job feed'
);
select throws_ok(
  $$select public.admin_resolve_job_dispute('00000000-0000-0000-0000-0000000000c1', 'paid', 'x')$$,
  'admin only',
  'non-admin cannot resolve disputes'
);

select * from finish ();
rollback;
