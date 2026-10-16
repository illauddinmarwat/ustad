-- Launch hardening: self-service account deletion, admin handling of user reports, client error logging,
-- the listing rank cache and the nearby bounding box.

begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

create function public._t_id (n text) returns uuid language sql immutable as $$
  select (case n
    when 'c1' then '10000000-0000-0000-0000-000000000001'
    when 'c2' then '10000000-0000-0000-0000-000000000002'
    when 'a1' then '30000000-0000-0000-0000-000000000001'
    when 'w1' then '20000000-0000-0000-0000-000000000001'
    when 'w2' then '20000000-0000-0000-0000-000000000002'
    when 'w3' then '20000000-0000-0000-0000-000000000003'
    else '99999999-9999-9999-9999-999999999999' end)::uuid;
$$;

create function public._t_mk_user (p_id uuid, p_role text, p_name text, p_skill text default null, p_lat float8 default 24.86, p_lng float8 default 67.00)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_name || '@test.local', jsonb_build_object (
    'role', p_role, 'display_name', p_name, 'skill_category', p_skill, 'preferred_language', 'en',
    'city', 'Karachi', 'cnic_number', '4210112345671', 'rate_pkr', 800, 'rate_unit', 'hour', 'phone', '03001234567'));
  if p_role = 'worker' then
    update public.worker_profiles set approval_status = 'approved', lat = p_lat, lng = p_lng, is_available = true where user_id = p_id;
  end if;
end $$;

