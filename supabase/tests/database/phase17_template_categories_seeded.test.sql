-- Phase 6 (categories across services and nearby): behaviour with seeded users.
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

-- ─── The starter catalog covers every skill ──────────────────────────────
select is (
  (select count(distinct category) from public.service_templates
   where active and category in ('electrical', 'plumbing', 'carpentry', 'painting', 'hvac', 'welding')),
  6::bigint, 'every skill category has an active service template');
select is ((select count(*) from public.service_templates where category = 'carpentry' and active), 1::bigint, 'carpentry has a starter template');
select is ((select count(*) from public.service_templates where category = 'painting' and active), 1::bigint, 'painting has a starter template');
select is ((select count(*) from public.service_templates where category = 'welding' and active), 1::bigint, 'welding has a starter template');
select is ((select count(*) from public.service_templates where category in ('plumber', 'electrician', 'carpenter', 'painter', 'ac_technician', 'welder')), 0::bigint,
  'templates use their own category names, not the skill keys (the app maps between them)');

-- ─── Listings: two plumbing, one electrical ──────────────────────────────
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w1'), id, 'Plumbing by Usman', 2500, 'active' from public.service_templates where slug = 'plumbing_leak_basic';
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w2'), id, 'Geyser by Zaid', 3000, 'active' from public.service_templates where slug = 'geyser_install';
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w3'), id, 'Wiring by Hamid', 2000, 'active' from public.service_templates where slug = 'electrical_fan_install';

-- ─── Ranked discovery filters by template category ───────────────────────
select public._t_as_anon ();
select is ((select count(*) from public.rank_listings ('plumbing', 10)), 2::bigint, 'ranking by plumbing returns both plumbing listings');
select is ((select count(*) from public.rank_listings ('electrical', 10)), 1::bigint, 'ranking by electrical returns one');
select is ((select count(*) from public.rank_listings ('hvac', 10)), 0::bigint, 'a category with no listings returns nothing');
select is ((select count(*) from public.rank_listings ('carpentry', 10)), 0::bigint, 'so does carpentry');
select is ((select count(*) from public.rank_listings (null, 10)), 3::bigint, 'no category returns everything');
select is ((select count(*) from public.rank_listings ('plumber', 10)), 0::bigint, 'the skill key is not a template category, so the app must map it first');
select is ((select count(*) from public.rank_listings_v2 ('plumbing', 10)), 2::bigint, 'ranking v2 filters the same way');
select is ((select count(*) from public.rank_listings_v2 ('electrical', 10)), 1::bigint, 'v2 electrical');
select is ((select count(*) from public.rank_listings_with_boosts ('plumbing', 10)), 2::bigint, 'ranking with boosts filters the same way');
select is ((select category from public.rank_listings ('electrical', 10)), 'electrical', 'each row reports its template category');
select is ((select worker_display_name from public.rank_listings ('electrical', 10)), 'Hamid', 'and the worker name');
select is ((select count(*) from public.phase5_discover_listings ('karachi', 'plumbing', 10, false)), 2::bigint, 'city-aware discovery filters the same way');
select is ((select count(*) from public.phase5_discover_listings ('karachi', 'electrical', 10, true)), 1::bigint, 'including with boosts on');
reset role;

-- ─── The fallback read path (no ranking) ─────────────────────────────────
select public._t_as_anon ();
select is ((select count(*) from public.worker_service_listings where status = 'active'), 3::bigint, 'a guest can read all active listings');
reset role;

-- ─── Paused and draft listings stay hidden ───────────────────────────────
update public.worker_service_listings set status = 'paused' where headline = 'Wiring by Hamid';
select public._t_as_anon ();
select is ((select count(*) from public.rank_listings ('electrical', 10)), 0::bigint, 'a paused listing is not ranked');
select is ((select count(*) from public.worker_service_listings), 2::bigint, 'and is not readable by guests');
select public._t_as ('w3');
select is ((select count(*) from public.worker_service_listings where worker_id = public._t_id ('w3')), 1::bigint, 'but its owner still reads it');
reset role;
update public.worker_service_listings set status = 'active' where headline = 'Wiring by Hamid';

-- ─── A suspended worker disappears from discovery ────────────────────────
update public.profiles set status = 'suspended' where id = public._t_id ('w1');
select public._t_as_anon ();
select is ((select count(*) from public.rank_listings ('plumbing', 10)), 1::bigint, 'ranking no longer returns a suspended worker''s listing');
select is ((select worker_display_name from public.rank_listings ('plumbing', 10)), 'Zaid', 'only the active worker remains');
select is ((select count(*) from public.rank_listings_v2 ('plumbing', 10)), 1::bigint, 'ranking v2 agrees');
select is ((select count(*) from public.rank_listings_with_boosts ('plumbing', 10)), 1::bigint, 'ranking with boosts agrees');
select is ((select count(*) from public.phase5_discover_listings ('karachi', 'plumbing', 10, false)), 1::bigint, 'city-aware discovery agrees');
select is ((select count(*) from public.worker_service_listings), 2::bigint, 'a guest reading the table sees only active workers'' listings');
select public._t_as ('c1');
select is ((select count(*) from public.worker_service_listings), 2::bigint, 'a customer does too');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumber', 30)), 1::bigint, 'and Nearby leaves the suspended worker out');
select public._t_as ('w1');
select is ((select count(*) from public.worker_service_listings where worker_id = public._t_id ('w1')), 1::bigint, 'the suspended worker can still read their own listing');
reset role;
update public.profiles set status = 'active' where id = public._t_id ('w1');
select public._t_as_anon ();
select is ((select count(*) from public.rank_listings ('plumbing', 10)), 2::bigint, 'reactivating the worker brings the listing back');
reset role;

-- ─── Nearby uses skill keys ──────────────────────────────────────────────
select public._t_as ('c1');
select is ((select user_id from public.nearby_workers (24.86, 67.00, 'electrician', 30)), public._t_id ('w3'), 'Nearby filters by skill key: the electrician');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'carpenter', 30)), 0::bigint, 'no carpenter is nearby');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumbing', 30)), 0::bigint, 'and a template category is not a skill key');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumber', 30)), 2::bigint, 'two approved plumbers are nearby');
reset role;

select * from finish ();
rollback;
