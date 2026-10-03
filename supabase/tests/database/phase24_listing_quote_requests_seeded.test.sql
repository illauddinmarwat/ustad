-- Service listings without a price, listing photos, and Request a quote from a listing: behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

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

-- Flags: direct requests on (the base feature), listing quote requests still off.
select public._t_setting ('direct_requests_enabled', 'true'::jsonb);

-- ─── Listings carry no price ───
select public._t_as ('w1');
select lives_ok (
  $$ insert into public.worker_service_listings (id, worker_id, template_id, headline, detail_text, status)
     values ('40000000-0000-0000-0000-000000000001', public._t_id ('w1'),
       (select id from public.service_templates where slug = 'plumbing_leak_basic'),
       'Leak and tap repair', 'Mixers and pipes', 'active') $$,
  'a worker can publish a listing without a price');
select lives_ok (
  $$ insert into public.worker_service_listings (id, worker_id, template_id, headline, status)
     values ('40000000-0000-0000-0000-000000000002', public._t_id ('w1'),
       (select id from public.service_templates where slug = 'plumbing_leak_basic'), 'Draft listing', 'draft') $$,
  'a draft listing can be saved');
reset role;
insert into public.worker_service_listings (id, worker_id, template_id, headline, status)
values ('40000000-0000-0000-0000-000000000003', public._t_id ('w4'),
  (select id from public.service_templates where slug = 'plumbing_leak_basic'), 'Pending worker listing', 'active');
select is ((select price_pkr from public.worker_service_listings where id = '40000000-0000-0000-0000-000000000001'),
  null::numeric, 'the stored listing has no price');

-- ─── Request a quote: gates ───
select public._t_as ('c1');
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000001', 'Fix tap', 'Tap is leaking') $$,
  'P0001', 'quote requests from listings are not enabled', 'blocked while the flag is off');
reset role;
select public._t_setting ('listing_quote_requests_enabled', 'true'::jsonb);

select public._t_as_anon ();
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000001', 'Fix tap', 'Tap is leaking') $$,
  '42501', null, 'a guest cannot request a quote from a listing');
reset role;

select public._t_as ('c1');
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000002', 'Fix tap', 'Tap is leaking') $$,
  'P0001', 'listing not available', 'a draft listing cannot be requested');
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000003', 'Fix tap', 'Tap is leaking') $$,
  'P0001', 'worker not available for this category', 'a listing of an unapproved worker cannot be requested');
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000001', '', 'Tap is leaking') $$,
  'P0001', 'title and description are required', 'title is required');
reset role;

select public._t_as ('w1');
select throws_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000001', 'Fix tap', 'Tap is leaking') $$,
  'P0001', 'cannot request yourself', 'an Ustad cannot request a quote from their own listing');
reset role;

-- ─── Request a quote: the happy path ───
select public._t_as ('c1');
select lives_ok (
  $$ select public.create_listing_request ('40000000-0000-0000-0000-000000000001', 'Fix tap', 'Tap is leaking badly', 'Gulshan', 'Tomorrow 5pm') $$,
  'a customer can request a quote from a listing');
reset role;
select is (
  (select count (*)::int from public.jobs
   where listing_id = '40000000-0000-0000-0000-000000000001' and customer_id = public._t_id ('c1')
     and target_worker_id = public._t_id ('w1') and category = 'plumber' and status = 'open'
     and origin = 'customer_job' and budget_pkr is null),
  1, 'it creates an open direct request for that Ustad, tagged with the listing, with no budget');

select public._t_as ('w2');
select is ((select count (*)::int from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'), 0,
  'another Ustad cannot see the request');
reset role;
select public._t_as ('c2');
select is ((select count (*)::int from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'), 0,
  'another customer cannot see the request');
reset role;
select public._t_as ('w1');
select is ((select count (*)::int from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'), 1,
  'the Ustad sees the request');
select lives_ok (
  $$ select public.worker_quote_direct_request ((select id from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'), 1800, 'Can come tomorrow') $$,
  'the Ustad answers with a quote');
reset role;
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);
select public._t_as ('w1');
select is ((select count (*)::int from public.get_board_job ((select id from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'))), 1,
  'the Ustad can open the request in full, as on the job board');
select lives_ok (
  $$ select public.worker_send_quote ((select id from public.jobs where listing_id = '40000000-0000-0000-0000-000000000001'), 2000, 'Better price', 'fixed', current_date + 1) $$,
  'the Ustad can also quote with a price type and start date');
reset role;
select is ((select count (*)::int from public.quotes q join public.jobs j on j.id = q.job_id
  where j.listing_id = '40000000-0000-0000-0000-000000000001' and q.status = 'pending'), 1,
  'the quote is the only price on the request');

-- ─── Listing photos ───
select public._t_as ('w1');
select lives_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001',
       public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000001/a.jpg', 1000) $$,
  'the owner can add a photo');
select throws_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001', 'someone/else/a.jpg', 1000) $$,
  'P0001', 'invalid file path', 'a path outside the owner folder is refused');
select throws_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001',
       public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000001/big.jpg', 4000000) $$,
  'P0001', 'photo is too large (max 3 MB)', 'a photo over 3 MB is refused');
select lives_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001',
       public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000001/b' || g || '.jpg', 1000)
     from generate_series (1, 3) g $$,
  'the owner can add up to four photos');
select throws_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001',
       public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000001/c.jpg', 1000) $$,
  'P0001', 'limit reached: 4 photos per listing', 'a fifth photo is refused');
select lives_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000002',
       public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000002/d.jpg', 1000) $$,
  'a draft listing can have photos');
reset role;

select public._t_as ('w2');
select throws_ok (
  $$ select public.add_listing_media ('40000000-0000-0000-0000-000000000001',
       public._t_id ('w2')::text || '/40000000-0000-0000-0000-000000000001/x.jpg', 1000) $$,
  'P0001', 'listing not found', 'another Ustad cannot add photos to the listing');
reset role;

select public._t_as_anon ();
select is ((select count (*)::int from public.list_listing_media (array['40000000-0000-0000-0000-000000000001'::uuid])), 4,
  'a guest sees the four photos of an active listing');
select is ((select count (*)::int from public.list_listing_media (array['40000000-0000-0000-0000-000000000002'::uuid])), 0,
  'a guest does not see the photos of a draft listing');
reset role;
select public._t_as ('w1');
select is ((select count (*)::int from public.list_listing_media (array['40000000-0000-0000-0000-000000000002'::uuid])), 1,
  'the owner sees the photos of their draft listing');
reset role;

select set_config ('t.media_a', (select id::text from public.listing_media where path like '%/a.jpg'), true);
select public._t_as ('w2');
select throws_ok (
  $$ select public.remove_listing_media (current_setting ('t.media_a')::uuid) $$,
  'P0001', 'photo not found', 'another Ustad cannot remove the photo');
reset role;
select public._t_as ('w1');
select is (
  (select public.remove_listing_media (current_setting ('t.media_a')::uuid)),
  public._t_id ('w1')::text || '/40000000-0000-0000-0000-000000000001/a.jpg',
  'the owner removes a photo and gets its path back');
reset role;
select is ((select count (*)::int from public.listing_media where listing_id = '40000000-0000-0000-0000-000000000001' and removed_at is null),
  3, 'three photos remain');

select * from finish ();
rollback;
