-- Phase 4 (job posting, guests, quotes, threads): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(153);

-- ─── Test helpers (created inside this transaction, rolled back at the end) ───
--   _t_id(name)      stable uuids for the seeded people
--   _t_seed()        creates them through the real signup trigger
--   _t_as(name)      act as that signed-in user (role `authenticated`, auth.uid() set)
--   _t_as_anon()     act as a guest (role `anon`)
--   reset role;      back to the test owner (sees everything, bypasses row-level security)
-- People: c1 Ali and c2 Bilal (customers), w1 Usman and w2 Zaid (approved plumbers),
-- w3 Hamid (approved electrician), w4 Pending (plumber, not approved), adm Admin.

create function public._t_id (n text) returns uuid language sql immutable as $$
  select (case n
    when 'c1' then '10000000-0000-0000-0000-000000000001'
    when 'c2' then '10000000-0000-0000-0000-000000000002'
    when 'w1' then '20000000-0000-0000-0000-000000000001'
    when 'w2' then '20000000-0000-0000-0000-000000000002'
    when 'w3' then '20000000-0000-0000-0000-000000000003'
    when 'w4' then '20000000-0000-0000-0000-000000000004'
    when 'adm' then '30000000-0000-0000-0000-000000000001'
    else '99999999-9999-9999-9999-999999999999' end)::uuid;
$$;

create function public._t_mk_user (p_id uuid, p_role text, p_name text, p_phone text default null,
  p_address text default null, p_skill text default null, p_lang text default 'en', p_approved boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_name || '@test.local', jsonb_build_object (
    'role', case when p_role = 'admin' then 'customer' else p_role end,
    'display_name', p_name, 'phone', p_phone, 'address', p_address, 'skill_category', p_skill,
    'preferred_language', p_lang, 'city', 'Karachi', 'cnic_number', '4210112345671',
    'rate_pkr', 800, 'rate_unit', 'hour'));
  if p_role = 'admin' then update public.profiles set role = 'admin' where id = p_id; end if;
  if p_role = 'worker' then
    update public.worker_profiles
      set approval_status = case when p_approved then 'approved' else 'pending' end,
          lat = 24.86, lng = 67.00, avg_rating = 4.5, review_count = 3
      where user_id = p_id;
  end if;
end $$;

create function public._t_seed () returns void language plpgsql as $$
begin
  perform public._t_mk_user (public._t_id ('c1'), 'customer', 'Ali', '0300-1111111', 'House 1, Street 2, DHA', null, 'en');
  perform public._t_mk_user (public._t_id ('c2'), 'customer', 'Bilal', '0300-3333333', 'Flat 5, Gulshan', null, 'ur');
  perform public._t_mk_user (public._t_id ('w1'), 'worker', 'Usman', '0311-2222222', null, 'plumber', 'en');
  perform public._t_mk_user (public._t_id ('w2'), 'worker', 'Zaid', '0311-4444444', null, 'plumber', 'en');
  perform public._t_mk_user (public._t_id ('w3'), 'worker', 'Hamid', '0311-5555555', null, 'electrician', 'en');
  perform public._t_mk_user (public._t_id ('w4'), 'worker', 'Pending', '0311-6666666', null, 'plumber', 'en', false);
  perform public._t_mk_user (public._t_id ('adm'), 'admin', 'Admin', '0300-9999999', null, null, 'en');
end $$;

create function public._t_as (n text) returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', public._t_id (n)::text, true);
  perform set_config ('request.jwt.claims', json_build_object ('sub', public._t_id (n)::text, 'role', 'authenticated')::text, true);
  perform set_config ('role', 'authenticated', true);
end $$;

create function public._t_as_anon () returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', '', true);
  perform set_config ('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config ('role', 'anon', true);
end $$;

create function public._t_setting (k text, v jsonb) returns void language plpgsql as $$
begin
  insert into public.app_settings (key, value) values (k, v)
  on conflict (key) do update set value = excluded.value;
end $$;

-- A person's notification of a kind, as text "title | body". Rows created in one transaction share a
-- timestamp, so pick the one you mean with an optional pattern for the body (e.g. '%Fix tank').
create function public._t_notif (n text, k text, m text default '%') returns text language sql stable as $$
  select title || ' | ' || body from public.notifications
  where user_id = public._t_id (n) and kind = k and body like m order by id limit 1;
$$;

select public._t_seed ();

select public._t_setting ('direct_requests_enabled', 'true'::jsonb);
select public._t_setting ('direct_request_daily_limit', '50'::jsonb);
select public._t_setting ('job_post_daily_limit', '50'::jsonb);
select public._t_setting ('guest_job_hourly_cap', '500'::jsonb);

-- ─── Flag ────────────────────────────────────────────────────────────────
select public._t_setting ('job_posting_enabled', 'false'::jsonb);
select public._t_as_anon ();
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'job posting is not enabled', 'posting is blocked while the flag is off');
reset role;
select public._t_setting ('job_posting_enabled', 'true'::jsonb);

