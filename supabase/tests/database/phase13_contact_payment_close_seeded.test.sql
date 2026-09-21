-- Phase 2 (contact reveal, cash payment, closing, disputes): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(126);

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

-- A job for Ali and Usman in a given status, created directly (setup only).
create function public._t_job (p_status text, p_amount numeric default null) returns uuid language plpgsql as $$
declare jid uuid;
begin
  insert into public.jobs (customer_id, worker_id, title, description, category, status, origin, budget_pkr)
  values (public._t_id ('c1'), public._t_id ('w1'), 'Fix ' || p_status, 'Setup job in status ' || p_status, 'plumber', p_status, 'customer_job', p_amount)
  returning id into jid;
  return jid;
end $$;

-- ─── Contact details are hidden until a worker accepts ───────────────────
select public._t_as ('c1');
select set_config ('t.open', public.create_direct_request (public._t_id ('w1'), 'Fix tap', 'Kitchen tap is leaking badly', 'plumber', 2000)::text, true);
select is ((select count(*) from public.get_job_contacts (current_setting ('t.open')::uuid)), 0::bigint, 'the customer gets no contacts before a worker accepts');
select throws_ok(
  $$select public.customer_set_job_contact(current_setting('t.open')::uuid, '0300-1111111', 'House 1, Street 2')$$,
  'contact details can be shared once a worker has accepted', 'contact details cannot be entered before acceptance');
select public._t_as ('w1');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.open')::uuid)), 0::bigint, 'the worker gets no contacts before accepting');
select lives_ok($$select public.worker_accept_direct_request(current_setting('t.open')::uuid)$$, 'the worker accepts');
reset role;

-- ─── After acceptance ────────────────────────────────────────────────────
select public._t_as ('c1');
select is ((select worker_phone from public.get_job_contacts (current_setting ('t.open')::uuid)), '0311-2222222', 'the customer now sees the worker''s phone');
select is ((select contact_shared from public.get_job_contacts (current_setting ('t.open')::uuid)), false, 'the customer has not shared their own details yet');
select is ((select customer_phone from public.get_job_contacts (current_setting ('t.open')::uuid)), null::text, 'no customer phone is stored yet');
select public._t_as ('w1');
select is ((select customer_phone from public.get_job_contacts (current_setting ('t.open')::uuid)), null::text, 'the worker cannot see a customer phone that was not shared');
select is ((select contact_shared from public.get_job_contacts (current_setting ('t.open')::uuid)), false, 'the worker is told nothing was shared yet');
select public._t_as ('w2');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.open')::uuid)), 0::bigint, 'another worker sees nothing');
select public._t_as ('c2');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.open')::uuid)), 0::bigint, 'another customer sees nothing');
select public._t_as ('adm');
select is ((select worker_phone from public.get_job_contacts (current_setting ('t.open')::uuid)), '0311-2222222', 'an admin can see the worker phone');
select public._t_as_anon ();
select throws_ok($$select * from public.get_job_contacts(current_setting('t.open')::uuid)$$, '42501', null, 'a guest cannot call the contact function');
reset role;