create function public._t_as (n text) returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', public._t_id (n)::text, true);
  perform set_config ('request.jwt.claims', json_build_object ('sub', public._t_id (n)::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function public._t_as_anon () returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', '', true);
  perform set_config ('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

select public._t_mk_user (public._t_id ('c1'), 'customer', 'Ali');
select public._t_mk_user (public._t_id ('c2'), 'customer', 'Bilal');
select public._t_mk_user (public._t_id ('a1'), 'customer', 'Admin');
update public.profiles set role = 'admin' where id = public._t_id ('a1');
select public._t_mk_user (public._t_id ('w1'), 'worker', 'Usman', 'plumber', 24.86, 67.00);
select public._t_mk_user (public._t_id ('w2'), 'worker', 'Zaid', 'plumber', 31.52, 74.35);
select public._t_mk_user (public._t_id ('w3'), 'worker', 'Hamza', 'plumber', 24.90, 67.05);

-- ─── delete_my_account ────────────────────────────────────────────────────
insert into public.jobs (customer_id, title, description, category, status, origin)
values (public._t_id ('c1'), 'Open job', 'A job that is still open', 'plumbing', 'open', 'customer_job');
insert into public.jobs (customer_id, worker_id, title, description, category, status, origin)
values (public._t_id ('c2'), public._t_id ('w1'), 'Busy job', 'A job in progress', 'plumbing', 'assigned', 'customer_job');

select public._t_as_anon ();
select throws_ok ($$select public.delete_my_account ()$$, '42501', null, 'a signed-out visitor cannot delete an account');
reset role;

select public._t_as ('c2');
select throws_ok ($$select public.delete_my_account ()$$, 'you have a job in progress; finish or cancel it first', 'cannot delete while a job is in progress');
reset role;
select is ((select status from public.profiles where id = public._t_id ('c2')), 'active', 'and the account is untouched');

select public._t_as ('a1');
select throws_ok ($$select public.delete_my_account ()$$, 'admin accounts cannot be deleted here', 'an admin cannot use self-service deletion');
reset role;

select public._t_as ('c1');
select lives_ok ($$select public.delete_my_account ()$$, 'a customer with no job in progress can delete their account');
select lives_ok ($$select public.delete_my_account ()$$, 'deleting twice is harmless');
reset role;
select is ((select status from public.profiles where id = public._t_id ('c1')), 'deleted', 'the profile is marked deleted');
select is ((select display_name from public.profiles where id = public._t_id ('c1')), 'Deleted user', 'the name is wiped');
select is ((select phone from public.profiles where id = public._t_id ('c1')), null, 'the phone is wiped');
select is ((select status from public.jobs where title = 'Open job'), 'cancelled', 'their open job is cancelled');
select is ((select count (*)::int from public.user_deletion_audit where user_id = public._t_id ('c1')), 1, 'one audit row records the deletion');
select ok ((select banned_until is not null from auth.users where id = public._t_id ('c1')), 'the sign-in is locked');
select ok ((select email like 'deleted-%@deleted.invalid' from auth.users where id = public._t_id ('c1')), 'and the email is scrambled');

-- ─── user reports ─────────────────────────────────────────────────────────
select public._t_as ('c2');
select lives_ok ($$insert into public.abuse_reports (reporter_id, reported_user_id, reason) values (public._t_id ('c2'), public._t_id ('w1'), 'abuse: shouted at me')$$, 'a user can file a report');
select throws_ok ($$select * from public.admin_list_abuse_reports ('open', 10)$$, 'admin only', 'a normal user cannot read the report queue');
reset role;

select public._t_as ('a1');
select is ((select count (*)::int from public.admin_list_abuse_reports ('open', 10)), 1, 'an admin sees the open report');
select is ((select reported_name from public.admin_list_abuse_reports ('open', 10)), 'Usman', 'with the reported person''s name');
select is ((select reporter_name from public.admin_list_abuse_reports ('open', 10)), 'Bilal', 'and the reporter''s name');
select throws_ok ($$select public.admin_resolve_abuse_report ((select id from public.abuse_reports limit 1), 'banana', null)$$, 'status must be open, resolved or dismissed', 'an unknown status is refused');
select lives_ok ($$select public.admin_resolve_abuse_report ((select id from public.abuse_reports limit 1), 'resolved', 'warned the user')$$, 'an admin can resolve a report');
select is ((select count (*)::int from public.admin_list_abuse_reports ('open', 10)), 0, 'it leaves the open queue');
select is ((select admin_note from public.admin_list_abuse_reports ('resolved', 10)), 'warned the user', 'and keeps the admin note');
select lives_ok ($$select public.admin_resolve_abuse_report ((select id from public.abuse_reports limit 1), 'open', null)$$, 'it can be reopened');
select ok ((select resolved_at is null from public.abuse_reports limit 1), 'reopening clears the resolved time');
reset role;

-- ─── client errors ────────────────────────────────────────────────────────
select public._t_as_anon ();
select lives_ok ($$select public.log_client_error ('Cannot read property x of undefined', 'stack', null, true, 'android', '1.0.0')$$, 'a signed-out device can report an error');
select lives_ok ($$select public.log_client_error ('   ')$$, 'a blank message is ignored');
reset role;
select is ((select count (*)::int from public.client_errors), 1, 'only the real error was stored');

select public._t_as ('c2');
select is ((select count (*)::int from public.client_errors), 0, 'a user cannot read the error table directly (row security hides every row)');
select lives_ok ($$select public.log_client_error ('Boom ' || g) from generate_series (1, 40) g$$, 'a crash loop is accepted without raising');
reset role;
select is ((select count (*)::int from public.client_errors where user_id = public._t_id ('c2')), 30, 'but only 30 an hour are kept per user');
select public._t_as ('c2');
select throws_ok ($$select * from public.admin_list_client_errors (7)$$, 'admin only', 'a normal user cannot read the error summary');
reset role;
select public._t_as ('a1');
select is ((select occurrences from public.admin_list_client_errors (7) where message = 'Cannot read property x of undefined'), 1, 'an admin sees errors grouped by message');
reset role;

-- ─── listing rank cache and nearby ────────────────────────────────────────
insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, price_pkr, status)
select public._t_id ('w1'), (select id from public.service_templates limit 1), 'Pipe repair by Usman', 'Careful work', 1000, 'active';
select public.refresh_listing_rank_cache ();
select is ((select count (*)::int from public.listing_rank_cache), (select count (*)::int from public.worker_service_listings l join public.profiles p on p.id = l.worker_id and p.status = 'active' where l.status = 'active'), 'the cache holds every active listing of an active worker');
select ok ((select count (*) from public.rank_listings_v2 (null, 30) where headline = 'Pipe repair by Usman') = 1, 'browse returns the cached listing');

update public.worker_service_listings set status = 'paused' where headline = 'Pipe repair by Usman';
select ok ((select count (*) from public.rank_listings_v2 (null, 30) where headline = 'Pipe repair by Usman') = 0, 'a paused listing disappears at once, before the next refresh');
update public.worker_service_listings set status = 'active' where headline = 'Pipe repair by Usman';

-- Every row in one transaction shares now(), so give the new listing a later created_at than the refresh.
insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, price_pkr, status, created_at)
select public._t_id ('w3'), (select id from public.service_templates limit 1), 'Brand new listing by Hamza', 'Fresh', 900, 'active', now () + interval '1 second';
select ok ((select count (*) from public.rank_listings_v2 (null, 500) where headline = 'Brand new listing by Hamza') = 1, 'a listing created after the last refresh is shown immediately');

update public.listing_rank_meta set computed_at = now () - interval '1 hour';
select ok ((select count (*) from public.rank_listings_v2 (null, 500) where headline = 'Pipe repair by Usman') = 1, 'a stale cache falls back to live scoring');

select ok ((select count (*) from public.nearby_workers (24.86, 67.00, null, 30) where user_id = public._t_id ('w3')) = 1, 'nearby finds a worker 6 km away');
select ok ((select count (*) from public.nearby_workers (24.86, 67.00, null, 30) where user_id = public._t_id ('w2')) = 0, 'and not one in Lahore');

select * from finish ();
rollback;