-- ─── A guest posts a job ─────────────────────────────────────────────────
select public._t_as_anon ();
with r as (select * from public.post_job ('Fix kitchen tap', 'The kitchen tap is leaking badly', 'plumber', 'Karachi', 'Gulshan', 1000, 2000, 'tomorrow'))
select set_config ('t.gj', (select job_id from r)::text, true), set_config ('t.gt', (select guest_token from r)::text, true);
reset role;

select ok(current_setting ('t.gt') <> '', 'a guest gets a secret token back');
select is ((select customer_id from public.jobs where id = current_setting ('t.gj')::uuid), null::uuid, 'the guest job has no customer yet');
select is ((select posted_by_anon from public.jobs where id = current_setting ('t.gj')::uuid), true, 'it is marked as a guest post');
select is ((select anon_post_token::text from public.jobs where id = current_setting ('t.gj')::uuid), current_setting ('t.gt'), 'the token is stored on the job');
select is ((select status from public.jobs where id = current_setting ('t.gj')::uuid), 'open', 'the job is open');
select is ((select origin from public.jobs where id = current_setting ('t.gj')::uuid), 'customer_job', 'it is a customer job');
select is ((select city from public.jobs where id = current_setting ('t.gj')::uuid), 'Karachi', 'the city is stored');
select is ((select budget_min_pkr from public.jobs where id = current_setting ('t.gj')::uuid), 1000::numeric, 'the budget range is stored');
select ok(
  (select expires_at from public.jobs where id = current_setting ('t.gj')::uuid) between now () + interval '6 days 23 hours' and now () + interval '7 days 1 hour',
  'the job expires in about 7 days'
);
select is ((select count(*) from public.job_contacts), 0::bigint, 'no phone or address is collected when posting');

select public._t_as_anon ();
select is ((select title from public.get_guest_job (current_setting ('t.gt')::uuid)), 'Fix kitchen tap', 'the guest can read their job with the token');
select is ((select quote_count from public.get_guest_job (current_setting ('t.gt')::uuid)), 0::bigint, 'and sees how many quotes it has');
select is ((select count(*) from public.get_guest_job (gen_random_uuid ())), 0::bigint, 'a wrong token returns nothing');
select is ((select count(*) from public.get_guest_job (null)), 0::bigint, 'a missing token returns nothing');
select is ((select count(*) from public.jobs), 0::bigint, 'a guest cannot list jobs from the table');
select throws_ok($$insert into public.jobs (title, category, origin, posted_by_anon, anon_post_token) values ('x', 'plumber', 'customer_job', true, gen_random_uuid())$$, '42501', null, 'a guest cannot insert into jobs directly');
select throws_ok($$select * from public.job_thread_messages$$, '42501', null, 'a guest cannot read threads directly');
reset role;

-- ─── What a poster may write ─────────────────────────────────────────────
select public._t_as_anon ();
select throws_ok($$select * from public.post_job('Fix tap', 'short', 'plumber')$$, 'please describe the job (at least 10 characters)', 'a too-short description is rejected');
select throws_ok($$select * from public.post_job('', 'The kitchen tap is leaking badly', 'plumber')$$, 'a title of up to 120 characters is required', 'a blank title is rejected');
select throws_ok($$select * from public.post_job(repeat('x', 121), 'The kitchen tap is leaking badly', 'plumber')$$, 'a title of up to 120 characters is required', 'a very long title is rejected');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', '')$$, 'category is required', 'a blank category is rejected');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber', null, null, 5000, 1000)$$, 'minimum budget cannot be above maximum budget', 'a reversed budget is rejected');
select throws_ok($$select * from public.post_job('Fix tap', 'Tap leaks, call 0300 1234567', 'plumber')$$, 'please do not include phone numbers or links; they are shared after a worker accepts', 'a phone number in the description is rejected');
select throws_ok($$select * from public.post_job('Fix tap www.example.com', 'The kitchen tap is leaking badly', 'plumber')$$, 'please do not include phone numbers or links; they are shared after a worker accepts', 'a link in the title is rejected');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber', null, 'mail me a@b.com')$$, 'please do not include phone numbers or links; they are shared after a worker accepts', 'an email in the area is rejected');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber', null, null, null, null, 'whatsapp me')$$, 'please do not include phone numbers or links; they are shared after a worker accepts', 'a chat handle in the time is rejected');
select lives_ok($$select * from public.post_job('Fix tap', 'Flat 12, floor 3, budget Rs 25000 for the work', 'plumber')$$, 'ordinary numbers in the text are fine');
reset role;

