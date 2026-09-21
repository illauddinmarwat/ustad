-- Phase 5 (unified inbox): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

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
select public._t_setting ('job_posting_enabled', 'true'::jsonb);
select public._t_setting ('job_post_daily_limit', '50'::jsonb);

-- ─── Setup: two posted jobs, quotes, and a direct request ───────────────
select public._t_as ('c1');
select set_config ('t.a', (select job_id from public.post_job ('Fix tap', 'The kitchen tap is leaking badly', 'plumber'))::text, true);
select set_config ('t.dr', public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'A pipe under the sink leaks', 'plumber')::text, true);
select public._t_as ('c2');
select set_config ('t.b', (select job_id from public.post_job ('Fix basin', 'The bathroom basin is cracked', 'plumber'))::text, true);
select public._t_as ('w1');
select set_config ('t.qa1', public.worker_quote_job (current_setting ('t.a')::uuid, 1000)::text, true);
select public.worker_quote_job (current_setting ('t.b')::uuid, 1200);
select set_config ('t.qdr', public.worker_quote_direct_request (current_setting ('t.dr')::uuid, 1500)::text, true);
select public._t_as ('w2');
select set_config ('t.qa2', public.worker_quote_job (current_setting ('t.a')::uuid, 900)::text, true);
reset role;

