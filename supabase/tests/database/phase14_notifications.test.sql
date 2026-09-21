-- Phase 14: notifications (pgTAP).
-- Structure, privileges, text rendering, and denied cases that need no seeded users.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'device_tokens', 'device_tokens exists');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('register_device_token', 'unregister_device_token', 'mark_notifications_read', '_notify', '_push_to_user')
     and p.prosecdef) = 5,
  'notification functions exist and are security definer'
);

select ok(
  (select count(*) from pg_trigger
   where tgname in ('trg_notify_job_change', 'trg_notify_quote', 'trg_notify_application', 'trg_notify_contact_shared')
     and not tgisinternal) = 4,
  'all four notification triggers exist'
);

-- Privileges: clients read only their own notifications, never write rows or read tokens.
select ok(has_table_privilege ('authenticated', 'public.notifications', 'select'), 'clients can select notifications (RLS limits to own)');
select ok(not has_table_privilege ('authenticated', 'public.notifications', 'insert'), 'clients cannot insert notifications');
select ok(not has_table_privilege ('authenticated', 'public.notifications', 'update'), 'clients cannot update notifications directly');
select ok(not has_table_privilege ('authenticated', 'public.device_tokens', 'select'), 'clients cannot read device tokens');
select ok(not has_table_privilege ('anon', 'public.notifications', 'select'), 'anon cannot read notifications');
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd = 'SELECT'),
  'notifications has a select policy'
);
select ok(not has_function_privilege ('authenticated', 'public._notify(uuid,text,uuid,jsonb)', 'execute'), 'clients cannot call _notify');
select ok(not has_function_privilege ('anon', 'public.register_device_token(text,text)', 'execute'), 'anon cannot register tokens');

-- Language: same event renders in Urdu and English.
select is (
  (select title from public._notification_text ('request_received', 'en', '{"job_title":"Fix tap"}'::jsonb)),
  'New request',
  'English title'
);
select is (
  (select title from public._notification_text ('request_received', 'ur', '{"job_title":"Fix tap"}'::jsonb)),
  'نئی درخواست',
  'Urdu title'
);
select ok(
  (select body from public._notification_text ('quote_received', 'en', '{"job_title":"Fix tap","amount":1500}'::jsonb)) like '%1500%Fix tap%',
  'quote text includes amount and job'
);
select ok(
  (select body from public._notification_text ('job_closed', null, '{"job_title":"Fix tap"}'::jsonb)) like '%Fix tap%'
  and (select title from public._notification_text ('job_closed', null, '{}'::jsonb)) = 'کام بند',
  'missing language defaults to Urdu'
);

-- Denied cases without a session / users.
select throws_ok(
  $$select public.register_device_token('ExponentPushToken[x]', 'android')$$,
  'sign in required',
  'must be signed in to register a token'
);
select set_config ('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config ('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  $$select public.register_device_token('  ', 'android')$$,
  'token is required',
  'blank token is rejected'
);
select is (
  (select public.mark_notifications_read (null)),
  0,
  'marking read with nothing unread is a no-op'
);

select * from finish ();
rollback;