-- Entering the customer's own details.
select public._t_as ('c1');
select throws_ok($$select public.customer_set_job_contact(current_setting('t.open')::uuid, 'abc', 'House 1, Street 2')$$, 'invalid phone number', 'a bad phone number is rejected');
select throws_ok($$select public.customer_set_job_contact(current_setting('t.open')::uuid, '0300-1111111', 'x')$$, 'address is required', 'a missing address is rejected');
select public._t_as ('c2');
select throws_ok($$select public.customer_set_job_contact(current_setting('t.open')::uuid, '0300-3333333', 'Flat 5, Gulshan')$$, 'not job owner', 'another customer cannot set contact details');
select public._t_as ('w1');
select throws_ok($$select public.customer_set_job_contact(current_setting('t.open')::uuid, '0311-2222222', 'Workshop road')$$, 'not job owner', 'the worker cannot set the customer''s details');
select public._t_as ('c1');
select lives_ok($$select public.customer_set_job_contact(current_setting('t.open')::uuid, '0300-1111111', 'House 1, Street 2, DHA')$$, 'the customer shares their phone and address');
select is ((select phone from public.get_my_contact_defaults ()), '0300-1111111', 'their saved phone can prefill the form');
select is ((select address from public.get_my_contact_defaults ()), 'House 1, Street 2, DHA', 'and their saved address');
select public._t_as ('w1');
select is ((select customer_phone from public.get_job_contacts (current_setting ('t.open')::uuid)), '0300-1111111', 'the worker now sees the customer phone');
select is ((select customer_address from public.get_job_contacts (current_setting ('t.open')::uuid)), 'House 1, Street 2, DHA', 'and the address');
select is ((select contact_shared from public.get_job_contacts (current_setting ('t.open')::uuid)), true, 'shared is now true');
select public._t_as ('w2');
select is ((select count(*) from public.get_job_contacts (current_setting ('t.open')::uuid)), 0::bigint, 'another worker still sees nothing');
reset role;

-- The tables themselves are closed to clients.
select public._t_as ('c1');
select throws_ok($$select * from public.job_contacts$$, '42501', null, 'clients cannot read job_contacts directly');
select throws_ok($$select phone from public.profiles$$, '42501', null, 'profiles.phone is not readable');
select throws_ok($$select address from public.profiles$$, '42501', null, 'profiles.address is not readable');
select is ((select display_name from public.profiles where id = public._t_id ('w1')), 'Usman', 'other profile columns stay readable');
select throws_ok($$select phone from public.nearby_workers(24.86, 67.00, null, 30)$$, '42703', null, 'Nearby no longer has a phone column');
select public._t_as_anon ();
select throws_ok($$select * from public.job_contacts$$, '42501', null, 'guests cannot read job_contacts either');
reset role;

-- ─── Cash payment: completed -> payment_pending -> closed ────────────────
select public._t_as ('c1');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'cash')$$, 'job must be completed before payment', 'cannot pay before the work is done');
select public._t_as ('c2');
select throws_ok($$select public.mark_job_completed(current_setting('t.open')::uuid)$$, 'not a participant', 'a stranger cannot complete the job');
select public._t_as ('w1');
select lives_ok($$select public.mark_job_completed(current_setting('t.open')::uuid)$$, 'the worker marks the work done');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'cash')$$, 'only the customer can mark a job as paid', 'the worker cannot mark it paid');
select public._t_as ('c1');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 0, 'cash')$$, 'invalid amount', 'a zero amount is rejected');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'jazzcash')$$, 'only cash payments are supported', 'only cash is supported');
select public._t_as ('c2');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'cash')$$, 'only the customer can mark a job as paid', 'another customer cannot pay it');
select public._t_as ('c1');
select lives_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'cash')$$, 'the customer marks it paid in cash');
select throws_ok($$select public.mark_job_paid(current_setting('t.open')::uuid, 2000, 'cash')$$, 'job must be completed before payment', 'it cannot be marked paid twice');
reset role;

