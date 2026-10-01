-- Voice notes on quotes and threads, and the typical price: behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

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
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);

-- c1 posts job J; w1 and w2 quote on it.
select public._t_as ('c1');
select set_config ('t.j', (select job_id from public.post_job ('Fix tap', 'The kitchen tap is leaking badly', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.q1', (select public.worker_send_quote (current_setting ('t.j')::uuid, 1500, null, 'fixed', current_date + 1))::text, true);
reset role;
select public._t_as ('w2');
select set_config ('t.q2', (select public.worker_send_quote (current_setting ('t.j')::uuid, 1800, null, 'fixed', current_date + 1))::text, true);
reset role;

-- ─── Voice note on a quote ───────────────────────────────────────────────
select public._t_setting ('quote_upgrades_enabled', 'false'::jsonb);
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 10)$$, current_setting ('t.q1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/a.m4a'), 'quote details are not enabled', 'blocked while the flag is off');
reset role;
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);
select public._t_as ('w2');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 10)$$, current_setting ('t.q1'), public._t_id ('w2') || '/' || current_setting ('t.j') || '/a.m4a'), 'quote not found', 'another worker cannot attach to my quote');
reset role;
select public._t_as ('c1');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 10)$$, current_setting ('t.q1'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/a.m4a'), 'quote not found', 'the customer cannot attach to a quote');
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 31)$$, current_setting ('t.q1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/a.m4a'), 'a voice note can be up to 30 seconds', 'over 30 seconds is rejected');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 0)$$, current_setting ('t.q1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/a.m4a'), 'a voice note can be up to 30 seconds', 'a zero length is rejected');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 10)$$, current_setting ('t.q1'), public._t_id ('w2') || '/' || current_setting ('t.j') || '/a.m4a'), 'invalid file path', 'the path must be in my own folder');
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 10)$$, current_setting ('t.q1'), public._t_id ('w1') || '/' || gen_random_uuid () || '/a.m4a'), 'invalid file path', 'and in this jobs folder');
select lives_ok(format ($$select public.worker_attach_quote_voice (%L, %L, 12)$$, current_setting ('t.q1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), 'a 12 second voice note is attached');
reset role;
select is ((select audio_seconds from public.quotes where id = current_setting ('t.q1')::uuid), 12, 'its length is stored');
select public._t_as ('c1');
select is ((select audio_path is not null from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w1')), true, 'the owner sees that the quote has a voice note');
select is ((select audio_path is null from public.job_quotes (current_setting ('t.j')::uuid) where worker_id = public._t_id ('w2')), true, 'and that the other one has none');
reset role;
select public._t_as ('c2');
select is ((select count(*) from public.job_quotes (current_setting ('t.j')::uuid)), 0::bigint, 'a stranger gets no quotes');
reset role;

-- Who may hear it (the rule behind the private bucket)
select public._t_as ('c1');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), true, 'the job owner may hear a quote voice note');
reset role;
select public._t_as ('w1');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), true, 'the worker who recorded it may');
reset role;
select public._t_as ('w2');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), false, 'another worker may not');
reset role;
select public._t_as ('c2');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), false, 'another customer may not');
reset role;
select public._t_as ('adm');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/q1.m4a'), true, 'an admin may');
reset role;
select public._t_as ('c1');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/unregistered.m4a'), false, 'a file nobody registered cannot be heard');
reset role;
select public._t_as_anon ();
select throws_ok(format ($$select public.worker_attach_quote_voice (%L, 'x/y/z.m4a', 5)$$, current_setting ('t.q1')), '42501', null, 'a guest cannot attach a voice note');
reset role;