-- ─── Signed-in customers, and who may not post ───────────────────────────
select public._t_as ('c1');
with r as (select * from public.post_job ('Fix bathroom tap', 'The bathroom tap will not close', 'plumber', 'Karachi'))
select set_config ('t.cj', (select job_id from r)::text, true), set_config ('t.cj_tok', coalesce ((select guest_token::text from r), 'none'), true);
reset role;
select is (current_setting ('t.cj_tok'), 'none', 'a signed-in customer gets no guest token');
select is ((select customer_id from public.jobs where id = current_setting ('t.cj')::uuid), public._t_id ('c1'), 'the job belongs to the customer');
select is ((select posted_by_anon from public.jobs where id = current_setting ('t.cj')::uuid), false, 'and is not a guest post');

select public._t_as ('w1');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'only active customers can post jobs', 'a worker cannot post a job');
select public._t_as ('adm');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'only active customers can post jobs', 'an admin cannot post a job');
reset role;
update public.profiles set status = 'suspended' where id = public._t_id ('c2');
select public._t_as ('c2');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'only active customers can post jobs', 'a suspended customer cannot post');
reset role;
update public.profiles set status = 'active' where id = public._t_id ('c2');

-- ─── Limits ──────────────────────────────────────────────────────────────
select public._t_setting ('job_post_daily_limit', '2'::jsonb);
select public._t_as ('c2');
select lives_ok($$select * from public.post_job('First job', 'The first job description', 'electrician')$$, 'the first job today is allowed');
select lives_ok($$select * from public.post_job('Second job', 'The second job description', 'plumber')$$, 'the second job today is allowed');
select throws_ok($$select * from public.post_job('Third job', 'The third job description', 'plumber')$$, 'daily job limit reached', 'the daily limit stops the third');
reset role;
select public._t_setting ('job_post_daily_limit', '50'::jsonb);
select public._t_setting ('guest_job_hourly_cap', ((select count(*) from public.jobs where posted_by_anon and created_at > now () - interval '1 hour') + 1)::text::jsonb);
select public._t_as_anon ();
select lives_ok($$select * from public.post_job('Guest one', 'A guest job description here', 'plumber')$$, 'a guest can post while under the hourly cap');
select throws_ok($$select * from public.post_job('Guest two', 'Another guest job description', 'plumber')$$, 'too many guest jobs right now, please sign in or try later', 'the guest cap stops further guest posts');
reset role;
select public._t_setting ('guest_job_hourly_cap', '500'::jsonb);