select is ((select status from public.jobs where id = current_setting ('t.open')::uuid), 'payment_pending', 'the job waits for the worker''s confirmation');
select is ((select status from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 'pending', 'the ledger row is pending, not paid');
select is ((select method from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 'cash', 'the payment method is cash');
select is ((select payer_id from public.payment_ledger where job_id = current_setting ('t.open')::uuid), public._t_id ('c1'), 'the customer is the payer');
select is ((select payee_id from public.payment_ledger where job_id = current_setting ('t.open')::uuid), public._t_id ('w1'), 'the worker is the payee');
select is ((select worker_confirmed from public.payment_ledger where job_id = current_setting ('t.open')::uuid), false, 'the worker has not confirmed yet');

select public._t_as ('c1');
select throws_ok($$select public.worker_confirm_payment_received(current_setting('t.open')::uuid, 2000)$$, 'only the assigned worker can confirm payment', 'the customer cannot confirm receipt');
select public._t_as ('w2');
select throws_ok($$select public.worker_confirm_payment_received(current_setting('t.open')::uuid, 2000)$$, 'only the assigned worker can confirm payment', 'another worker cannot confirm receipt');
select public._t_as ('w1');
select throws_ok($$select public.worker_confirm_payment_received(current_setting('t.open')::uuid, -1)$$, 'invalid amount', 'a negative received amount is rejected');
select is (public.worker_confirm_payment_received (current_setting ('t.open')::uuid, 2000), 'closed', 'a matching amount closes the job');
select throws_ok($$select public.worker_confirm_payment_received(current_setting('t.open')::uuid, 2000)$$, 'no payment is waiting for confirmation', 'a closed job cannot be confirmed again');
reset role;

select is ((select status from public.jobs where id = current_setting ('t.open')::uuid), 'closed', 'the job is closed');
select is ((select status from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 'paid', 'the ledger row is now paid');
select is ((select worker_confirmed from public.payment_ledger where job_id = current_setting ('t.open')::uuid), true, 'the worker confirmed');
select is ((select received_amount_pkr from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 2000::numeric, 'the received amount is recorded');
select is ((select commission_pct from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 15::numeric, 'the commission rate in force is recorded');
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.open')::uuid), 300::numeric, 'the commission is 15% of the amount');

select public._t_as ('w1');
select is ((select contact_shared from public.get_job_contacts (current_setting ('t.open')::uuid)), true, 'contacts stay visible on a closed job');
reset role;

-- ─── A payment that does not match becomes a dispute ─────────────────────
select set_config ('t.d1', public._t_job ('completed', 1000)::text, true);
select public._t_as ('c1');
select public.mark_job_paid (current_setting ('t.d1')::uuid, 1000, 'cash');
select public._t_as ('w1');
select is (public.worker_confirm_payment_received (current_setting ('t.d1')::uuid, 800), 'disputed', 'a different amount makes it a dispute');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.d1')::uuid), 'disputed', 'the job is disputed');
select is ((select status from public.payment_ledger where job_id = current_setting ('t.d1')::uuid), 'disputed', 'so is the ledger row');
select is ((select received_amount_pkr from public.payment_ledger where job_id = current_setting ('t.d1')::uuid), 800::numeric, 'the amount the worker says they got is recorded');
select is ((select count(*) from public.worker_commission_ledger where job_id = current_setting ('t.d1')::uuid), 0::bigint, 'no commission is created for a disputed payment');

select public._t_as ('c1');
select throws_ok($$select public.admin_resolve_job_dispute(current_setting('t.d1')::uuid, 'paid', 'Agreed on the phone')$$, 'admin only', 'a customer cannot resolve a dispute');
select public._t_as ('w1');
select throws_ok($$select public.admin_resolve_job_dispute(current_setting('t.d1')::uuid, 'paid', 'Agreed on the phone')$$, 'admin only', 'a worker cannot resolve a dispute');
select public._t_as ('adm');
select throws_ok($$select public.admin_resolve_job_dispute(current_setting('t.d1')::uuid, 'paid', '  ')$$, 'a note is required', 'a note is required to resolve');
select throws_ok($$select public.admin_resolve_job_dispute(current_setting('t.d1')::uuid, 'gift', 'Agreed')$$, 'ledger status must be paid or refunded', 'the outcome must be paid or refunded');
select throws_ok($$select public.admin_resolve_job_dispute(current_setting('t.open')::uuid, 'paid', 'Agreed')$$, 'job is not disputed', 'only a disputed job can be resolved');
select lives_ok($$select public.admin_resolve_job_dispute(current_setting('t.d1')::uuid, 'refunded', 'Customer was refunded in cash')$$, 'the admin resolves it as refunded');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.d1')::uuid), 'closed', 'resolving closes the job');
select is ((select status from public.payment_ledger where job_id = current_setting ('t.d1')::uuid), 'refunded', 'a refund is recorded on the ledger');
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.d1')::uuid), 0::numeric, 'no commission on a refund');
select ok((select note from public.payment_ledger where job_id = current_setting ('t.d1')::uuid) like '%Customer was refunded in cash%', 'the admin''s note is kept');
select is ((select count(*) from public.worker_commission_ledger where job_id = current_setting ('t.d1')::uuid), 0::bigint, 'a refunded job creates no commission');

-- Resolved as paid: the job closes and commission is owed.
select set_config ('t.d2', public._t_job ('completed', 1000)::text, true);
select public._t_as ('c1');
select public.mark_job_paid (current_setting ('t.d2')::uuid, 1000, 'cash');
select public._t_as ('w1');
select public.worker_confirm_payment_received (current_setting ('t.d2')::uuid, 500);
select public._t_as ('adm');
select public.admin_resolve_job_dispute (current_setting ('t.d2')::uuid, 'paid', 'Worker confirmed full amount by phone');
reset role;
select is ((select status from public.payment_ledger where job_id = current_setting ('t.d2')::uuid), 'paid', 'resolved as paid: the ledger row is paid');
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.d2')::uuid), 150::numeric, 'and the commission is 15% of the customer''s amount');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.d2')::uuid), 150::numeric, 'the worker owes that commission');

-- ─── A payment nobody confirms becomes a dispute ─────────────────────────
select set_config ('t.s1', public._t_job ('completed', 700)::text, true);
select set_config ('t.s2', public._t_job ('completed', 700)::text, true);
select public._t_as ('c1');
select public.mark_job_paid (current_setting ('t.s1')::uuid, 700, 'cash');
select public.mark_job_paid (current_setting ('t.s2')::uuid, 700, 'cash');
reset role;
update public.payment_ledger set created_at = now () - interval '4 days' where job_id = current_setting ('t.s1')::uuid;
select is (public.flag_unconfirmed_payments (), 1, 'only the stale unconfirmed payment is flagged');
select is ((select status from public.jobs where id = current_setting ('t.s1')::uuid), 'disputed', 'the stale job becomes a dispute');
select is ((select status from public.jobs where id = current_setting ('t.s2')::uuid), 'payment_pending', 'a recent payment keeps waiting');
select is (public.flag_unconfirmed_payments (), 0, 'running it again changes nothing');
select public._t_setting ('payment_confirm_days', '0'::jsonb);
select is (public.flag_unconfirmed_payments (), 0, 'a window of 0 days still needs the payment to be older than now');

-- ─── Admin feed of job events ────────────────────────────────────────────
select is ((select count(*) from public.admin_job_events where job_id = current_setting ('t.open')::uuid and kind = 'accepted'), 1::bigint, 'the feed logs the acceptance');
select is ((select count(*) from public.admin_job_events where job_id = current_setting ('t.open')::uuid and kind = 'payment_pending'), 1::bigint, 'the feed logs the customer marking paid');
select is ((select count(*) from public.admin_job_events where job_id = current_setting ('t.open')::uuid and kind = 'closed'), 1::bigint, 'the feed logs the close');
select is ((select count(*) from public.admin_job_events where job_id = current_setting ('t.d1')::uuid and kind = 'disputed'), 1::bigint, 'the feed logs a dispute');
select is ((select count(*) from public.admin_job_events where job_id = current_setting ('t.d1')::uuid and kind = 'dispute_resolved'), 1::bigint, 'and its resolution');
select public._t_as ('adm');
select ok((select count(*) from public.admin_list_job_events (50)) >= 5, 'an admin can list the feed');
select ok((select job_title from public.admin_list_job_events (50) where job_id = current_setting ('t.open')::uuid limit 1) is not null, 'feed rows carry the job title');
select public._t_as ('c1');
select throws_ok($$select * from public.admin_list_job_events(10)$$, 'admin only', 'a customer cannot read the feed');
select throws_ok($$select * from public.admin_job_events$$, '42501', null, 'nor the feed table');
reset role;

-- ─── After payment a job still counts as finished ────────────────────────
-- Reviews, completion photos, quality surveys, guarantee claims and completion-rate signals used to
-- accept only status 'completed'; once a job moves on to payment_pending / closed / disputed they broke.
select set_config ('t.fin_assigned', public._t_job ('assigned')::text, true);

select public._t_as ('c1');
select lives_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating, comment) values (current_setting('t.open')::uuid, public._t_id('c1'), public._t_id('w1'), 5, 'Great work')$$, 'a customer can review a closed job');
select lives_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.s2')::uuid, public._t_id('c1'), public._t_id('w1'), 4)$$, 'and one that is waiting for payment confirmation');
select lives_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.s1')::uuid, public._t_id('c1'), public._t_id('w1'), 3)$$, 'and one that is in dispute');
select throws_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.fin_assigned')::uuid, public._t_id('c1'), public._t_id('w1'), 5)$$, '42501', null, 'but not a job that is only assigned');
select throws_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.open')::uuid, public._t_id('c1'), public._t_id('w1'), 1)$$, '23505', null, 'and only once per job');
select public._t_as ('c2');
select throws_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.d1')::uuid, public._t_id('c2'), public._t_id('w1'), 1)$$, '42501', null, 'another customer cannot review it');
select public._t_as ('w1');
select throws_ok($$insert into public.reviews (job_id, reviewer_id, reviewee_id, rating) values (current_setting('t.d1')::uuid, public._t_id('w1'), public._t_id('c1'), 5)$$, '42501', null, 'and the worker cannot review themselves in');

