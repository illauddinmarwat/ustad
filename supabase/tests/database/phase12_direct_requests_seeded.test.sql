-- Phase 1 (direct requests): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

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

-- ─── Flag ────────────────────────────────────────────────────────────────
select public._t_setting ('direct_requests_enabled', 'false'::jsonb);
select public._t_as ('c1');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber')$$,
  'direct requests are not enabled',
  'requests are blocked while the flag is off'
);
reset role;
select public._t_setting ('direct_requests_enabled', 'true'::jsonb);

-- ─── Creating a request ──────────────────────────────────────────────────
select public._t_as ('c1');
select set_config ('t.j1', public.create_direct_request (public._t_id ('w1'), 'Fix kitchen tap', 'Kitchen tap is leaking badly', 'plumber', 1500, 'tomorrow 5pm', 'Gulshan')::text, true);
reset role;

select is ((select target_worker_id from public.jobs where id = current_setting ('t.j1')::uuid), public._t_id ('w1'), 'the request is targeted at the chosen worker');
select is ((select customer_id from public.jobs where id = current_setting ('t.j1')::uuid), public._t_id ('c1'), 'the customer owns the request');
select is ((select status from public.jobs where id = current_setting ('t.j1')::uuid), 'open', 'a new request is open');
select is ((select origin from public.jobs where id = current_setting ('t.j1')::uuid), 'customer_job', 'a direct request is a customer job');
select is ((select budget_pkr from public.jobs where id = current_setting ('t.j1')::uuid), 1500::numeric, 'the stated budget is stored');
select is ((select preferred_time from public.jobs where id = current_setting ('t.j1')::uuid), 'tomorrow 5pm', 'the preferred time is stored');
select ok(
  (select target_expires_at from public.jobs where id = current_setting ('t.j1')::uuid)
    between now () + interval '1 hour 50 minutes' and now () + interval '2 hours 10 minutes',
  'the worker has about 2 hours to answer'
);
select is ((select count(*) from public.job_contacts), 0::bigint, 'no phone or address is collected with a request');

-- Who can see it (row-level security).
select public._t_as ('w1');
select is ((select count(*) from public.jobs where id = current_setting ('t.j1')::uuid), 1::bigint, 'the targeted worker sees the request');
select public._t_as ('w2');
select is ((select count(*) from public.jobs where id = current_setting ('t.j1')::uuid), 0::bigint, 'another worker does not');
select public._t_as ('c2');
select is ((select count(*) from public.jobs where id = current_setting ('t.j1')::uuid), 0::bigint, 'another customer does not');
select public._t_as ('c1');
select is ((select count(*) from public.jobs where id = current_setting ('t.j1')::uuid), 1::bigint, 'the customer sees their own request');
select public._t_as_anon ();
select is ((select count(*) from public.jobs), 0::bigint, 'a guest sees no jobs at all');
reset role;

-- ─── Rejected requests ───────────────────────────────────────────────────
select public._t_as ('c1');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w4'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber')$$,
  'worker not available for this category', 'a worker who is not approved cannot be requested');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Wire fan', 'Ceiling fan needs wiring today', 'electrician')$$,
  'worker not available for this category', 'a worker outside the category cannot be requested');
select throws_ok(
  $$select public.create_direct_request(public._t_id('c2'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber')$$,
  'worker not available for this category', 'a customer id is not a worker');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), '  ', 'Kitchen tap is leaking badly', 'plumber')$$,
  'title and description are required', 'a blank title is rejected');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Fix tap', '', 'plumber')$$,
  'title and description are required', 'a blank description is rejected');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Fix tap', 'Kitchen tap is leaking badly', '')$$,
  'category is required', 'a blank category is rejected');
select public._t_as ('w1');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber')$$,
  'cannot request yourself', 'a worker cannot request themselves');
select public._t_as_anon ();
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber')$$,
  '42501', null, 'a guest cannot create a request');
reset role;

