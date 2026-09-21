-- Phase 3 (notifications): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

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

-- ─── Direct request lifecycle produces the right notifications ───────────
select public._t_as ('c1');
select set_config ('t.a', public.create_direct_request (public._t_id ('w1'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber', 1000)::text, true);
reset role;
select is (public._t_notif ('w1', 'request_received'), 'New request | You received a request: Fix tap', 'the worker is told about a new request (English)');
select is ((select job_id from public.notifications where user_id = public._t_id ('w1') and kind = 'request_received'), current_setting ('t.a')::uuid, 'the notification points at the job');
select is ((select read_at from public.notifications where user_id = public._t_id ('w1') and kind = 'request_received'), null::timestamptz, 'it starts unread');
select is ((select data ->> 'kind' from public.notifications where user_id = public._t_id ('w1') and kind = 'request_received'), 'request_received', 'the payload carries the kind');
select is ((select count(*) from public.notifications where user_id = public._t_id ('c1')), 0::bigint, 'the customer gets nothing for their own action');

select public._t_as ('w1');
select public.worker_quote_direct_request (current_setting ('t.a')::uuid, 1200);
reset role;
select ok(public._t_notif ('c1', 'quote_received') like 'New quote | A worker sent a quote: Rs 1200%Fix tap', 'the customer is told about the quote, with the amount');

select public._t_as ('c1');
select public.customer_accept_quote ((select id from public.quotes where job_id = current_setting ('t.a')::uuid and status = 'pending'));
reset role;
select is (public._t_notif ('c1', 'job_assigned'), 'A worker accepted | Add your phone number and address: Fix tap', 'the customer is asked for their details once assigned');
select is (public._t_notif ('w1', 'job_assigned_worker'), 'You got the job | Waiting for the customer''s details: Fix tap', 'the worker is told they got the job');

select public._t_as ('c1');
select public.customer_set_job_contact (current_setting ('t.a')::uuid, '0300-1111111', 'House 1, Street 2, DHA');
reset role;
select is (public._t_notif ('w1', 'contact_shared'), 'Customer details shared | You can now see the phone number and address: Fix tap', 'the worker is told the customer shared details');

select public._t_as ('w1');
select public.mark_job_completed (current_setting ('t.a')::uuid);
reset role;
select is (public._t_notif ('c1', 'job_completed'), 'Work completed | Pay in cash and mark as paid: Fix tap', 'the customer is told to pay');

select public._t_as ('c1');
select public.mark_job_paid (current_setting ('t.a')::uuid, 1200, 'cash');
reset role;
select is (public._t_notif ('w1', 'payment_marked'), 'Confirm payment | The customer says they paid. Confirm the amount: Fix tap', 'the worker is asked to confirm the payment');

select public._t_as ('w1');
select public.worker_confirm_payment_received (current_setting ('t.a')::uuid, 1200);
reset role;
select is (public._t_notif ('c1', 'job_closed'), 'Job closed | Payment confirmed: Fix tap', 'the customer is told the job closed');
select is (public._t_notif ('w1', 'job_closed'), 'Job closed | Payment confirmed: Fix tap', 'so is the worker');
select ok(public._t_notif ('w1', 'commission_created') like 'Commission due | Please pay Rs 180%to Ustad by %', 'the worker is told what commission is due');

-- Dispute, decline and cancel.
select public._t_as ('c1');
select set_config ('t.b', public.create_direct_request (public._t_id ('w1'), 'Fix sink', 'The sink drain is blocked', 'plumber', 900)::text, true);
select public._t_as ('w1');
select public.worker_decline_direct_request (current_setting ('t.b')::uuid);
reset role;
select is (public._t_notif ('c1', 'request_declined'), 'Request declined | The worker could not take: Fix sink', 'a decline tells the customer');

select public._t_as ('c1');
select set_config ('t.c', public.create_direct_request (public._t_id ('w1'), 'Fix geyser', 'The geyser does not heat', 'plumber', 900)::text, true);
select public.customer_cancel_job (current_setting ('t.c')::uuid);
reset role;
select is (public._t_notif ('w1', 'request_cancelled'), 'Request cancelled | The customer cancelled: Fix geyser', 'a cancel by the customer tells the worker');

select public._t_as ('c1');
select set_config ('t.d', public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'A pipe under the sink leaks', 'plumber', 700)::text, true);
select public._t_as ('w1');
select public.worker_accept_direct_request (current_setting ('t.d')::uuid);
select public.mark_job_completed (current_setting ('t.d')::uuid);
select public._t_as ('c1');
select public.mark_job_paid (current_setting ('t.d')::uuid, 700, 'cash');
select public._t_as ('w1');
select public.worker_confirm_payment_received (current_setting ('t.d')::uuid, 500);
reset role;
select is (public._t_notif ('c1', 'job_disputed'), 'Payment problem | Please call the Ustad helpline: Fix pipe', 'a dispute tells the customer to call the helpline');
select is (public._t_notif ('w1', 'job_disputed'), 'Payment problem | Please call the Ustad helpline: Fix pipe', 'and the worker');

-- ─── Service applications (flow A) ───────────────────────────────────────
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w1'), id, 'Plumbing by Usman', 2500, 'active' from public.service_templates where slug = 'plumbing_leak_basic';
select public._t_as ('c1');
insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings limit 1), public._t_id ('c1'), 'Monday please');
select public._t_as ('c2');
insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings limit 1), public._t_id ('c2'), 'Any day');
reset role;
select is (public._t_notif ('w1', 'application_received'), 'New application | Someone applied to your service: Plumbing by Usman', 'the worker is told about an application');
select is ((select count(*) from public.notifications where user_id = public._t_id ('w1') and kind = 'application_received'), 2::bigint, 'one per application');