-- ─── list_my_quotes: a worker's own quotes ──────────────────────────────
select public._t_as ('w1');
select is ((select count(*) from public.list_my_quotes ()), 2::bigint, 'a worker sees their quotes on posted jobs');
select is ((select count(*) from public.list_my_quotes () where job_id = current_setting ('t.dr')::uuid), 0::bigint, 'quotes on a direct request are left out (they show as the request)');
select is ((select job_title from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'Fix tap', 'each quote carries the job title');
select is ((select job_category from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'plumber', 'the category');
select is ((select job_status from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'quoted', 'the job status');
select is ((select amount_pkr from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 1000::numeric, 'the amount');
select is ((select status from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'pending', 'and the quote status');
select is ((select count(*) from public.list_my_quotes (1)), 1::bigint, 'the limit is respected');
select public._t_as ('w2');
select is ((select count(*) from public.list_my_quotes ()), 1::bigint, 'another worker sees only their own');
select public._t_as ('w3');
select is ((select count(*) from public.list_my_quotes ()), 0::bigint, 'a worker with no quotes sees an empty list');
select public._t_as ('c1');
select is ((select count(*) from public.list_my_quotes ()), 0::bigint, 'a customer has no quotes of their own');
select public._t_as_anon ();
select throws_ok($$select * from public.list_my_quotes()$$, '42501', null, 'a guest cannot list quotes');
reset role;

-- The quote list follows the job: once another worker wins, mine is no longer pending.
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qa2')::uuid);
reset role;
select public._t_as ('w1');
select is ((select status from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'rejected', 'the losing worker''s quote is rejected');
select is ((select job_status from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'assigned', 'and the job shows as assigned');
select public._t_as ('w2');
select is ((select status from public.list_my_quotes () where job_id = current_setting ('t.a')::uuid), 'accepted', 'the winner''s quote is accepted');
reset role;

-- ─── What each side can read for the inbox (row-level security) ──────────
select public._t_as ('w1');
select is ((select count(*) from public.jobs where id = current_setting ('t.dr')::uuid), 1::bigint, 'a worker reads a request sent to them');
select is ((select count(*) from public.jobs where id = current_setting ('t.a')::uuid), 0::bigint, 'but not a posted job they only quoted on');
select public._t_as ('w2');
select is ((select count(*) from public.jobs where id = current_setting ('t.a')::uuid), 1::bigint, 'the assigned worker reads the job');
select is ((select count(*) from public.jobs where id = current_setting ('t.dr')::uuid), 0::bigint, 'and not a request sent to someone else');
select public._t_as ('c1');
select is ((select count(*) from public.jobs where customer_id = public._t_id ('c1')), 2::bigint, 'a customer reads all of their own jobs');
select is ((select count(*) from public.jobs where id = current_setting ('t.b')::uuid), 0::bigint, 'and no one else''s');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.a')::uuid), 2::bigint, 'a customer reads the quotes on their job');
select public._t_as ('c2');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.a')::uuid), 0::bigint, 'another customer cannot read them');
select public._t_as ('w1');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.a')::uuid), 1::bigint, 'a worker reads only their own quote on a job');
select public._t_as ('w2');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.a')::uuid), 1::bigint, 'the other worker reads only theirs');
select public._t_as_anon ();
select is ((select count(*) from public.quotes), 0::bigint, 'a guest reads no quotes');
reset role;

-- ─── Service applications (flow A) in the inbox ──────────────────────────
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w1'), id, 'Plumbing by Usman', 2500, 'active' from public.service_templates where slug = 'plumbing_leak_basic';
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w2'), id, 'Plumbing by Zaid', 2400, 'active' from public.service_templates where slug = 'geyser_install';
select public._t_as ('c1');
insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings where headline = 'Plumbing by Usman'), public._t_id ('c1'), 'Monday please');
select public._t_as ('c2');
insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings where headline = 'Plumbing by Usman'), public._t_id ('c2'), 'Any day');
reset role;
select set_config ('t.app1', (select id from public.listing_applications where customer_id = public._t_id ('c1'))::text, true);

select public._t_as ('c1');
select is ((select count(*) from public.listing_applications), 1::bigint, 'a customer reads only their own applications');
select is ((select note from public.listing_applications), 'Monday please', 'with their note');
select public._t_as ('w1');
select is ((select count(*) from public.listing_applications), 2::bigint, 'the listing owner reads applications to their listing');
select public._t_as ('w2');
select is ((select count(*) from public.listing_applications), 0::bigint, 'another worker reads none');
select public._t_as_anon ();
select is ((select count(*) from public.listing_applications), 0::bigint, 'a guest reads none');
reset role;

select public._t_as ('c2');
select throws_ok($$insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings where headline = 'Plumbing by Usman'), public._t_id('c2'), 'Again')$$, '23505', null, 'a customer cannot have two open applications to one listing');
select throws_ok($$insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings where headline = 'Plumbing by Zaid'), public._t_id('c1'), 'Not me')$$, '42501', null, 'a customer cannot apply on someone else''s behalf');
select lives_ok($$update public.listing_applications set status = 'cancelled' where customer_id = public._t_id('c2')$$, 'a customer cancels their own pending application');
reset role;
select is ((select status from public.listing_applications where customer_id = public._t_id ('c2')), 'cancelled', 'the application shows as cancelled');
select public._t_as ('c1');
select lives_ok($$update public.listing_applications set status = 'cancelled' where customer_id = public._t_id('c2')$$, 'trying to cancel someone else''s application does nothing');
reset role;
select is ((select status from public.listing_applications where customer_id = public._t_id ('c2')), 'cancelled', 'and does not error');
select public._t_as ('w1');
select public.worker_accept_listing_application ((select id from public.listing_applications where customer_id = public._t_id ('c1')));
reset role;
select is ((select status from public.listing_applications where customer_id = public._t_id ('c1')), 'accepted', 'the worker accepts an application (existing behaviour is unchanged)');
select is ((select status from public.jobs where listing_application_id = (select id from public.listing_applications where customer_id = public._t_id ('c1'))), 'pending_customer_confirm', 'which creates a job waiting for the customer to confirm');
select public._t_as ('w2');
select throws_ok($$select public.worker_accept_listing_application(current_setting('t.app1')::uuid)$$, 'not listing owner', 'only the listing owner can accept');
reset role;
select public._t_as ('c1');
select is ((select count(*) from public.jobs where origin = 'service_listing'), 1::bigint, 'the customer sees the service booking as a job');
select public._t_as ('w1');
select is ((select count(*) from public.jobs where origin = 'service_listing'), 1::bigint, 'and so does the worker');
reset role;

select * from finish ();
rollback;