-- ─── Daily limit ─────────────────────────────────────────────────────────
select public._t_setting ('direct_request_daily_limit', '2'::jsonb);
select public._t_as ('c2');
select lives_ok($$select public.create_direct_request(public._t_id('w1'), 'Job one', 'First job description', 'plumber')$$, 'first request today is allowed');
select lives_ok($$select public.create_direct_request(public._t_id('w1'), 'Job two', 'Second job description', 'plumber')$$, 'second request today is allowed');
select throws_ok(
  $$select public.create_direct_request(public._t_id('w1'), 'Job three', 'Third job description', 'plumber')$$,
  'daily request limit reached', 'the daily limit stops the third request');
reset role;
select public._t_setting ('direct_request_daily_limit', '20'::jsonb);

-- ─── Worker answers: quote, then customer accepts ────────────────────────
select public._t_as ('w2');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.j1')::uuid)$$, 'not your request', 'another worker cannot accept it');
select throws_ok($$select public.worker_quote_direct_request(current_setting('t.j1')::uuid, 1000)$$, 'not your request', 'another worker cannot quote on it');
select throws_ok($$select public.worker_decline_direct_request(current_setting('t.j1')::uuid)$$, 'not your request', 'another worker cannot decline it');
select public._t_as ('c1');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.j1')::uuid)$$, 'not your request', 'the customer cannot accept their own request as the worker');
select public._t_as ('w1');
select throws_ok($$select public.worker_quote_direct_request(current_setting('t.j1')::uuid, -5)$$, 'invalid amount', 'a negative quote is rejected');
select set_config ('t.q1', public.worker_quote_direct_request (current_setting ('t.j1')::uuid, 1800, 'Tomorrow is fine')::text, true);
select set_config ('t.q2', public.worker_quote_direct_request (current_setting ('t.j1')::uuid, 1700, 'Best price')::text, true);
reset role;

select is ((select status from public.jobs where id = current_setting ('t.j1')::uuid), 'quoted', 'a quote moves the request to quoted');
select is ((select status from public.quotes where id = current_setting ('t.q1')::uuid), 'rejected', 'a new quote replaces the worker''s earlier one');
select is ((select status from public.quotes where id = current_setting ('t.q2')::uuid), 'pending', 'the newest quote is the pending one');

select public._t_as ('c1');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.j1')::uuid and status = 'pending'), 1::bigint, 'the customer sees the pending quote');
select public._t_as ('c2');
select throws_ok($$select public.customer_accept_direct_quote(current_setting('t.q2')::uuid)$$, 'not job owner', 'another customer cannot accept the quote');
select public._t_as ('c1');
select lives_ok($$select public.customer_accept_direct_quote(current_setting('t.q2')::uuid)$$, 'the owner accepts the quote');
reset role;

select is ((select status from public.jobs where id = current_setting ('t.j1')::uuid), 'assigned', 'accepting the quote assigns the job');
select is ((select worker_id from public.jobs where id = current_setting ('t.j1')::uuid), public._t_id ('w1'), 'the quoting worker gets the job');
select is ((select status from public.quotes where id = current_setting ('t.q2')::uuid), 'accepted', 'the quote is marked accepted');
select is ((select target_expires_at from public.jobs where id = current_setting ('t.j1')::uuid), null::timestamptz, 'the timeout is cleared once assigned');

select public._t_as ('c1');
select throws_ok($$select public.customer_accept_direct_quote(current_setting('t.q2')::uuid)$$, 'request is no longer open', 'an assigned request cannot be accepted again');
select public._t_as ('w1');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.j1')::uuid)$$, 'request is no longer open', 'nor accepted again by the worker');
reset role;

-- ─── Accept the budget as-is ─────────────────────────────────────────────
select public._t_as ('c1');
select set_config ('t.j2', public.create_direct_request (public._t_id ('w1'), 'Fix sink', 'The sink drain is blocked', 'plumber', 900)::text, true);
select public._t_as ('w1');
select lives_ok($$select public.worker_accept_direct_request(current_setting('t.j2')::uuid)$$, 'the worker accepts the budget as it is');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.j2')::uuid), 'assigned', 'accepting the budget assigns the job');
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j2')::uuid and status = 'accepted'), 900::numeric, 'an accepted quote records the budget amount');