-- ─── The job board ───────────────────────────────────────────────────────
select public._t_as ('w1');
select ok((select count(*) from public.list_open_jobs ()) >= 3, 'a plumber sees plumbing jobs, guest and signed-in');
select is ((select description from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 'The kitchen tap is leaking badly', 'the board shows the full description');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 1::bigint, 'a guest job is listed once');
select is ((select quote_count from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 0::bigint, 'with no quotes yet');
select is ((select my_quote_pkr from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), null::numeric, 'and no quote from me');
select throws_ok($$select customer_id from public.list_open_jobs()$$, '42703', null, 'the board never exposes who posted a job');
select is ((select count(*) from public.list_open_jobs ('electrician')), 0::bigint, 'a plumber filtering to electrician sees nothing');
select is ((select count(*) from public.list_open_jobs (null, 'karachi') where id = current_setting ('t.gj')::uuid), 1::bigint, 'the city filter ignores case');
select is ((select count(*) from public.list_open_jobs (null, 'lahore')), 0::bigint, 'and excludes other cities');
select is ((select title from public.get_board_job (current_setting ('t.gj')::uuid)), 'Fix kitchen tap', 'one job can be opened by id');
select public._t_as ('w3');
select is ((select count(*) from public.list_open_jobs () where category = 'plumber'), 0::bigint, 'an electrician sees no plumbing jobs');
select ok((select count(*) from public.list_open_jobs ()) >= 1, 'but sees electrical ones');
select is ((select count(*) from public.get_board_job (current_setting ('t.gj')::uuid)), 0::bigint, 'and cannot open a plumbing job by id');
select public._t_as ('w4');
select throws_ok($$select * from public.list_open_jobs()$$, 'approved workers only', 'a worker who is not approved has no board');
select throws_ok($$select * from public.get_board_job(current_setting('t.gj')::uuid)$$, 'approved workers only', 'nor a job page');
select public._t_as ('c1');
select throws_ok($$select * from public.list_open_jobs()$$, 'approved workers only', 'a customer has no board');
select public._t_as_anon ();
select throws_ok($$select * from public.list_open_jobs()$$, '42501', null, 'a guest has no board');
reset role;
update public.profiles set status = 'suspended' where id = public._t_id ('w2');
select public._t_as ('w2');
select throws_ok($$select * from public.list_open_jobs()$$, 'approved workers only', 'a suspended worker has no board');
reset role;
update public.profiles set status = 'active' where id = public._t_id ('w2');

-- ─── Quotes ──────────────────────────────────────────────────────────────
select public._t_as ('w1');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 0)$$, 'invalid amount', 'a zero quote is rejected');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1500, 'call me 0300 1234567')$$, 'please do not include phone numbers or links; they are shared after you are assigned', 'a phone number in a quote message is rejected');
select throws_ok($$select public.worker_quote_job(gen_random_uuid(), 1500)$$, 'job not found', 'an unknown job is rejected');
select set_config ('t.q1', public.worker_quote_job (current_setting ('t.gj')::uuid, 1800, 'Can do tomorrow')::text, true);
select set_config ('t.q2', public.worker_quote_job (current_setting ('t.gj')::uuid, 1700, 'Best price')::text, true);
select is ((select my_quote_pkr from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 1700::numeric, 'the board shows my current quote');
select public._t_as ('w2');
select set_config ('t.q3', public.worker_quote_job (current_setting ('t.gj')::uuid, 1500, 'Same day')::text, true);
select is ((select my_quote_pkr from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 1500::numeric, 'another worker sees their own quote');
select is ((select quote_count from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 2::bigint, 'and the count of pending quotes');
select public._t_as ('w3');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1000)$$, 'this job is outside your categories', 'a worker outside the category cannot quote');
select public._t_as ('w4');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1000)$$, 'approved workers only', 'an unapproved worker cannot quote');
select public._t_as ('c1');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1000)$$, 'approved workers only', 'a customer cannot quote');
select public._t_as_anon ();
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1000)$$, '42501', null, 'a guest cannot quote');
reset role;

select is ((select status from public.jobs where id = current_setting ('t.gj')::uuid), 'quoted', 'a quote moves the job to quoted');
select is ((select status from public.quotes where id = current_setting ('t.q1')::uuid), 'rejected', 'a re-quote replaces the earlier quote');
select is ((select status from public.quotes where id = current_setting ('t.q2')::uuid), 'pending', 'the newest quote is pending');
select is ((select count(*) from public.quote_events where job_id = current_setting ('t.gj')::uuid and worker_id = public._t_id ('w1')), 2::bigint, 'every quote is tracked, including replaced ones');
select is ((select sum(amount_pkr) from public.quote_events where job_id = current_setting ('t.gj')::uuid), 5000::numeric, 'with the amounts');
select public._t_as ('c1');
select throws_ok($$select * from public.quote_events$$, '42501', null, 'clients cannot read quote events');
reset role;

-- A direct request that nobody answered opens up to the board.
select public._t_as ('c1');
select set_config ('t.dr', public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'A pipe under the sink leaks', 'plumber')::text, true);
select public._t_as ('w2');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.dr')::uuid), 0::bigint, 'a request reserved for one worker is not on another worker''s board');
select throws_ok($$select public.worker_quote_job(current_setting('t.dr')::uuid, 900)$$, 'this request is reserved for another worker', 'and cannot be quoted by them');
select public._t_as ('w1');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.dr')::uuid), 1::bigint, 'the targeted worker does see it');
reset role;
update public.jobs set target_expires_at = now () - interval '1 minute' where id = current_setting ('t.dr')::uuid;
select public.expire_direct_requests ();
select public._t_as ('w2');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.dr')::uuid), 1::bigint, 'once the timeout passes it opens up to other workers');
select lives_ok($$select public.worker_quote_job(current_setting('t.dr')::uuid, 900)$$, 'who can then quote');
reset role;

