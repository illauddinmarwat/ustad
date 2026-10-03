-- AI help and English/Urdu posts: contact check, translations, listing rules, AI allowance and admin usage, with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

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

-- ─── Contact check ───
select is (public._contains_contact ('call 0300 1234567'), true, 'a Latin phone number is caught');
select is (public._contains_contact ('رابطہ ۰۳۰۰۱۲۳۴۵۶۷'), true, 'a phone number in Urdu digits is caught');
select is (public._contains_contact ('٠٣٠٠١٢٣٤٥٦٧'), true, 'a phone number in Arabic-Indic digits is caught');
select is (public._contains_contact ('see www.example.com'), true, 'a link is caught');
select is (public._contains_contact ('کچن کے نل سے پانی ٹپک رہا ہے'), false, 'plain Urdu text passes');
select is (public._contains_contact ('Block 7, house 14'), false, 'short numbers pass');

-- ─── Translation objects ───
select is (public._valid_i18n (null, 120), true, 'no translations is valid');
select is (public._valid_i18n ('{"source":"ur","en":"Leaking tap","ur":"نل لیک","ai":true}'::jsonb, 120), true, 'a complete translations object is valid');
select is (public._valid_i18n ('{"en":"x","fr":"y"}'::jsonb, 120), false, 'an unknown key is refused');
select is (public._valid_i18n ('{"source":"fr"}'::jsonb, 120), false, 'an unknown source language is refused');
select is (public._valid_i18n ('["en"]'::jsonb, 120), false, 'a non-object is refused');
select is (public._valid_i18n ('{"ur":"فون ۰۳۰۰۱۲۳۴۵۶۷"}'::jsonb, 120), false, 'a phone number hidden in a translation is refused');
select is (public._valid_i18n (jsonb_build_object ('en', repeat ('a', 121)), 120), false, 'an over-long translation is refused');

-- ─── post_job with both languages ───
select public._t_as ('c1');
select lives_ok (
  $$ select * from public.post_job ('Kitchen tap leaking', 'Water drips from the mixer even when closed.', 'plumber', 'Karachi', 'Gulshan', 'Tomorrow evening',
       '{"source":"en","en":"Kitchen tap leaking","ur":"کچن کے نل سے پانی ٹپک رہا ہے","ai":true}'::jsonb,
       '{"source":"en","en":"Water drips from the mixer even when closed.","ur":"مکسر بند ہونے کے باوجود پانی ٹپکتا ہے۔","ai":true}'::jsonb) $$,
  'a customer can post a job with English and Urdu versions');
select throws_ok (
  $$ select * from public.post_job ('Kitchen tap leaking', 'Water drips from the mixer even when closed.', 'plumber', null, null, null,
       '{"source":"en","en":"Kitchen tap leaking","ur":"فون ۰۳۰۰۱۲۳۴۵۶۷"}'::jsonb, null) $$,
  'P0001', 'the translations are not valid or contain a phone number or link', 'a phone number in the Urdu title is refused');
select throws_ok (
  $$ select * from public.post_job ('Kitchen tap leaking', 'Call me on ۰۳۰۰۱۲۳۴۵۶۷ please, tap leaks', 'plumber') $$,
  'P0001', 'please do not include phone numbers or links; they are shared after a worker accepts', 'Urdu digits in the description are refused');
select lives_ok (
  $$ select * from public.post_job ('Drain blocked', 'The bathroom drain is blocked again.', 'plumber') $$,
  'a post without translations still works');
reset role;
select is ((select title_i18n ->> 'ur' from public.jobs where title = 'Kitchen tap leaking'), 'کچن کے نل سے پانی ٹپک رہا ہے',
  'the Urdu title is stored');

-- ─── Who can read the other language ───
select set_config ('t.job_k', (select id::text from public.jobs where title = 'Kitchen tap leaking'), true);
select set_config ('t.job_d', (select id::text from public.jobs where title = 'Drain blocked'), true);
select public._t_as ('c1');
select is ((select count (*)::int from public.job_translations (array[current_setting ('t.job_k')::uuid])), 1,
  'the owner can read the translations');
reset role;
select public._t_as ('w1');
select is ((select count (*)::int from public.job_translations (array[current_setting ('t.job_k')::uuid])), 1,
  'an approved plumber can read the translations of an open job');
reset role;
select public._t_as ('w3');
select is ((select count (*)::int from public.job_translations (array[current_setting ('t.job_k')::uuid])), 0,
  'an electrician cannot');
reset role;
select public._t_as ('c2');
select is ((select count (*)::int from public.job_translations (array[current_setting ('t.job_k')::uuid])), 0,
  'another customer cannot');
reset role;
select public._t_as ('c1');
select is ((select count (*)::int from public.job_translations (array[current_setting ('t.job_d')::uuid])), 0,
  'a job without translations returns nothing');
reset role;