select public._t_as ('c1');
select lives_ok($$select public.submit_job_quality_survey(current_setting('t.d1')::uuid, 4::smallint, true, 'Fine')$$, 'a customer can submit a quality survey on a closed job');
select throws_ok($$select public.submit_job_quality_survey(current_setting('t.fin_assigned')::uuid, 4::smallint, true, 'Fine')$$, 'job must be completed', 'but not before the work is done');
select public._t_as ('c2');
select throws_ok($$select public.submit_job_quality_survey(current_setting('t.d1')::uuid, 4::smallint, true, 'Fine')$$, 'customer only', 'and only the job''s customer can');

select public._t_as ('w1');
select lives_ok($$select public.submit_guarantee_claim_intake(current_setting('t.d1')::uuid, 'quality_issue', 'The customer disputed the work', '{}'::jsonb)$$, 'a participant can raise a guarantee claim after payment');
select throws_ok($$select public.submit_guarantee_claim_intake(current_setting('t.fin_assigned')::uuid, 'other', 'Too early', '{}'::jsonb)$$, 'job must be completed', 'but not before the work is done');
select public._t_as ('c2');
select throws_ok($$select public.submit_guarantee_claim_intake(current_setting('t.d1')::uuid, 'other', 'Not mine', '{}'::jsonb)$$, 'participants only', 'and outsiders cannot');

