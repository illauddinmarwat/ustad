-- Job media (photos, voice notes, video) and job posting without a budget: behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(64);

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

-- c1 posts two plumbing jobs (J for media, K for expiry checks); c2 posts one.
select public._t_as ('c1');
select set_config ('t.j', (select job_id from public.post_job ('Fix tap', 'The kitchen tap is leaking badly', 'plumber', 'Karachi'))::text, true);
select set_config ('t.k', (select job_id from public.post_job ('Fix basin', 'The bathroom basin is cracked', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('c2');
select set_config ('t.o', (select job_id from public.post_job ('Fix sink', 'The sink is blocked again', 'plumber', 'Karachi'))::text, true);
reset role;

select is ((select budget_min_pkr from public.jobs where id = current_setting ('t.j')::uuid), null::numeric, 'a posted job has no budget');

-- ─── Flag ────────────────────────────────────────────────────────────────
select public._t_setting ('job_media_enabled', 'false'::jsonb);
select public._t_as ('c1');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 1000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.jpg'),
  'job media is not enabled', 'media is blocked while the flag is off');
reset role;
select public._t_setting ('job_media_enabled', 'true'::jsonb);

-- ─── Adding media ────────────────────────────────────────────────────────
select public._t_as_anon ();
select throws_ok(format ($$select public.add_job_media (%L, 'photo', 'x/y/z.jpg', 1000)$$, current_setting ('t.j')), '42501', null, 'a guest cannot add media');
reset role;

select public._t_as ('c2');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 1000)$$, current_setting ('t.j'), public._t_id ('c2') || '/' || current_setting ('t.j') || '/a.jpg'),
  'job not found or no longer open', 'another customer cannot add media to my job');
reset role;

select public._t_as ('w1');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 1000)$$, current_setting ('t.j'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/a.jpg'),
  'job not found or no longer open', 'a worker cannot add media to a job');
reset role;

select public._t_as ('c1');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 1000)$$, current_setting ('t.j'), public._t_id ('c2') || '/' || current_setting ('t.j') || '/a.jpg'),
  'invalid file path', 'the path must be in my own folder');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 1000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || gen_random_uuid () || '/a.jpg'),
  'invalid file path', 'the path must be in this jobs folder');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 3145729)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/big.jpg'),
  'photo is too large (max 3 MB)', 'a photo over 3 MB is rejected');
select throws_ok(format ($$select public.add_job_media (%L, 'gif', %L, 1000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.gif'),
  'unknown media type', 'an unknown type is rejected');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 0)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.jpg'),
  'invalid file size', 'an empty file is rejected');

select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p1.jpg'), 'photo 1 is accepted');
select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p2.jpg'), 'photo 2 is accepted');
select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p3.jpg'), 'photo 3 is accepted');
select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p4.jpg'), 'photo 4 is accepted');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p5.jpg'),
  'limit reached for this media type', 'a fifth photo is rejected');
