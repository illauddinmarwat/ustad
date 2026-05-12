begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table('public', 'web_checkout_sessions', 'web_checkout_sessions table exists');
select has_column('public', 'web_checkout_sessions', 'checkout_path', 'web_checkout_sessions.checkout_path exists');
select has_column('public', 'web_checkout_sessions', 'status', 'web_checkout_sessions.status exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_web_checkout_session' and p.prosecdef
  ),
  'create_web_checkout_session is security definer'
);

select is(
  public.get_app_setting('phase4_web_enabled'),
  'false'::jsonb,
  'phase4_web_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_web_checkout_sessions_customer'
  ),
  'web_checkout_sessions customer index exists'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_web_checkout_sessions_status'
  ),
  'web_checkout_sessions status index exists'
);

select cmp_ok(
  (select count(*)::int from public.app_settings where key like 'phase4_%_enabled'),
  '>=',
  5,
  'phase4 flags include web gate'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'web_checkout_sessions'
      and c.contype = 'c'
  ),
  'web_checkout_sessions has check constraints'
);

select * from finish();
rollback;