-- ─── Seeing quotes ───────────────────────────────────────────────────────
select public._t_as_anon ();
select is ((select count(*) from public.job_quotes (current_setting ('t.gj')::uuid, current_setting ('t.gt')::uuid)), 2::bigint, 'the guest sees the two current quotes');
select is ((select worker_name from public.job_quotes (current_setting ('t.gj')::uuid, current_setting ('t.gt')::uuid) limit 1), 'Zaid', 'cheapest first');
select is ((select avg_rating from public.job_quotes (current_setting ('t.gj')::uuid, current_setting ('t.gt')::uuid) limit 1), 4.5::numeric, 'with the worker''s rating');
select is ((select count(*) from public.job_quotes (current_setting ('t.gj')::uuid, gen_random_uuid ())), 0::bigint, 'a wrong token sees no quotes');
select is ((select count(*) from public.job_quotes (current_setting ('t.gj')::uuid, null)), 0::bigint, 'no token sees no quotes');
select public._t_as ('c2');
select is ((select count(*) from public.job_quotes (current_setting ('t.gj')::uuid)), 0::bigint, 'another customer cannot see a guest job''s quotes');
select public._t_as ('c1');
select is ((select count(*) from public.job_quotes (current_setting ('t.dr')::uuid)), 1::bigint, 'a signed-in customer sees quotes on their own job');
reset role;

-- ─── Threads before assignment ───────────────────────────────────────────
select public._t_as_anon ();
select lives_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Is Friday okay?', current_setting('t.gt')::uuid)$$, 'the guest asks a question');
select public._t_as ('w1');
select lives_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Yes, Friday works')$$, 'the worker replies');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Call me 0300 1234567')$$, 'please do not share phone numbers or links; they are shown after a worker is assigned', 'a phone number in a message is rejected');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), '  ')$$, 'message must be 1 to 1000 characters', 'a blank message is rejected');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), repeat('a', 1001))$$, 'message must be 1 to 1000 characters', 'a very long message is rejected');
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'))), 2::bigint, 'the worker sees both messages');
select is ((select sender_role from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1')) order by created_at, id limit 1) is not null, true, 'messages carry a sender role');
select public._t_as ('w2');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Hello there')$$, 'not allowed', 'another worker cannot write in someone else''s thread');
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'))), 0::bigint, 'nor read it');
select lives_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w2'), 'I can come today')$$, 'but can write in their own thread');
select public._t_as ('c2');
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'))), 0::bigint, 'another customer cannot read a guest thread');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Hello there')$$, 'not allowed', 'nor write in it');
select public._t_as_anon ();
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'), current_setting ('t.gt')::uuid)), 2::bigint, 'the guest reads the thread with their token');
select is ((select body from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'), current_setting ('t.gt')::uuid) where sender_role = 'customer'), 'Is Friday okay?', 'the guest''s message is marked as the customer''s');
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'), gen_random_uuid ())), 0::bigint, 'a wrong token reads nothing');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Hello', gen_random_uuid())$$, 'not allowed', 'a wrong token cannot write');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w4'), 'Hello there', current_setting('t.gt')::uuid)$$, 'worker not found', 'a guest cannot message a worker who is not approved');
reset role;

-- Signed-in customers are notified of replies.
select public._t_as ('w1');
select public.post_thread_message (current_setting ('t.dr')::uuid, public._t_id ('w1'), 'Tell me more about the leak');
reset role;
select is (public._t_notif ('c1', 'thread_message'), 'New message | New message about: Fix pipe', 'a signed-in customer is told about a worker''s message');
select public._t_as ('c1');
select public.post_thread_message (current_setting ('t.dr')::uuid, public._t_id ('w1'), 'It drips under the sink');
reset role;
select is (public._t_notif ('w1', 'thread_message', '%Fix pipe'), 'New message | New message about: Fix pipe', 'and the worker of the customer''s reply');
select is ((select count(*) from public.notifications where kind = 'thread_message' and job_id = current_setting ('t.gj')::uuid and user_id in (public._t_id ('c1'), public._t_id ('c2'))), 0::bigint, 'a guest has no account, so nobody is notified on their behalf');
select is ((select count(*) from public.notifications where kind = 'thread_message' and job_id = current_setting ('t.gj')::uuid and user_id = public._t_id ('w1')), 1::bigint, 'but the worker is told when the guest asks a question');
select public._t_as ('c1');
select throws_ok($$select * from public.job_thread_messages$$, '42501', null, 'clients cannot read the thread table directly');
reset role;