select public._t_as ('w1');
select set_config ('t.job_a', public.worker_accept_listing_application ((select id from public.listing_applications where customer_id = public._t_id ('c1')))::text, true);
select public.worker_decline_listing_application ((select id from public.listing_applications where customer_id = public._t_id ('c2')));
reset role;
select is (public._t_notif ('c1', 'application_accepted'), 'Application accepted | Confirm your booking: Plumbing by Usman', 'accepting an application tells the customer');
select is (public._t_notif ('c2', 'application_declined'), 'درخواست مسترد | کارکن نے درخواست قبول نہیں کی: Plumbing by Usman', 'declining tells the customer, in Urdu for an Urdu customer');

select public._t_as ('c1');
select public.customer_confirm_booking (current_setting ('t.job_a')::uuid);
reset role;
select is ((select count(*) from public.notifications where user_id = public._t_id ('c1') and kind = 'job_assigned'), 3::bigint, 'each assignment notifies the customer, including a confirmed service booking');
select is (public._t_notif ('w1', 'job_assigned_worker', '%Plumbing by Usman'), 'You got the job | Waiting for the customer''s details: Plumbing by Usman', 'and the worker');

-- ─── Language follows the recipient ──────────────────────────────────────
select public._t_as ('c2');
select set_config ('t.u', public.create_direct_request (public._t_id ('w1'), 'Fix basin', 'The basin is cracked', 'plumber', 600)::text, true);
select public._t_as ('w1');
select public.worker_quote_direct_request (current_setting ('t.u')::uuid, 650);
reset role;
select is (public._t_notif ('c2', 'quote_received') like 'نئی قیمت |%', true, 'an Urdu customer gets the quote notice in Urdu');
update public.profiles set preferred_language = 'ur' where id = public._t_id ('w1');
select public._t_as ('c1');
select public.create_direct_request (public._t_id ('w1'), 'Fix tank', 'The water tank overflows', 'plumber', 600);
reset role;
select is (public._t_notif ('w1', 'request_received', '%Fix tank'), 'نئی درخواست | آپ کو ایک کام کی درخواست ملی: Fix tank', 'switching a worker to Urdu changes their notices');
update public.profiles set preferred_language = 'en' where id = public._t_id ('w1');

-- ─── Privacy: people only see their own ──────────────────────────────────
select public._t_as ('c1');
select is ((select count(*) from public.notifications where user_id <> public._t_id ('c1')), 0::bigint, 'a customer sees only their own notifications');
select ok((select count(*) from public.notifications) > 0, 'and they do see theirs');
select throws_ok($$insert into public.notifications (user_id, kind, title, body) values (public._t_id('c1'), 'x', 'Fake', 'Fake')$$, '42501', null, 'clients cannot create notifications');
select throws_ok($$update public.notifications set title = 'Hacked'$$, '42501', null, 'clients cannot edit notifications');
select throws_ok($$delete from public.notifications$$, '42501', null, 'clients cannot delete notifications');
select public._t_as ('w2');
select is ((select count(*) from public.notifications), 0::bigint, 'a worker with no events sees none');
select public._t_as_anon ();
select throws_ok($$select * from public.notifications$$, '42501', null, 'guests cannot read notifications');
reset role;

