-- listing_card_info: what a service card shows about the Ustad, with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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

-- Listings: an active one by an approved Ustad with a rating, a draft one, and one by an unapproved Ustad.
update public.worker_profiles set avg_rating = 4.7, review_count = 12 where user_id = public._t_id ('w1');
insert into public.worker_service_listings (id, worker_id, template_id, headline, status) values
  ('50000000-0000-0000-0000-000000000001', public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'), 'Leak repair', 'active'),
  ('50000000-0000-0000-0000-000000000002', public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'), 'Draft one', 'draft'),
  ('50000000-0000-0000-0000-000000000003', public._t_id ('w4'), (select id from public.service_templates where slug = 'plumbing_leak_basic'), 'Pending one', 'active');

-- Two finished jobs and one still open for w1.
insert into public.jobs (customer_id, worker_id, title, description, category, status, origin) values
  (public._t_id ('c1'), public._t_id ('w1'), 'Done 1', 'x', 'plumber', 'closed', 'customer_job'),
  (public._t_id ('c2'), public._t_id ('w1'), 'Done 2', 'x', 'plumber', 'completed', 'customer_job'),
  (public._t_id ('c1'), public._t_id ('w1'), 'Busy', 'x', 'plumber', 'assigned', 'customer_job');

select public._t_as_anon ();
select is ((select count (*)::int from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid,
  '50000000-0000-0000-0000-000000000002'::uuid, '50000000-0000-0000-0000-000000000003'::uuid])), 2,
  'a guest gets cards for active listings only');
select is ((select worker_name from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), 'Usman', 'with the Ustad name');
select is ((select rating from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), 4.70::numeric, 'and the rating');
select is ((select review_count from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), 12, 'and the review count');
select is ((select verified from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), true, 'verified when approved');
select is ((select jobs_done from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), 2, 'jobs done counts finished jobs only');
select is ((select verified from public.listing_card_info (array['50000000-0000-0000-0000-000000000003'::uuid])), false, 'not verified when the Ustad is not approved');
select is ((select count (*)::int from public.listing_card_info (null)), 0, 'no ids gives nothing');
reset role;

select public._t_as ('c1');
select is ((select count (*)::int from public.listing_card_info (array['50000000-0000-0000-0000-000000000001'::uuid])), 1, 'a signed-in customer gets the card too');
reset role;

select * from finish ();
rollback;
