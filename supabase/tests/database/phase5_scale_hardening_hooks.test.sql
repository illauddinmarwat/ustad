begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'ops_rate_limit_events', 'ops_rate_limit_events table exists');
select has_table('public', 'ops_queue_attempts', 'ops_queue_attempts table exists');
select has_table('public', 'ops_notification_attempts', 'ops_notification_attempts table exists');

select is(
  public.get_app_setting('phase5_scale_hardening_enabled'),
  'false'::jsonb,
  'phase5_scale_hardening_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'log_rate_limit_event'
      and p.prosecdef
  ),
  'log_rate_limit_event exists and is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_log_queue_attempt'
      and p.prosecdef
  ),
  'admin_log_queue_attempt exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.log_rate_limit_event(text,text,text,integer,integer,jsonb)', 'EXECUTE'),
  true,
  'log_rate_limit_event execute granted to authenticated'
);

select is(
  has_function_privilege('authenticated', 'public.admin_log_queue_attempt(text,text,text,integer,integer,timestamp with time zone,integer,text,jsonb)', 'EXECUTE'),
  true,
  'admin_log_queue_attempt execute granted to authenticated'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_ops_rate_limit_events_endpoint'
  ),
  'ops rate limit endpoint index exists'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_ops_queue_attempts_queue_status'
  ),
  'ops queue index exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'set_ops_queue_attempts_updated_at'
  ),
  'ops_queue_attempts updated_at trigger exists'
);

select has_column('public', 'ops_rate_limit_events', 'decision', 'ops_rate_limit_events.decision column exists');

select has_column('public', 'ops_notification_attempts', 'channel', 'ops_notification_attempts.channel column exists');

select * from finish();
rollback;