-- ─── Marking read ────────────────────────────────────────────────────────
select set_config ('t.unread_c1', (select count(*) from public.notifications where user_id = public._t_id ('c1') and read_at is null)::text, true);
select set_config ('t.nid', (select id from public.notifications where user_id = public._t_id ('c1') order by id limit 1)::text, true);
select set_config ('t.unread_c2', (select count(*) from public.notifications where user_id = public._t_id ('c2') and read_at is null)::text, true);
select public._t_as ('c1');
select is (public.mark_notifications_read (array[current_setting ('t.nid')::uuid]), 1, 'marking one notification read affects one row');
select is (public.mark_notifications_read (array[current_setting ('t.nid')::uuid]), 0, 'marking it again changes nothing');
select is (public.mark_notifications_read (), current_setting ('t.unread_c1')::int - 1, 'marking all read affects the remaining unread ones');
select is (public.mark_notifications_read (), 0, 'and then there is nothing left');
select is ((select count(*) from public.notifications where read_at is null), 0::bigint, 'the customer has no unread notifications');
select public._t_as ('c2');
select is ((select count(*) from public.notifications where read_at is null), current_setting ('t.unread_c2')::bigint, 'another user''s notifications were not touched');
select public._t_as_anon ();
select throws_ok($$select public.mark_notifications_read()$$, '42501', null, 'guests cannot mark notifications read');
reset role;

-- ─── Device tokens ───────────────────────────────────────────────────────
select public._t_as ('w1');
select lives_ok($$select public.register_device_token('ExponentPushToken[t1]', 'android')$$, 'a worker registers a device');
select throws_ok($$select public.register_device_token('   ', 'android')$$, 'token is required', 'a blank token is rejected');
select throws_ok($$select * from public.device_tokens$$, '42501', null, 'clients cannot read device tokens');
select public._t_as ('w2');
select lives_ok($$select public.register_device_token('ExponentPushToken[t1]', 'ios')$$, 'the same phone can be registered by the next person who signs in');
reset role;
select is ((select user_id from public.device_tokens where token = 'ExponentPushToken[t1]'), public._t_id ('w2'), 'the token now belongs to the latest user');
select is ((select platform from public.device_tokens where token = 'ExponentPushToken[t1]'), 'ios', 'and its platform is updated');
select public._t_as ('w1');
select public.unregister_device_token ('ExponentPushToken[t1]');
reset role;
select is ((select count(*) from public.device_tokens where token = 'ExponentPushToken[t1]'), 1::bigint, 'a person cannot remove someone else''s token');
select public._t_as ('w2');
select public.unregister_device_token ('ExponentPushToken[t1]');
reset role;
select is ((select count(*) from public.device_tokens where token = 'ExponentPushToken[t1]'), 0::bigint, 'the owner removes it on sign-out');
select public._t_as_anon ();
select throws_ok($$select public.register_device_token('ExponentPushToken[x]', 'android')$$, '42501', null, 'guests cannot register devices');
reset role;

-- ─── Push is best effort ─────────────────────────────────────────────────
select public._t_as ('w1');
select public.register_device_token ('ExponentPushToken[w1]', 'android');
reset role;
select set_config ('t.before', (select count(*) from public.notifications where user_id = public._t_id ('w1'))::text, true);
select public._t_as ('c1');
select lives_ok($$select public.create_direct_request(public._t_id('w1'), 'Fix door', 'The bathroom door is stuck', 'plumber', 500)$$, 'an action still succeeds when the recipient has a push token');
reset role;
select is ((select count(*) from public.notifications where user_id = public._t_id ('w1')), current_setting ('t.before')::bigint + 1, 'and the in-app notification is still created');

-- ─── Direct calls to the internals ───────────────────────────────────────
select lives_ok($$select public._notify(null, 'request_received', null, '{}'::jsonb)$$, 'notifying nobody is a no-op');
select public._notify (public._t_id ('c1'), 'mystery_kind', null, '{"job_title":"Something"}'::jsonb);
select is (public._t_notif ('c1', 'mystery_kind'), 'Ustad | Something', 'an unknown kind falls back to a plain notice');
select public._t_as ('c1');
select throws_ok($$select public._notify(public._t_id('c1'), 'x', null, '{}'::jsonb)$$, '42501', null, 'clients cannot call the internal notify function');
reset role;

select * from finish ();
rollback;