-- ─── Listings: same rules through the trigger ───
select public._t_as ('w1');
select lives_ok (
  $$ insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, status, headline_i18n, detail_i18n)
     values (public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'),
       'Leak and tap repair', 'Mixers, pipes and flush tanks.', 'active',
       '{"source":"en","en":"Leak and tap repair","ur":"نل اور لیکیج کی مرمت","ai":true}'::jsonb,
       '{"source":"en","en":"Mixers, pipes and flush tanks.","ur":"مکسر، پائپ اور فلش ٹینک۔","ai":true}'::jsonb) $$,
  'a listing can carry both languages');
select throws_ok (
  $$ insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, status)
     values (public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'),
       'Leak repair', 'Call 0300 1234567 any time', 'active') $$,
  'P0001', 'please do not include phone numbers or links in a listing', 'a phone number in the listing text is refused');
select throws_ok (
  $$ insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, status, detail_i18n)
     values (public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'),
       'Leak repair', 'Mixers and pipes, all areas', 'active', '{"ur":"۰۳۰۰۱۲۳۴۵۶۷"}'::jsonb) $$,
  'P0001', 'the translations are not valid or contain a phone number or link', 'a phone number in the Urdu text is refused');
select throws_ok (
  $$ insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, status, service_areas)
     values (public._t_id ('w1'), (select id from public.service_templates where slug = 'plumbing_leak_basic'),
       'Leak repair', 'Mixers and pipes, all areas', 'active', '["Gulshan","03001234567"]'::jsonb) $$,
  'P0001', 'please do not include phone numbers or links in a listing', 'a phone number in the areas is refused');
select lives_ok (
  $$ update public.worker_service_listings set status = 'paused' where headline = 'Leak and tap repair' $$,
  'changing only the status does not re-check the text');
reset role;

-- ─── AI flag and limits ───
select is ((select value #>> '{}' from public.app_settings where key = 'ai_help_enabled'), 'false', 'AI help ships off');
select is ((select (value #>> '{}')::int from public.app_settings where key = 'ai_daily_limit_user'), 5, 'a signed-in person gets 5 drafts a day');
select is ((select (value #>> '{}')::int from public.app_settings where key = 'ai_daily_limit_guest'), 2, 'a guest gets 2 drafts a day');

-- ─── AI allowance (only the service role may use it) ───
select public._t_as ('c1');
select throws_ok ($$ select public.ai_consume ('u:x', 5) $$, '42501', null, 'a signed-in person cannot take allowance directly');
reset role;
select public._t_as_anon ();
select throws_ok ($$ select public.ai_consume ('g:x', 5) $$, '42501', null, 'a guest cannot either');
reset role;

set role service_role;
select is (public.ai_consume ('u:a', 2), true, 'first call is allowed');
select is (public.ai_consume ('u:a', 2), true, 'second call is allowed');
select is (public.ai_consume ('u:a', 2), false, 'third call is over the limit');
select is ((select calls from public.ai_usage where user_key = 'u:a' and day = current_date), 2, 'a refused call is not counted');
select public.ai_refund ('u:a');
select is (public.ai_consume ('u:a', 2), true, 'a refunded call can be used again');
select is (public.ai_consume ('u:b', 2), true, 'another person has their own allowance');
select is (public.ai_consume ('u:c', 0), false, 'a limit of zero blocks everything');
select is (public.ai_consume ('', 5), false, 'a blank key is refused');
select public.ai_log_call ('u:a', 'draft', 'job', true, null, 120, 340, 2100);
select public.ai_log_call ('u:b', 'translate', 'listing', false, 'timeout', null, null, 20000);
reset role;

-- ─── Admin usage view ───
select public._t_as ('adm');
select is ((select calls from public.admin_ai_usage (7) where day = current_date), 2::bigint, 'the admin sees todays calls');
select is ((select failed from public.admin_ai_usage (7) where day = current_date), 1::bigint, 'and how many failed');
select is ((select tokens_out from public.admin_ai_usage (7) where day = current_date), 340::bigint, 'and the tokens');
reset role;
select public._t_as ('c1');
select throws_ok ($$ select * from public.admin_ai_usage (7) $$, 'P0001', 'admin only', 'a customer cannot see AI usage');
reset role;
select is ((select count (*)::int from information_schema.columns where table_name = 'ai_calls' and column_name in ('prompt', 'text', 'content', 'response')), 0,
  'the AI log never stores the text or the answer');

-- ─── In-app help ───
select is ((select count (*)::int from public.faqs where slug in ('help-me-write', 'post-in-two-languages', 'get-a-price-from-service') and is_active), 3,
  'the three new help entries exist');
select is ((select answer_en like '%budget%' from public.faqs where slug = 'how-to-request-worker'), false,
  'the request-a-worker help no longer mentions a budget');

select * from finish ();
rollback;