select throws_ok(format ($$select public.add_job_media (%L, 'audio', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.m4a'),
  'voice note can be up to 60 seconds', 'audio needs a duration');
select throws_ok(format ($$select public.add_job_media (%L, 'audio', %L, 100000, 61)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.m4a'),
  'voice note can be up to 60 seconds', 'audio over 60 seconds is rejected');
select lives_ok(format ($$select public.add_job_media (%L, 'audio', %L, 100000, 60)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.m4a'), 'a 60 second voice note is accepted');
select throws_ok(format ($$select public.add_job_media (%L, 'audio', %L, 100000, 10)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a2.m4a'),
  'limit reached for this media type', 'a second voice note is rejected');
select throws_ok(format ($$select public.add_job_media (%L, 'video', %L, 1000000, 31)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/v.mp4'),
  'video can be up to 30 seconds', 'video over 30 seconds is rejected');
select throws_ok(format ($$select public.add_job_media (%L, 'video', %L, 26214401, 20)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/v.mp4'),
  'video is too large (max 25 MB)', 'video over 25 MB is rejected');
select lives_ok(format ($$select public.add_job_media (%L, 'video', %L, 5000000, 30)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/v.mp4'), 'a 30 second video is accepted');
select throws_ok(format ($$select public.add_job_media (%L, 'video', %L, 5000000, 10)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/v2.mp4'),
  'limit reached for this media type', 'a second video is rejected');
reset role;

-- ─── Who can see it ──────────────────────────────────────────────────────
select public._t_as ('c1');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 6::bigint, 'the owner sees all six files');
reset role;
select public._t_as ('w1');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 6::bigint, 'a matching approved worker sees them');
reset role;
select public._t_as ('w2');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 6::bigint, 'so does another matching worker, before quoting');
reset role;
select public._t_as ('w3');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 0::bigint, 'a worker in another category sees nothing');
reset role;
select public._t_as ('w4');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 0::bigint, 'a worker who is not approved sees nothing');
reset role;
select public._t_as ('c2');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 0::bigint, 'another customer sees nothing');
reset role;
select public._t_as ('adm');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 6::bigint, 'an admin sees them');
reset role;
select public._t_as_anon ();
select throws_ok(format ($$select * from public.list_job_media (%L)$$, current_setting ('t.j')), '42501', null, 'a guest cannot list media');
select throws_ok($$select * from public.job_media$$, '42501', null, 'the table is not readable directly');
reset role;

-- Storage read rule (used by the private bucket policy).
select public._t_as ('w1');
select is (public._job_media_path_readable (public._t_id ('c1') || '/' || current_setting ('t.j') || '/p1.jpg'), true, 'a matching worker may read a registered file');
select is (public._job_media_path_readable (public._t_id ('c1') || '/' || current_setting ('t.j') || '/unregistered.jpg'), false, 'an unregistered file cannot be read');
reset role;
select public._t_as ('w3');
select is (public._job_media_path_readable (public._t_id ('c1') || '/' || current_setting ('t.j') || '/p1.jpg'), false, 'a worker in another category may not read it');
reset role;
select is (public._job_media_path_job ('a/not-a-uuid/x.jpg'), null::uuid, 'a malformed path has no job');
select is (public._job_media_path_job (public._t_id ('c1') || '/' || current_setting ('t.j') || '/x.jpg'), current_setting ('t.j')::uuid, 'a good path names its job');

-- ─── Board counts ────────────────────────────────────────────────────────
select public._t_as ('w1');
select is ((select photos from public.job_media_counts (array[current_setting ('t.j')::uuid])), 4, 'the board shows four photos');
select is ((select audios from public.job_media_counts (array[current_setting ('t.j')::uuid])), 1, 'one voice note');
select is ((select videos from public.job_media_counts (array[current_setting ('t.j')::uuid])), 1, 'and one video');
reset role;
select public._t_as ('w3');
select is ((select count(*) from public.job_media_counts (array[current_setting ('t.j')::uuid])), 0::bigint, 'counts are hidden from non-matching workers');
reset role;

-- ─── Removing media ──────────────────────────────────────────────────────
select set_config ('t.m1', (select id from public.job_media where path like '%/p1.jpg')::text, true);
select set_config ('t.m2', (select id from public.job_media where path like '%/p2.jpg')::text, true);
select public._t_as ('c2');
select throws_ok(format ($$select public.remove_job_media (%L)$$, current_setting ('t.m1')::uuid), 'media not found', 'another customer cannot remove my media');
reset role;
select public._t_as ('c1');
select is (public.remove_job_media (current_setting ('t.m1')::uuid), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p1.jpg', 'removing returns the stored path');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 5::bigint, 'the removed file is no longer listed');
select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/p6.jpg'), 'removing frees a slot');
reset role;
select public._t_as ('w1');
select is (public._job_media_path_readable (public._t_id ('c1') || '/' || current_setting ('t.j') || '/p1.jpg'), false, 'a removed file can no longer be read');
reset role;
select public._t_as ('adm');
select lives_ok(format ($$select public.remove_job_media (%L)$$, current_setting ('t.m2')::uuid), 'an admin can remove media');
reset role;

-- ─── Job state ───────────────────────────────────────────────────────────
-- Job K expires: the owner still sees its media, workers no longer do.
select public._t_as ('c1');
select lives_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.k'), public._t_id ('c1') || '/' || current_setting ('t.k') || '/k1.jpg'), 'media on the second job');
reset role;
update public.jobs set expires_at = now () - interval '1 hour' where id = current_setting ('t.k')::uuid;
select public._t_as ('w1');
select is ((select count(*) from public.list_job_media (current_setting ('t.k')::uuid)), 0::bigint, 'workers cannot see media on an expired job');
reset role;
select public._t_as ('c1');
select is ((select count(*) from public.list_job_media (current_setting ('t.k')::uuid)), 1::bigint, 'the owner still can');
reset role;

-- Job J is assigned to w1: only that worker keeps access, and no more media can be added.
update public.jobs set worker_id = public._t_id ('w1'), status = 'assigned' where id = current_setting ('t.j')::uuid;
select public._t_as ('w1');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 5::bigint, 'the assigned worker keeps access');
reset role;
select public._t_as ('w2');
select is ((select count(*) from public.list_job_media (current_setting ('t.j')::uuid)), 0::bigint, 'other workers lose access once it is assigned');
reset role;
select public._t_as ('c1');
select throws_ok(format ($$select public.add_job_media (%L, 'photo', %L, 100000)$$, current_setting ('t.j'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/late.jpg'),
  'job not found or no longer open', 'no media can be added after assignment');
reset role;

-- ─── Clean-up ────────────────────────────────────────────────────────────
select public._t_as ('c1');
select throws_ok($$select * from public.admin_job_media_to_purge ()$$, 'admin only', 'only an admin can list files to purge');
select throws_ok($$select public.admin_mark_job_media_purged (array[gen_random_uuid ()])$$, 'admin only', 'only an admin can mark files purged');
reset role;
select public._t_as ('adm');
select is ((select count(*) from public.admin_job_media_to_purge ()), 2::bigint, 'files that were removed are listed for purging');
reset role;
update public.jobs set expires_at = now () - interval '8 days' where id = current_setting ('t.k')::uuid;
select public._t_as ('adm');
select is ((select count(*) from public.admin_job_media_to_purge ()), 3::bigint, 'files of a job that expired over a week ago are listed too');
select is ((select count(*) from public.admin_job_media_to_purge () where path like '%/p3.jpg' or path like '%/v.mp4'), 0::bigint, 'files of a live assigned job are never listed');
select is (public.admin_mark_job_media_purged (array (select id from public.admin_job_media_to_purge ())), 3, 'marking purged reports how many');
select is ((select count(*) from public.admin_job_media_to_purge ()), 0::bigint, 'nothing is left to purge');
reset role;
select public._t_as ('c1');
select is ((select count(*) from public.list_job_media (current_setting ('t.k')::uuid)), 0::bigint, 'a purged file is no longer listed');
reset role;

-- ─── Bucket accepts what the app records ─────────────────────────────────
select ok ((select 'audio/mp4' = any (allowed_mime_types) and 'audio/webm' = any (allowed_mime_types) and 'audio/3gpp' = any (allowed_mime_types) from storage.buckets where id = 'job-media'), 'the bucket accepts the voice note types the app records');
select ok ((select 'video/mp4' = any (allowed_mime_types) and 'video/quicktime' = any (allowed_mime_types) and 'image/jpeg' = any (allowed_mime_types) from storage.buckets where id = 'job-media'), 'the bucket accepts the video types the app records, and photos');
select ok ((select not ('application/pdf' = any (allowed_mime_types)) and not ('text/html' = any (allowed_mime_types)) from storage.buckets where id = 'job-media'), 'the bucket still refuses other file types');

select * from finish ();
rollback;
