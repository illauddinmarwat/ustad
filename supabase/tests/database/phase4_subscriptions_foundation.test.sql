begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_table('public', 'subscription_plans', 'subscription_plans table exists');
select has_table('public', 'user_subscriptions', 'user_subscriptions table exists');
select has_table('public', 'subscription_ledger_links', 'subscription_ledger_links table exists');
select has_column('public', 'subscription_plans', 'code', 'subscription_plans.code exists');
select has_column('public', 'user_subscriptions', 'status', 'user_subscriptions.status exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'subscribe_me_to_plan' and p.prosecdef
  ),
  'subscribe_me_to_plan is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_subscription_features' and p.prosecdef
  ),
  'get_my_subscription_features is security definer'
);

select is(
  public.get_app_setting('phase4_subscriptions_enabled'),
  'false'::jsonb,
  'phase4_subscriptions_enabled defaults false'
);

select cmp_ok(
  (select count(*)::int from public.subscription_plans where code in ('worker_pro', 'customer_plus') and is_active = true),
  '>=',
  2,
  'default plans seeded'
);

select is(
  has_function_privilege('authenticated', 'public.phase4_subscription_perks(text)', 'EXECUTE'),
  false,
  'phase4_subscription_perks execute revoked for authenticated'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_user_subscriptions_one_live'
  ),
  'partial unique index for one live subscription exists'
);

select * from finish();
rollback;
