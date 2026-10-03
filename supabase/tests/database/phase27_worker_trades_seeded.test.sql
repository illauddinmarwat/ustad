-- Workers with more than one trade, and more service types, with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

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

-- w1 Usman registered as a plumber.
select is ((select categories from public.worker_profiles where user_id = public._t_id ('w1')), array['plumber'], 'a worker starts with the one trade they registered with');

select public._t_as ('w1');
select is (public.worker_set_trades (array['plumber', 'electrician']), array['plumber', 'electrician'], 'a worker can work in two trades');
select is (public.worker_set_trades (array['electrician', 'plumber', 'electrician']), array['electrician', 'plumber'], 'repeats are dropped and the order given is kept');
select is (public.worker_set_trades (array['plumber', 'electrician']), array['plumber', 'electrician'], 'and back again');
reset role;
select is ((select categories from public.worker_profiles where user_id = public._t_id ('w1')), array['plumber', 'electrician'], 'the profile now lists both trades');

select public._t_as ('w1');
select throws_ok ($$ select public.worker_set_trades (array[]::text[]) $$, 'P0001', 'choose at least one trade', 'at least one trade is needed');
select throws_ok ($$ select public.worker_set_trades (null) $$, 'P0001', 'choose at least one trade', 'null is the same as none');
select throws_ok ($$ select public.worker_set_trades (array['plumber', 'astronaut']) $$, 'P0001', 'unknown trade', 'a trade that does not exist is refused');
reset role;
select is ((select categories from public.worker_profiles where user_id = public._t_id ('w1')), array['plumber', 'electrician'], 'a refused change leaves the trades as they were');

-- Up to six trades.
insert into public.skill_categories (key, name_en, sort_order) values ('x1', 'X1', 90), ('x2', 'X2', 91);
select public._t_as ('w1');
select throws_ok ($$ select public.worker_set_trades (array['plumber','electrician','carpenter','painter','ac_technician','welder','x1']) $$,
  'P0001', 'choose up to 6 trades', 'more than six trades are refused');
select is (array_length (public.worker_set_trades (array['plumber','electrician','carpenter','painter','ac_technician','welder']), 1), 6, 'six are fine');
select public.worker_set_trades (array['plumber', 'electrician']);
reset role;

select public._t_as ('c1');
select throws_ok ($$ select public.worker_set_trades (array['plumber']) $$, 'P0001', 'only workers can set their trades', 'a customer cannot set trades');
reset role;
select public._t_as_anon ();
select throws_ok ($$ select public.worker_set_trades (array['plumber']) $$, '42501', null, 'a guest cannot either');
reset role;

-- The second trade really works: a customer can now ask Usman for an electrician job.
select public._t_as ('c1');
select lives_ok ($$ select public.create_direct_request (public._t_id ('w1'), 'Fan not working', 'The ceiling fan stopped', 'electrician') $$,
  'a customer can request the worker for the second trade');
reset role;
select public._t_as ('c1');
select throws_ok ($$ select public.create_direct_request (public._t_id ('w1'), 'Fix a weld', 'A gate hinge needs welding', 'welder') $$,
  'P0001', 'worker not available for this category', 'but not for a trade they do not have');
reset role;

-- More service types.
select cmp_ok ((select count (*)::int from public.service_templates where category = 'plumbing' and active), '>=', 5, 'plumbing has several service types');
select cmp_ok ((select count (*)::int from public.service_templates where category = 'electrical' and active), '>=', 5, 'electrical too');
select cmp_ok ((select count (*)::int from public.service_templates where category in ('hvac','carpentry','painting','welding') and active), '>=', 12, 'and the other trades');
select is ((select count (*)::int from public.service_templates where title like 'Other % work'), 6, 'every trade has an Other choice');

select * from finish ();
rollback;
