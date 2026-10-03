-- Profile guards: who may change roles, approval, ratings and trades, with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

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

-- ─── profiles: role and status ───
select public._t_as ('c1');
select throws_ok ($$ update public.profiles set role = 'admin' where id = auth.uid () $$, 'P0001', 'you cannot change your role to that', 'a customer cannot make themselves an admin');
select lives_ok ($$ update public.profiles set role = 'worker' where id = auth.uid () $$, 'a customer can still switch to worker');
select lives_ok ($$ update public.profiles set role = 'customer' where id = auth.uid () $$, 'and back');
select throws_ok ($$ update public.profiles set status = 'suspended' where id = auth.uid () $$, 'P0001', 'only an admin can change the account status', 'nobody changes their own account status');
select lives_ok ($$ update public.profiles set preferred_language = 'ur', display_name = 'Ali R', city = 'Lahore' where id = auth.uid () $$, 'language, name and city are still theirs to change');
reset role;
select is ((select role from public.profiles where id = public._t_id ('c1')), 'customer', 'the role is unchanged');

select public._t_as ('adm');
select lives_ok ($$ update public.profiles set status = 'active', role = 'worker' where id = public._t_id ('c2') $$, 'an admin can change role and status');
reset role;
select public._t_as ('adm');
select lives_ok ($$ update public.profiles set role = 'customer' where id = public._t_id ('c2') $$, 'and put it back');
reset role;

-- ─── worker_profiles: approval, verification, ratings, identity, trades ───
select public._t_as ('w4');
select throws_ok ($$ update public.worker_profiles set approval_status = 'approved' where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'a worker cannot approve themselves');
select throws_ok ($$ update public.worker_profiles set rejection_reason = null, approval_reviewed_at = now () where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'nor fake a review');
select throws_ok ($$ update public.worker_profiles set is_verified = true where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'nor mark themselves verified');
select throws_ok ($$ update public.worker_profiles set avg_rating = 5, review_count = 99 where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'nor give themselves a rating');
select throws_ok ($$ update public.worker_profiles set commission_suspended = true where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'nor touch the commission suspension');
select throws_ok ($$ update public.worker_profiles set cnic_number = '4210100000000' where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'nor change the CNIC they were approved on');
select throws_ok ($$ update public.worker_profiles set categories = array['electrician'] where user_id = auth.uid () $$, 'P0001', 'only an admin can change that', 'trades go through worker_set_trades, not a direct edit');
select lives_ok ($$ update public.worker_profiles set bio = 'Plumber', rate_pkr = 900, lat = 24.9, lng = 67.1, is_available = true, working_hours = '9-5' where user_id = auth.uid () $$, 'bio, rate, location and availability are still theirs');
select lives_ok ($$ update public.worker_profiles set photo_url = 'https://x/p.jpg', cnic_front_url = 'a/b.jpg', cnic_back_url = 'a/c.jpg' where user_id = auth.uid () $$, 'and the files they upload');
reset role;
select is ((select approval_status from public.worker_profiles where user_id = public._t_id ('w4')), 'pending', 'the worker is still pending');

-- Things that must keep working because they run with owner rights.
select public._t_as ('adm');
select lives_ok ($$ select public.admin_set_worker_approval (public._t_id ('w4'), 'approved', null) $$, 'an admin can approve through the admin function');
reset role;
select is ((select approval_status from public.worker_profiles where user_id = public._t_id ('w4')), 'approved', 'and it sticks');
select public._t_as ('w1');
select lives_ok ($$ select public.worker_set_trades (array['plumber', 'electrician']) $$, 'a worker can set trades through the function');
select lives_ok ($$ select public.worker_set_availability (false) $$, 'and availability');
reset role;
select is ((select categories from public.worker_profiles where user_id = public._t_id ('w1')), array['plumber', 'electrician'], 'the trades were saved');

-- A customer with no worker profile cannot create an approved one.
select public._t_as ('c2');
select throws_ok ($$ insert into public.worker_profiles (user_id, approval_status) values (public._t_id ('c2'), 'approved') $$, 'P0001', 'a new worker profile starts as pending', 'nobody creates themselves as an approved worker');
select throws_ok ($$ insert into public.worker_profiles (user_id, is_verified) values (public._t_id ('c2'), true) $$, 'P0001', 'a new worker profile starts as pending', 'nor as verified');
reset role;

select * from finish ();
rollback;