-- ─── No budget: must quote; decline; cancel ──────────────────────────────
select public._t_as ('c1');
select set_config ('t.j3', public.create_direct_request (public._t_id ('w1'), 'Fix shower', 'The shower mixer is broken', 'plumber')::text, true);
select public._t_as ('w1');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.j3')::uuid)$$, 'no budget set; send a quote instead', 'a request without a budget cannot be accepted as-is');
select lives_ok($$select public.worker_decline_direct_request(current_setting('t.j3')::uuid)$$, 'the worker declines');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.j3')::uuid)$$, 'request is no longer open', 'a declined request cannot be accepted');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.j3')::uuid), 'cancelled', 'a declined request is cancelled');

select public._t_as ('c1');
select set_config ('t.j4', public.create_direct_request (public._t_id ('w1'), 'Fix geyser', 'The geyser does not heat', 'plumber')::text, true);
select lives_ok($$select public.customer_cancel_job(current_setting('t.j4')::uuid)$$, 'the customer cancels their own request');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.j4')::uuid), 'cancelled', 'a cancelled request is cancelled');

-- ─── Timeout: unanswered requests open up ────────────────────────────────
select public._t_as ('c1');
select set_config ('t.j5', public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'A pipe under the sink leaks', 'plumber')::text, true);
select set_config ('t.j6', public.create_direct_request (public._t_id ('w1'), 'Fix basin', 'The basin is cracked', 'plumber')::text, true);
select public._t_as ('w1');
select public.worker_quote_direct_request (current_setting ('t.j6')::uuid, 2500);
reset role;
update public.jobs set target_expires_at = now () - interval '1 minute'
  where id in (current_setting ('t.j5')::uuid, current_setting ('t.j6')::uuid);

select is (public.expire_direct_requests (), 1, 'only the unanswered request is opened up');
select is ((select target_worker_id from public.jobs where id = current_setting ('t.j5')::uuid), null::uuid, 'the expired request is no longer tied to one worker');
select is ((select status from public.jobs where id = current_setting ('t.j5')::uuid), 'open', 'and stays open');
select is ((select target_worker_id from public.jobs where id = current_setting ('t.j6')::uuid), public._t_id ('w1'), 'a request the worker already quoted on keeps its target');
select is ((select target_worker_id from public.jobs where id = current_setting ('t.j1')::uuid), public._t_id ('w1'), 'an assigned request keeps its worker');
select is (public.expire_direct_requests (), 0, 'running the timeout again changes nothing');
select public._t_as ('w1');
select is ((select count(*) from public.jobs where id = current_setting ('t.j5')::uuid), 0::bigint, 'the original worker can no longer see the opened-up request');
reset role;

-- ─── Availability and Nearby ─────────────────────────────────────────────
select public._t_as ('w1');
select lives_ok($$select public.worker_set_availability(false)$$, 'a worker can mark themselves busy');
select is ((select is_available from public.worker_profiles where user_id = public._t_id ('w1')), false, 'the busy flag is stored');
select public._t_as ('c1');
select lives_ok($$select public.create_direct_request(public._t_id('w1'), 'Fix tap again', 'Tap is dripping again now', 'plumber')$$, 'a busy worker can still be sent a request');
select is (
  (select user_id from public.nearby_workers (24.86, 67.00, 'plumber', 30) limit 1),
  public._t_id ('w2'), 'Nearby lists the available worker first');
select is (
  (select user_id from public.nearby_workers (24.86, 67.00, 'plumber', 30) offset 1 limit 1),
  public._t_id ('w1'), 'and the busy worker after');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumber', 30)), 2::bigint, 'the unapproved plumber and the electrician are left out');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, null, 30)), 3::bigint, 'without a category all approved workers appear');
select public._t_as_anon ();
select lives_ok($$select * from public.nearby_workers(24.86, 67.00, 'plumber', 30)$$, 'a guest can browse Nearby');
select throws_ok($$select public.worker_set_availability(true)$$, '42501', null, 'a guest cannot change availability');
reset role;
select public._t_as ('w1');
select public.worker_set_availability (true);
reset role;
select is ((select is_available from public.worker_profiles where user_id = public._t_id ('w1')), true, 'the worker can mark themselves available again');

select * from finish ();
rollback;