select public._t_as ('w1');
select lives_ok($$insert into public.job_completion_photos (job_id, uploader_id, storage_path) values (current_setting('t.d1')::uuid, public._t_id('w1'), 'photos/after.jpg')$$, 'a participant can add completion photos to a closed job');
select throws_ok($$insert into public.job_completion_photos (job_id, uploader_id, storage_path) values (current_setting('t.fin_assigned')::uuid, public._t_id('w1'), 'photos/early.jpg')$$, '42501', null, 'but not to a job that is still in progress');
select public._t_as ('c2');
select throws_ok($$insert into public.job_completion_photos (job_id, uploader_id, storage_path) values (current_setting('t.d1')::uuid, public._t_id('c2'), 'photos/x.jpg')$$, '42501', null, 'and outsiders cannot');
reset role;

-- Completion rate counts paid and disputed jobs as finished.
select public.compute_worker_signals (public._t_id ('w1'));
select ok((select completion_rate from public.worker_profiles where user_id = public._t_id ('w1')) > 0, 'the worker''s completion rate is above zero after closed jobs');
select is (
  (select completion_rate from public.worker_profiles where user_id = public._t_id ('w1')),
  (select round (count(*) filter (where status in ('completed', 'payment_pending', 'disputed', 'closed'))::numeric
                 / count(*) filter (where status in ('assigned', 'completed', 'payment_pending', 'disputed', 'closed'))::numeric, 3)
   from public.jobs where worker_id = public._t_id ('w1')),
  'and equals finished jobs over assigned-or-later jobs');