-- ─── Voice notes in the thread ───────────────────────────────────────────
select public._t_as ('w1');
select lives_ok(format ($$select public.post_thread_voice (%L, %L, %L, 8)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/t1.m4a'), 'the worker sends a voice note');
reset role;
select public._t_as ('c1');
select lives_ok(format ($$select public.post_thread_voice (%L, %L, %L, 5)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('c1') || '/' || current_setting ('t.j') || '/t2.m4a'), 'the customer answers with a voice note');
reset role;
select public._t_as ('w1');
select public.post_thread_message (current_setting ('t.j')::uuid, public._t_id ('w1'), 'Can I see the tap first?', null);
reset role;
select public._t_as ('c1');
select is ((select count(*) from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1'))), 3::bigint, 'the thread has three messages');
select is ((select count(*) from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1')) where audio_path is not null and body is null), 2::bigint, 'two of them are voice notes without text');
select is ((select sender_role from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1')) where audio_seconds = 5), 'customer', 'and the customer one is marked as theirs');
reset role;
select public._t_as ('w1');
select is ((select count(*) from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1'))), 3::bigint, 'the worker sees the same thread');
reset role;
select public._t_as ('w2');
select is ((select count(*) from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1'))), 0::bigint, 'another worker cannot read it');
reset role;
select public._t_as ('c2');
select is ((select count(*) from public.list_thread (current_setting ('t.j')::uuid, public._t_id ('w1'))), 0::bigint, 'nor another customer');
reset role;
select public._t_as ('c1');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/t1.m4a'), true, 'the owner may hear the worker thread voice note');
reset role;
select public._t_as ('w1');
select is (public._quote_voice_readable (public._t_id ('c1') || '/' || current_setting ('t.j') || '/t2.m4a'), true, 'the worker may hear the customer one');
reset role;
select public._t_as ('w2');
select is (public._quote_voice_readable (public._t_id ('w1') || '/' || current_setting ('t.j') || '/t1.m4a'), false, 'another worker may not');
reset role;
select public._t_as ('w2');
select throws_ok(format ($$select public.post_thread_voice (%L, %L, %L, 5)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('w2') || '/' || current_setting ('t.j') || '/x.m4a'), 'not allowed', 'another worker cannot post into this thread');
reset role;
select public._t_as ('c2');
select throws_ok(format ($$select public.post_thread_voice (%L, %L, %L, 5)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('c2') || '/' || current_setting ('t.j') || '/x.m4a'), 'not allowed', 'another customer cannot post into it');
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select public.post_thread_voice (%L, %L, %L, 31)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('w1') || '/' || current_setting ('t.j') || '/x.m4a'), 'a voice note can be up to 30 seconds', 'over 30 seconds is rejected');
select throws_ok(format ($$select public.post_thread_voice (%L, %L, %L, 5)$$, current_setting ('t.j'), public._t_id ('w1'), public._t_id ('w2') || '/' || current_setting ('t.j') || '/x.m4a'), 'invalid file path', 'the path must be in my own folder');
reset role;
select public._t_as_anon ();
select throws_ok(format ($$select public.post_thread_voice (%L, %L, 'x/y/z.m4a', 5)$$, current_setting ('t.j'), public._t_id ('w1')), '42501', null, 'a guest cannot send a voice note');
reset role;
select throws_ok($$insert into public.job_thread_messages (job_id, worker_id, sender_role, body) values (current_setting ('t.j')::uuid, public._t_id ('w1'), 'worker', null)$$, '23514', null, 'a message needs text or a voice note');
select lives_ok($$insert into public.job_thread_messages (job_id, worker_id, sender_role, body) values (current_setting ('t.j')::uuid, public._t_id ('w1'), 'worker', 'hello')$$, 'a text message is still fine');
select public._t_as ('c1');
select throws_ok(format ($$select public.post_thread_message (%L, %L, '', null)$$, current_setting ('t.j'), public._t_id ('w1')), 'message must be 1 to 1000 characters', 'an empty text message is still refused');
reset role;

-- ─── Typical price ───────────────────────────────────────────────────────
create function public._t_paid_job (p_city text, p_amount numeric, p_age interval default interval '1 day', p_status text default 'paid', p_category text default 'plumber')
returns void language plpgsql as $$
declare jid uuid;
begin
  insert into public.jobs (customer_id, worker_id, title, description, category, status, origin, city)
  values (public._t_id ('c2'), public._t_id ('w2'), 'Paid job', 'Setup job for the typical price', p_category, 'closed', 'customer_job', p_city)
  returning id into jid;
  insert into public.payment_ledger (job_id, amount_pkr, payer_id, payee_id, method, status, created_at)
  values (jid, p_amount, public._t_id ('c2'), public._t_id ('w2'), 'cash', p_status, now () - p_age);
end $$;

select is ((select count(*) from public.typical_price ('plumber', 'Karachi')), 0::bigint, 'no price range without paid jobs');
select public._t_as_anon ();
select is ((select count(*) from public.typical_price ('plumber', 'Karachi')), 0::bigint, 'a guest may ask, and gets nothing yet');
reset role;
select public._t_paid_job ('Karachi', 1000);
select public._t_paid_job ('Karachi', 1000);
select public._t_paid_job ('Karachi', 1000);
select public._t_paid_job ('Karachi', 1000);
select public._t_paid_job ('Karachi', 1500);
select public._t_paid_job ('Karachi', 1500);
select public._t_paid_job ('Karachi', 2000);
select public._t_paid_job ('Karachi', 2000);
select public._t_paid_job ('Karachi', 2000);
select is ((select count(*) from public.typical_price ('plumber', 'Karachi')), 0::bigint, 'nine paid jobs are too few to show a range');
select public._t_paid_job ('Karachi', 2500);
select is ((select scope from public.typical_price ('plumber', 'Karachi')), 'city', 'ten paid jobs in the city show a city range');
select is ((select sample_size from public.typical_price ('plumber', 'Karachi')), 10, 'from ten jobs');
select is ((select low_pkr from public.typical_price ('plumber', 'Karachi')), 1000::numeric, 'the low end is the 25th percentile');
select is ((select median_pkr from public.typical_price ('plumber', 'Karachi')), 1500::numeric, 'the middle is the median');
select is ((select high_pkr from public.typical_price ('plumber', 'Karachi')), 2000::numeric, 'the high end is the 75th percentile');
select is ((select scope from public.typical_price ('plumber', 'Lahore')), 'category', 'another city falls back to the whole category');
select is ((select scope from public.typical_price ('plumber')), 'category', 'no city means the whole category');
select is ((select count(*) from public.typical_price ('electrician', 'Karachi')), 0::bigint, 'another category has no range');
select is ((select count(*) from public.typical_price ('', 'Karachi')), 0::bigint, 'an empty category has no range');
select public._t_as ('c1');
select is ((select median_pkr from public.typical_price ('plumber', 'Karachi')), 1500::numeric, 'a customer sees the same range');
reset role;
select public._t_as_anon ();
select is ((select median_pkr from public.typical_price ('plumber', 'Karachi')), 1500::numeric, 'and so does a guest');
reset role;
select public._t_paid_job ('Karachi', 90000, interval '100 days');
select public._t_paid_job ('Karachi', 90000, interval '100 days');
select public._t_paid_job ('Karachi', 90000, interval '100 days');
select public._t_paid_job ('Karachi', 90000, interval '100 days');
select public._t_paid_job ('Karachi', 90000, interval '100 days');
select public._t_paid_job ('Karachi', 90000, interval '1 day', 'refunded');
select public._t_paid_job ('Karachi', 90000, interval '1 day', 'refunded');
select public._t_paid_job ('Karachi', 90000, interval '1 day', 'refunded');
select public._t_paid_job ('Karachi', 90000, interval '1 day', 'refunded');
select public._t_paid_job ('Karachi', 90000, interval '1 day', 'refunded');
select is ((select high_pkr from public.typical_price ('plumber', 'Karachi')), 2000::numeric, 'payments older than 90 days and refunds are ignored');
select is ((select sample_size from public.typical_price ('plumber', 'Karachi')), 10, 'and are not counted');
select public._t_setting ('typical_price_min_jobs', '20'::jsonb);
select is ((select count(*) from public.typical_price ('plumber', 'Karachi')), 0::bigint, 'the minimum number of jobs is a setting');
select public._t_setting ('typical_price_min_jobs', '10'::jsonb);
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);

select * from finish ();
rollback;
