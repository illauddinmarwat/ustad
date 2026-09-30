-- Quote details (price type, start date, comparison data): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

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

select public._t_setting ('job_posting_enabled', 'true'::jsonb);
select public._t_setting ('job_post_daily_limit', '50'::jsonb);

-- c1 posts two plumbing jobs: J is quoted on; K is used to check old-style quotes and closed jobs.
select public._t_as ('c1');
select set_config ('t.j', (select job_id from public.post_job ('Fix tap', 'The kitchen tap is leaking badly', 'plumber', 'Karachi'))::text, true);
select set_config ('t.k', (select job_id from public.post_job ('Fix basin', 'The bathroom basin is cracked', 'plumber', 'Karachi'))::text, true);
reset role;

-- ─── Flag ────────────────────────────────────────────────────────────────
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'quote details are not enabled', 'detailed quotes are blocked while the flag is off');
reset role;
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);

-- ─── Validation ──────────────────────────────────────────────────────────
select public._t_as_anon ();
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 1)$$, current_setting ('t.j')), '42501', null, 'a guest cannot send a quote');
reset role;

select public._t_as ('w1');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'hourly', current_date + 1)$$, current_setting ('t.j')),
  'price type must be fixed or estimate', 'an unknown price type is rejected');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, null, current_date + 1)$$, current_setting ('t.j')),
  'price type must be fixed or estimate', 'a missing price type is rejected');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', null)$$, current_setting ('t.j')),
  'please say when you can start', 'a missing start date is rejected');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date - 2)$$, current_setting ('t.j')),
  'start date must be within the next 30 days', 'a start date in the past is rejected');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 31)$$, current_setting ('t.j')),
  'start date must be within the next 30 days', 'a start date over 30 days away is rejected');
select throws_ok(format ($$select public.worker_send_quote (%L, 0, null, 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'invalid amount', 'the usual amount rule still applies');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, 'call me on 0300 1234567', 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'please do not include phone numbers or links; they are shared after you are assigned', 'the usual contact rule still applies');
reset role;

select public._t_as ('c2');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'approved workers only', 'a customer cannot quote');
reset role;
select public._t_as ('w4');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'approved workers only', 'a worker who is not approved cannot quote');
reset role;
select public._t_as ('w3');
select throws_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date + 1)$$, current_setting ('t.j')),
  'this job is outside your categories', 'a worker in another category cannot quote');
reset role;

-- ─── Sending ─────────────────────────────────────────────────────────────
select public._t_as ('w1');
select lives_ok(format ($$select public.worker_send_quote (%L, 2000, 'Can start early', 'fixed', current_date + 1)$$, current_setting ('t.j')), 'a fixed quote with a start date is accepted');
reset role;
select is ((select price_type from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 'fixed', 'the price type is stored');
select is ((select available_from from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), current_date + 1, 'the start date is stored');
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 2000::numeric, 'the amount is stored');

select public._t_as ('w1');
select lives_ok(format ($$select public.worker_send_quote (%L, 2200, 'Need to see it first', 'estimate', current_date + 2)$$, current_setting ('t.j')), 'a new quote replaces the old one');
reset role;
select is ((select count(*) from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 1::bigint, 'only one quote per worker stays pending');
select is ((select price_type from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 'estimate', 'the latest quote is an estimate');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'rejected'), 1::bigint, 'the earlier one is rejected');
select is ((select price_type from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'rejected'), 'fixed', 'and keeps its own details');

select public._t_as ('w2');
select lives_ok(format ($$select public.worker_send_quote (%L, 1500, null, 'fixed', current_date)$$, current_setting ('t.j')), 'another worker quotes for today');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.j')::uuid), 'quoted', 'the job is marked quoted');

-- Quotes sent the old way still work and default to a fixed price with no date.
select public._t_as ('w2');
select lives_ok(format ($$select public.worker_quote_job (%L, 900, null)$$, current_setting ('t.k')), 'the old quote function still works');
reset role;
select is ((select price_type from public.quotes where job_id = current_setting ('t.k')::uuid and worker_id = public._t_id ('w2')), 'fixed', 'an old-style quote is fixed');
select is ((select available_from from public.quotes where job_id = current_setting ('t.k')::uuid and worker_id = public._t_id ('w2')), null::date, 'and has no start date');

-- ─── What the customer sees ──────────────────────────────────────────────
select public._t_as ('c1');
select is ((select count(*) from public.job_quotes (current_setting ('t.j')::uuid)), 2::bigint, 'the owner sees both pending quotes');
select is ((select worker_name from public.job_quotes (current_setting ('t.j')::uuid) limit 1), 'Zaid', 'cheapest first, as before');
select is ((select price_type from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w1')), 'estimate', 'the price type is shown');
select is ((select available_from from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w1')), current_date + 2, 'the start date is shown');
select is ((select completed_jobs from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w1')), 0::bigint, 'a new worker has no completed jobs');
reset role;

-- w1 has one finished job elsewhere.
select public._t_as ('c2');
select set_config ('t.o', (select job_id from public.post_job ('Fix sink', 'The sink is blocked again', 'plumber', 'Karachi'))::text, true);
reset role;
update public.jobs set worker_id = public._t_id ('w1'), status = 'closed' where id = current_setting ('t.o')::uuid;
select public._t_as ('c1');
select is ((select completed_jobs from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w1')), 1::bigint, 'completed jobs are counted');
reset role;

select public._t_as ('c2');
select is ((select count(*) from public.job_quotes (current_setting ('t.j')::uuid)), 0::bigint, 'another customer sees no quotes');
reset role;
select public._t_as ('w1');
select is ((select count(*) from public.job_quotes (current_setting ('t.j')::uuid)), 0::bigint, 'a worker cannot read the quotes on a job');
reset role;
select public._t_as_anon ();
select is ((select count(*) from public.job_quotes (current_setting ('t.j')::uuid)), 0::bigint, 'nor can a guest without the token');
reset role;

-- Delegated rules: a closed job takes no more quotes.
update public.jobs set status = 'cancelled' where id = current_setting ('t.k')::uuid;
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_send_quote (%L, 1200, null, 'fixed', current_date + 1)$$, current_setting ('t.k')),
  'this job is no longer open', 'a cancelled job takes no quotes');
reset role;

select * from finish ();
rollback;
