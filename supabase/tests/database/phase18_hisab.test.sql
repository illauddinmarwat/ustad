-- Phase 18: Hisab (worker commission ledger), settings audit, admin reporting (pgTAP).
-- Structure, privileges, the settings audit trigger (real behaviour), text, and denied cases.

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_table('public', 'worker_commission_ledger', 'commission ledger exists');
select has_table('public', 'commission_events', 'commission events exist');
select has_table('public', 'app_setting_audit', 'settings audit exists');
select has_column('public', 'worker_profiles', 'commission_suspended', 'worker_profiles.commission_suspended');
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_commission_worker_status'),
  'commission index exists'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.worker_commission_ledger'::regclass and contype = 'u'
  ),
  'one commission row per job (unique job_id)'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'mark_overdue_commissions', 'get_my_commission_summary', 'list_my_commissions',
       'admin_commission_balances', 'admin_list_commissions', 'admin_record_commission_settlement',
       'admin_waive_commission', 'admin_jobs_funnel', 'admin_list_posted_jobs', 'admin_close_posted_job',
       'admin_list_setting_audit'
     )
     and p.prosecdef) = 11,
  'all Hisab and admin functions exist and are security definer'
);

select ok(
  (select count(*) from pg_trigger
   where tgname in ('trg_create_commission_row', 'trg_audit_app_setting') and not tgisinternal) = 2,
  'commission and audit triggers exist'
);

-- Privileges
select ok(not has_table_privilege ('authenticated', 'public.commission_events', 'select'), 'clients cannot read commission events');
select ok(not has_table_privilege ('authenticated', 'public.app_setting_audit', 'select'), 'clients cannot read the settings audit');
select ok(
  has_table_privilege ('authenticated', 'public.worker_commission_ledger', 'select')
  and not has_table_privilege ('authenticated', 'public.worker_commission_ledger', 'insert')
  and not has_table_privilege ('authenticated', 'public.worker_commission_ledger', 'update'),
  'workers can read (RLS: own rows) but never write the ledger'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'worker_commission_ledger' and cmd = 'SELECT'),
  'ledger has a select policy'
);
select ok(
  not has_function_privilege ('anon', 'public.admin_waive_commission(uuid,text)', 'execute')
  and not has_function_privilege ('anon', 'public.get_my_commission_summary()', 'execute')
  and not has_function_privilege ('anon', 'public.admin_close_posted_job(uuid,text)', 'execute'),
  'anon cannot call Hisab or admin functions'
);
select ok(not has_function_privilege ('authenticated', 'public.mark_overdue_commissions()', 'execute'), 'clients cannot run the overdue job');
select ok(has_function_privilege ('anon', 'public._worker_active(uuid)', 'execute'), 'guests can browse listings (policy helper is callable)');

-- The settings audit trigger really records changes.
update public.app_settings set value = '15'::jsonb where key = 'commission_rate_pct';
update public.app_settings set value = '18'::jsonb where key = 'commission_rate_pct';
select ok(
  exists (
    select 1 from public.app_setting_audit
    where key = 'commission_rate_pct' and old_value = '15'::jsonb and new_value = '18'::jsonb
  ),
  'a settings change is audited with old and new values'
);
select is (
  (select count(*) from public.app_setting_audit where key = 'commission_rate_pct' and new_value = old_value),
  0::bigint,
  'no audit row for a no-op change'
);
update public.app_settings set value = '18'::jsonb where key = 'commission_rate_pct';
select is (
  (select count(*) from public.app_setting_audit where key = 'commission_rate_pct' and old_value = '18'::jsonb and new_value = '18'::jsonb),
  0::bigint,
  'saving the same value does not add a row'
);

-- Defaults for the overdue rules.
select ok(
  (select count(*) from public.app_settings where key in ('commission_due_days', 'commission_warn_days', 'commission_deactivate_days')) = 3,
  'due, warning and deactivation days are seeded'
);

-- Texts
select is (
  (select title from public._notification_text_hisab ('account_deactivated', 'en', '{"amount":500}'::jsonb)),
  'Account deactivated',
  'English deactivation title'
);
select ok(
  (select body from public._notification_text_hisab ('commission_created', 'en', '{"amount":300,"due":"01 Jan 2030"}'::jsonb)) like '%300%01 Jan 2030%',
  'commission text includes amount and due date'
);
select is (
  (select count(*) from public._notification_text_hisab ('job_closed', 'en', '{}'::jsonb)),
  0::bigint,
  'non-Hisab kinds fall through to the general texts'
);
select ok(not public._worker_active (null), 'a missing user is not active');

-- Denied cases without seeded users.
select throws_ok(
  $$select * from public.get_my_commission_summary()$$,
  'sign in required',
  'the summary needs a session'
);
select set_config ('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config ('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.admin_commission_balances()$$,
  'admin only',
  'non-admin cannot read balances'
);
select throws_ok(
  $$select public.admin_record_commission_settlement('00000000-0000-0000-0000-0000000000c1', 'cash')$$,
  'admin only',
  'non-admin cannot record a settlement'
);
select throws_ok(
  $$select public.admin_waive_commission('00000000-0000-0000-0000-0000000000c1', 'x')$$,
  'admin only',
  'non-admin cannot waive commission'
);

select * from finish ();
rollback;