-- ─── Accepting: guests must sign in, and the job follows them ────────────
select public._t_as_anon ();
select throws_ok($$select public.customer_accept_quote(current_setting('t.q3')::uuid)$$, '42501', null, 'a guest cannot accept a quote');
select throws_ok($$select public.claim_guest_job(current_setting('t.gt')::uuid)$$, '42501', null, 'a guest cannot claim a job');
reset role;
select public._t_as ('w1');
select throws_ok($$select public.claim_guest_job(current_setting('t.gt')::uuid)$$, 'only customers can claim a job', 'a worker cannot claim a guest job');
select public._t_as ('c1');
select throws_ok($$select public.customer_accept_quote(current_setting('t.q3')::uuid)$$, 'not job owner', 'a customer cannot accept quotes on a job that is still the guest''s');
select public._t_as ('c2');
select is (public.claim_guest_job (current_setting ('t.gt')::uuid), current_setting ('t.gj')::uuid, 'a signed-in customer claims the guest job');
reset role;
select is ((select customer_id from public.jobs where id = current_setting ('t.gj')::uuid), public._t_id ('c2'), 'the job now belongs to that customer');
select is ((select anon_post_token from public.jobs where id = current_setting ('t.gj')::uuid), null::uuid, 'the guest token is cleared');
select is ((select posted_by_anon from public.jobs where id = current_setting ('t.gj')::uuid), false, 'it is no longer a guest post');
select public._t_as_anon ();
select is ((select count(*) from public.get_guest_job (current_setting ('t.gt')::uuid)), 0::bigint, 'the old token no longer opens it');
reset role;
select public._t_as ('c1');
select throws_ok($$select public.claim_guest_job(current_setting('t.gt')::uuid)$$, 'job not found or already claimed', 'it cannot be claimed twice');
reset role;
select public._t_as ('c2');
select is ((select count(*) from public.job_quotes (current_setting ('t.gj')::uuid)), 2::bigint, 'the quotes came with the job');
select is ((select count(*) from public.list_thread (current_setting ('t.gj')::uuid, public._t_id ('w1'))), 2::bigint, 'and so did the conversation');
select lives_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Thanks, choosing now')$$, 'the new owner can keep talking');

select public._t_as ('c1');
select throws_ok($$select public.customer_accept_quote(current_setting('t.q3')::uuid)$$, 'not job owner', 'a different customer still cannot accept');
select public._t_as ('c2');
select lives_ok($$select public.customer_accept_quote(current_setting('t.q3')::uuid)$$, 'the owner accepts the cheaper quote');
select throws_ok($$select public.customer_accept_quote(current_setting('t.q2')::uuid)$$, 'job is no longer open', 'no second quote can be accepted');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.gj')::uuid), 'assigned', 'the job is assigned');
select is ((select worker_id from public.jobs where id = current_setting ('t.gj')::uuid), public._t_id ('w2'), 'to the worker whose quote was accepted');
select is ((select status from public.quotes where id = current_setting ('t.q3')::uuid), 'accepted', 'that quote is accepted');
select is ((select status from public.quotes where id = current_setting ('t.q2')::uuid), 'rejected', 'the other quote is rejected');
select public._t_as ('w1');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.gj')::uuid), 0::bigint, 'the job leaves the board');
select throws_ok($$select public.post_thread_message(current_setting('t.gj')::uuid, public._t_id('w1'), 'Any update?')$$, 'this job is no longer open', 'the pre-assignment thread closes');
select throws_ok($$select public.worker_quote_job(current_setting('t.gj')::uuid, 1000)$$, 'this job is no longer open', 'and no more quotes are accepted');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.gj')::uuid)), 0::bigint, 'the losing worker sees no contacts');
select public._t_as ('w2');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.gj')::uuid)), 1::bigint, 'the chosen worker gets the contact function');
select public._t_as ('c2');
select lives_ok($$select public.customer_set_job_contact(current_setting('t.gj')::uuid, '0300-3333333', 'Flat 5, Gulshan')$$, 'the customer then shares their phone and address');
select public._t_as ('w2');
select is ((select customer_phone from public.get_job_contacts (current_setting ('t.gj')::uuid)), '0300-3333333', 'and the chosen worker sees them');
reset role;
select is (public._t_notif ('w2', 'job_assigned_worker'), 'You got the job | Waiting for the customer''s details: Fix kitchen tap', 'the winner is notified');

