-- Phase 15: job posting with quotes, guests allowed (pgTAP).
-- Structure, privileges, the contact-blocking rule, and denied cases that need no seeded users.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_column('public', 'jobs', 'expires_at', 'jobs.expires_at');
select has_column('public', 'jobs', 'city', 'jobs.city');
select has_column('public', 'jobs', 'budget_min_pkr', 'jobs.budget_min_pkr');
select has_table('public', 'quote_events', 'quote_events exists');
select has_table('public', 'job_thread_messages', 'job_thread_messages exists');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'post_job', 'get_guest_job', 'job_quotes', 'list_open_jobs', 'get_board_job', 'worker_quote_job',
       'post_thread_message', 'list_thread', 'customer_accept_quote', 'claim_guest_job',
       'cancel_posted_job', 'expire_posted_jobs'
     )
     and p.prosecdef) = 12,
  'all job posting functions exist and are security definer'
);

select ok(exists (select 1 from public.app_settings where key = 'job_posting_enabled'), 'feature flag seeded');
select ok(exists (select 1 from public.faqs where slug = 'how-to-post-job-quotes'), 'FAQ entry seeded');

-- Guests must never touch the tables directly.
select ok(not has_table_privilege ('anon', 'public.jobs', 'insert'), 'anon cannot insert jobs directly');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and 'anon' = any (roles)), 'no policy lets anon read jobs (row-level security blocks it)');
select ok(not has_table_privilege ('anon', 'public.job_thread_messages', 'select'), 'anon cannot read threads directly');
select ok(not has_table_privilege ('authenticated', 'public.quote_events', 'select'), 'clients cannot read quote events');
select ok(not has_table_privilege ('authenticated', 'public.job_thread_messages', 'insert'), 'clients cannot write threads directly');

-- Guest-callable functions are token checked inside; everything else needs a session.
select ok(
  has_function_privilege ('anon', 'public.post_job(text,text,text,text,text,numeric,numeric,text)', 'execute')
  and has_function_privilege ('anon', 'public.get_guest_job(uuid)', 'execute')
  and has_function_privilege ('anon', 'public.job_quotes(uuid,uuid)', 'execute')
  and has_function_privilege ('anon', 'public.post_thread_message(uuid,uuid,text,uuid)', 'execute')
  and has_function_privilege ('anon', 'public.list_thread(uuid,uuid,uuid)', 'execute')
  and has_function_privilege ('anon', 'public.cancel_posted_job(uuid,uuid)', 'execute'),
  'guests can call the token-checked functions'
);
select ok(
  not has_function_privilege ('anon', 'public.list_open_jobs(text,text,int)', 'execute')
  and not has_function_privilege ('anon', 'public.get_board_job(uuid)', 'execute')
  and not has_function_privilege ('anon', 'public.worker_quote_job(uuid,numeric,text)', 'execute')
  and not has_function_privilege ('anon', 'public.customer_accept_quote(uuid)', 'execute')
  and not has_function_privilege ('anon', 'public.claim_guest_job(uuid)', 'execute'),
  'guests cannot use worker or account-only functions'
);
select ok(not has_function_privilege ('authenticated', 'public.expire_posted_jobs()', 'execute'), 'clients cannot run the expiry job');

-- Contact details are blocked in job text and messages.
select ok(public._contains_contact ('call me on 0300 1234567'), 'phone number is flagged');
select ok(public._contains_contact ('+92-300-1234567'), 'formatted phone number is flagged');
select ok(public._contains_contact ('see www.example.com'), 'link is flagged');
select ok(public._contains_contact ('email me a.b@example.pk'), 'email is flagged');
select ok(not public._contains_contact ('Fix tap in flat 12, floor 3, budget Rs 25000'), 'normal job text passes');
select ok(not public._contains_contact (null), 'null passes');

-- Denied cases without seeded users.
update public.app_settings set value = 'false'::jsonb where key = 'job_posting_enabled';
select throws_ok(
  $$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$,
  'job posting is not enabled',
  'posting is blocked while the flag is off'
);

update public.app_settings set value = 'true'::jsonb where key = 'job_posting_enabled';

select throws_ok(
  $$select * from public.post_job('Fix tap', 'short', 'plumber')$$,
  'please describe the job (at least 10 characters)',
  'description is required'
);
select throws_ok(
  $$select * from public.post_job('Fix tap', 'Leaking, call 0300 1234567 now', 'plumber')$$,
  'please do not include phone numbers or links; they are shared after a worker accepts',
  'phone numbers in the description are rejected, even for guests'
);
select throws_ok(
  $$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber', null, null, 5000, 1000)$$,
  'minimum budget cannot be above maximum budget',
  'reversed budget is rejected'
);

select is (
  (select count(*) from public.get_guest_job ('00000000-0000-0000-0000-0000000000f1')),
  0::bigint,
  'an unknown guest token returns nothing'
);
select throws_ok(
  $$select * from public.list_open_jobs()$$,
  'approved workers only',
  'the job board is for approved workers only'
);
select throws_ok(
  $$select public.customer_accept_quote('00000000-0000-0000-0000-0000000000c1')$$,
  'sign in to accept a quote',
  'a guest cannot accept a quote'
);

select * from finish ();
rollback;