-- ─── Worker national ID and exact location are not readable by clients ───
select public._t_as ('c1');
select throws_ok($$select cnic_number from public.worker_profiles$$, '42501', null, 'a customer cannot read workers'' national ID numbers');
select throws_ok($$select lat from public.worker_profiles$$, '42501', null, 'nor their exact latitude');
select throws_ok($$select lng from public.worker_profiles$$, '42501', null, 'nor longitude');
select throws_ok($$select location_updated_at from public.worker_profiles$$, '42501', null, 'nor when they last shared it');
select throws_ok($$select * from public.worker_profiles$$, '42501', null, '"select *" is refused because it would include them');
select is ((select count(*) from public.worker_profiles where user_id = public._t_id ('w1') and categories = array['plumber'] and approval_status = 'approved' and avg_rating is not null and is_available), 1::bigint, 'but the public profile fields stay readable');
select public._t_as ('w2');
select throws_ok($$select cnic_number from public.worker_profiles where user_id = public._t_id('w2')$$, '42501', null, 'a worker cannot read even their own ID number back');
select public._t_as_anon ();
select throws_ok($$select cnic_number from public.worker_profiles$$, '42501', null, 'a guest cannot read it either');
select throws_ok($$select lat from public.worker_profiles$$, '42501', null, 'or a location');
reset role;

-- Workers can still save their own details and location, and Nearby still uses them.
select public._t_as ('w1');
select lives_ok($$update public.worker_profiles set lat = 25.30, lng = 67.50, location_updated_at = now() where user_id = public._t_id('w1')$$, 'a worker can still save their own location');
select lives_ok($$update public.worker_profiles set cnic_number = '4210199999999', years_experience = 9 where user_id = public._t_id('w1')$$, 'and their registration details');
select lives_ok($$update public.worker_profiles set lat = 0, lng = 0 where user_id = public._t_id('w2')$$, 'trying to change another worker''s location does nothing');
reset role;
select is ((select lat from public.worker_profiles where user_id = public._t_id ('w1')), 25.30::double precision, 'the worker''s own location was saved');
select is ((select cnic_number from public.worker_profiles where user_id = public._t_id ('w1')), '4210199999999', 'and their ID number');
select is ((select lat from public.worker_profiles where user_id = public._t_id ('w2')), 24.86::double precision, 'the other worker''s location was not touched');
select public._t_as ('c1');
select ok((select distance_km from public.nearby_workers (24.86, 67.00, 'plumber', 30) where user_id = public._t_id ('w1')) > 40, 'Nearby uses the worker''s saved location');
reset role;

-- Admins still see the ID for approval, only through the admin function.
select public._t_as ('adm');
select is ((select cnic_number from public.admin_list_worker_approvals ('approved') where user_id = public._t_id ('w2')), '4210112345671', 'an admin still sees the ID number through the approvals function');
select public._t_as ('c1');
select throws_ok($$select * from public.admin_list_worker_approvals('approved')$$, 'admin only', 'a customer cannot');
reset role;

select * from finish ();
rollback;