-- ─── Cancelling ──────────────────────────────────────────────────────────
select public._t_as_anon ();
with r as (select * from public.post_job ('Guest cancel', 'A guest job that will be cancelled', 'plumber'))
select set_config ('t.g2', (select job_id from r)::text, true), set_config ('t.g2t', (select guest_token from r)::text, true);
reset role;
select public._t_as ('w1');
select public.worker_quote_job (current_setting ('t.g2')::uuid, 800);
select public._t_as_anon ();
select throws_ok($$select public.cancel_posted_job(current_setting('t.g2')::uuid, gen_random_uuid())$$, 'not job owner', 'a wrong token cannot cancel');
select lives_ok($$select public.cancel_posted_job(current_setting('t.g2')::uuid, current_setting('t.g2t')::uuid)$$, 'the guest cancels with their token');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.g2')::uuid), 'cancelled', 'the job is cancelled');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.g2')::uuid and status = 'pending'), 0::bigint, 'and its pending quotes are rejected');
select public._t_as_anon ();
select throws_ok($$select public.cancel_posted_job(current_setting('t.g2')::uuid, current_setting('t.g2t')::uuid)$$, 'cannot cancel from this state', 'a cancelled job cannot be cancelled again');
reset role;
select public._t_as ('c2');
select throws_ok($$select public.cancel_posted_job(current_setting('t.gj')::uuid)$$, 'cannot cancel from this state', 'an assigned job cannot be cancelled this way');
select public._t_as ('c1');
select throws_ok($$select public.cancel_posted_job(current_setting('t.gj')::uuid)$$, 'not job owner', 'another customer cannot cancel it');
select lives_ok($$select public.cancel_posted_job(current_setting('t.cj')::uuid)$$, 'a signed-in owner cancels without a token');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.cj')::uuid), 'cancelled', 'their job is cancelled');

-- ─── Expiry ──────────────────────────────────────────────────────────────
select public._t_as ('c1');
select set_config ('t.e1', (select job_id from public.post_job ('Expire open', 'An open job that will expire', 'plumber'))::text, true);
select set_config ('t.e2', (select job_id from public.post_job ('Expire quoted', 'A quoted job that will expire', 'plumber'))::text, true);
select public._t_as ('w1');
select public.worker_quote_job (current_setting ('t.e2')::uuid, 1000);
reset role;
update public.jobs set expires_at = now () - interval '1 hour'
  where id in (current_setting ('t.e1')::uuid, current_setting ('t.e2')::uuid, current_setting ('t.gj')::uuid);
select ok(public.expire_posted_jobs () >= 2, 'expired open and quoted jobs are closed');
select is ((select status from public.jobs where id = current_setting ('t.e1')::uuid), 'cancelled', 'an expired open job is cancelled');
select is ((select status from public.jobs where id = current_setting ('t.e2')::uuid), 'cancelled', 'an expired quoted job is cancelled');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.e2')::uuid and status = 'pending'), 0::bigint, 'and its pending quotes are rejected');
select is ((select status from public.jobs where id = current_setting ('t.gj')::uuid), 'assigned', 'an assigned job is never expired');
select public._t_as ('w1');
select throws_ok($$select public.worker_quote_job(current_setting('t.e1')::uuid, 500)$$, 'this job is no longer open', 'a cancelled job takes no quotes');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.e1')::uuid), 0::bigint, 'and is off the board');
reset role;
update public.jobs set expires_at = now () - interval '1 minute', status = 'open' where id = current_setting ('t.dr')::uuid;
select public._t_as ('w2');
select throws_ok($$select public.worker_quote_job(current_setting('t.dr')::uuid, 500)$$, 'this job is no longer open', 'a job past its expiry takes no quotes even before the cleanup runs');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.dr')::uuid), 0::bigint, 'and is already hidden from the board');
reset role;

select * from finish ();
rollback;
