-- Phase 7 (Hisab, overdue, admin, moderation): behaviour with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(163);

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
select public._t_setting ('direct_request_daily_limit', '50'::jsonb);
select public._t_setting ('job_posting_enabled', 'true'::jsonb);
select public._t_setting ('job_post_daily_limit', '50'::jsonb);
select public._t_setting ('commission_rate_pct', '15'::jsonb);
select public._t_setting ('commission_due_days', '7'::jsonb);

-- Take a job for Ali and the given worker all the way to closed with a cash payment.
create function public._t_close (w text, amount numeric) returns uuid language plpgsql as $$
declare jid uuid;
begin
  perform set_config ('role', 'postgres', true);
  insert into public.jobs (customer_id, worker_id, title, description, category, status, origin)
  values (public._t_id ('c1'), public._t_id (w), 'Closed job ' || amount, 'Setup job for the ledger', 'plumber', 'completed', 'customer_job')
  returning id into jid;
  perform public._t_as ('c1');
  perform public.mark_job_paid (jid, amount, 'cash');
  perform public._t_as (w);
  perform public.worker_confirm_payment_received (jid, amount);
  perform set_config ('role', 'postgres', true);
  return jid;
end $$;

-- Act as someone for auth.uid() only, keeping full table access (for admin functions checked against real rows).
create function public._t_claims (n text) returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', public._t_id (n)::text, true);
  perform set_config ('request.jwt.claims', json_build_object ('sub', public._t_id (n)::text, 'role', 'authenticated')::text, true);
end $$;

-- ─── A commission row is created when payment is confirmed ───────────────
select set_config ('t.j1', public._t_close ('w1', 2000)::text, true);
select is ((select count(*) from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 1::bigint, 'closing a cash job creates one commission row');
select is ((select worker_id from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), public._t_id ('w1'), 'owed by the worker');
select is ((select order_amount_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 2000::numeric, 'on the order value');
select is ((select commission_pct from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 15::numeric, 'at the current rate');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 300::numeric, 'so 15% of 2000 is 300');
select is ((select status from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 'due', 'it starts as due');
select is ((select due_date from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), current_date + 7, 'due seven days after closing');
select ok((select payment_id from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid) is not null, 'linked to the payment');
select is ((select count(*) from public.commission_events where kind = 'created' and worker_id = public._t_id ('w1')), 1::bigint, 'the history records the creation');
select ok(public._t_notif ('w1', 'commission_created') like 'Commission due | Please pay Rs 300%to Ustad by %', 'the worker is told what is due and by when');

-- One row per job, however often the payment is touched.
update public.payment_ledger set status = 'pending' where job_id = current_setting ('t.j1')::uuid;
update public.payment_ledger set status = 'paid' where job_id = current_setting ('t.j1')::uuid;
select is ((select count(*) from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 1::bigint, 'a payment confirmed twice still owes commission once');

-- No commission when the rate is 0, and each job keeps the rate it closed with.
select public._t_setting ('commission_rate_pct', '0'::jsonb);
select set_config ('t.j2', public._t_close ('w1', 500)::text, true);
select is ((select count(*) from public.worker_commission_ledger where job_id = current_setting ('t.j2')::uuid), 0::bigint, 'a 0% rate creates no commission row');
select is ((select status from public.payment_ledger where job_id = current_setting ('t.j2')::uuid), 'paid', 'but the payment is still recorded');
select public._t_setting ('commission_rate_pct', '20'::jsonb);
select set_config ('t.j3', public._t_close ('w1', 1000)::text, true);
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j3')::uuid), 200::numeric, 'a new rate applies to new jobs');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 300::numeric, 'and an earlier job keeps the rate it closed with');
select public._t_setting ('commission_rate_pct', '15'::jsonb);
select public._t_setting ('commission_due_days', '3'::jsonb);
select set_config ('t.j4', public._t_close ('w1', 400)::text, true);
select is ((select due_date from public.worker_commission_ledger where job_id = current_setting ('t.j4')::uuid), current_date + 3, 'the due-days setting decides the due date');
select public._t_setting ('commission_due_days', '7'::jsonb);

-- The other workers who will owe money.
select public._t_as ('c1');
select set_config ('t.pre', public.create_direct_request (public._t_id ('w2'), 'Before suspension', 'Sent before the worker was suspended', 'plumber', 800)::text, true);
select set_config ('t.posted', (select job_id from public.post_job ('Posted job', 'A posted job for the board', 'plumber'))::text, true);
reset role;
select set_config ('t.k1', public._t_close ('w2', 2000)::text, true);
select set_config ('t.k2', public._t_close ('w2', 1000)::text, true);
select set_config ('t.l1', public._t_close ('w3', 1000)::text, true);

-- Ledger row ids, captured now because admins cannot read the ledger table directly.
select set_config ('t.r_' || k, (select id from public.worker_commission_ledger where job_id = current_setting ('t.' || k)::uuid)::text, true)
from (values ('j1'), ('j3'), ('j4'), ('k1'), ('k2'), ('l1')) as v (k);

-- ─── The worker's own view ───────────────────────────────────────────────
select public._t_as ('w1');
select is ((select outstanding_pkr from public.get_my_commission_summary ()), 560::numeric, 'the summary adds up what the worker owes (300 + 200 + 60)');
select is ((select overdue_pkr from public.get_my_commission_summary ()), 0::numeric, 'nothing is overdue yet');
select is ((select next_due_date from public.get_my_commission_summary ()), current_date + 3, 'the next due date is the earliest one');
select is ((select account_deactivated from public.get_my_commission_summary ()), false, 'the account is active');
select is ((select deactivate_after_days from public.get_my_commission_summary ()), 14, 'and the worker is told the deactivation window');
select is ((select count(*) from public.list_my_commissions ()), 3::bigint, 'each commission is listed');
select is ((select job_title from public.list_my_commissions () where commission_pkr = 300), 'Closed job 2000', 'with the job it belongs to');
select is ((select count(*) from public.worker_commission_ledger), 3::bigint, 'the worker can read their own ledger rows');
select throws_ok($$update public.worker_commission_ledger set status = 'paid'$$, '42501', null, 'but cannot change them');
select throws_ok($$insert into public.worker_commission_ledger (worker_id, job_id, order_amount_pkr, commission_pct, commission_pkr, due_date) values (public._t_id('w1'), gen_random_uuid(), 1, 1, 0, current_date)$$, '42501', null, 'add rows');
select throws_ok($$delete from public.worker_commission_ledger$$, '42501', null, 'or delete them');
select throws_ok($$select * from public.commission_events$$, '42501', null, 'the history table is closed to clients');
select public._t_as ('w2');
select is ((select count(*) from public.worker_commission_ledger), 2::bigint, 'another worker sees only their own rows');
select public._t_as ('w4');
select is ((select outstanding_pkr from public.get_my_commission_summary ()), 0::numeric, 'a worker who owes nothing sees zero');
select is ((select count(*) from public.list_my_commissions ()), 0::bigint, 'and an empty list');
select public._t_as ('c1');
select is ((select count(*) from public.worker_commission_ledger), 0::bigint, 'a customer sees no ledger rows');
select public._t_as_anon ();
select throws_ok($$select * from public.worker_commission_ledger$$, '42501', null, 'a guest cannot read the ledger');
select throws_ok($$select * from public.get_my_commission_summary()$$, '42501', null, 'or the summary');
select public._t_as ('w1');
select throws_ok($$select public.mark_overdue_commissions()$$, '42501', null, 'a worker cannot run the overdue job');
reset role;

-- ─── Overdue, warnings and deactivation ──────────────────────────────────
update public.worker_commission_ledger set due_date = current_date - 3 where job_id = current_setting ('t.j1')::uuid;
update public.worker_commission_ledger set due_date = current_date - 8 where job_id = current_setting ('t.j3')::uuid;
update public.worker_commission_ledger set due_date = current_date - 15 where job_id = current_setting ('t.k1')::uuid;
update public.worker_commission_ledger set due_date = current_date - 40 where job_id = current_setting ('t.k2')::uuid;
update public.worker_commission_ledger set due_date = current_date - 20 where job_id = current_setting ('t.l1')::uuid;

select is (public.mark_overdue_commissions (), 7, 'the nightly job moves 5 rows to overdue and deactivates 2 workers');
select is ((select count(*) from public.worker_commission_ledger where status = 'overdue'), 5::bigint, 'five rows are overdue');
select is ((select status from public.worker_commission_ledger where job_id = current_setting ('t.j4')::uuid), 'due', 'a row not yet due is left alone');
select is ((select count(*) from public.commission_events where kind = 'overdue'), 5::bigint, 'each is recorded');
select is ((select count(*) from public.worker_commission_ledger where warned_at is not null), 4::bigint, 'rows a week or more past due are warned');
select is ((select warned_at from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), null::timestamptz, 'a row only 3 days late is not warned yet');
select is ((select count(*) from public.commission_events where kind = 'warned'), 4::bigint, 'warnings are recorded');
select ok(public._t_notif ('w1', 'commission_overdue') like 'Commission overdue | Rs 500% is overdue%', 'the worker gets one overdue notice with the total');
select ok(public._t_notif ('w1', 'commission_warning') like 'Account warning | Rs 200% will be deactivated in 7 days%', 'and a warning that counts down to deactivation');
select is ((select count(*) from public.notifications where user_id = public._t_id ('w1') and kind = 'commission_overdue'), 1::bigint, 'only one overdue notice per worker per run');

select is ((select status from public.profiles where id = public._t_id ('w1')), 'active', 'a worker 8 days late is still active');
select is ((select status from public.profiles where id = public._t_id ('w2')), 'suspended', 'a worker 15 days late is deactivated');
select is ((select commission_suspended from public.worker_profiles where user_id = public._t_id ('w2')), true, 'and marked as suspended for commission');
select is ((select status from public.profiles where id = public._t_id ('w3')), 'suspended', 'so is another worker 20 days late');
select is ((select count(*) from public.commission_events where kind = 'deactivated'), 2::bigint, 'both deactivations are recorded');
select ok(public._t_notif ('w2', 'account_deactivated') like 'Account deactivated | Your account is deactivated because of unpaid commission. Settle Rs 450%', 'the worker is told why and how much');
select is (public.mark_overdue_commissions (), 0, 'running the job again changes nothing');
select is ((select count(*) from public.notifications where kind in ('commission_overdue', 'commission_warning', 'account_deactivated')), 8::bigint, 'and sends no duplicate notices (3 overdue, 3 warnings, 2 deactivations)');

-- What a deactivated worker can no longer do.
select public._t_as ('c1');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumber', 30)), 1::bigint, 'Nearby lists only the active plumber');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'electrician', 30)), 0::bigint, 'and no deactivated electrician');
select throws_ok($$select public.create_direct_request(public._t_id('w2'), 'New job', 'A brand new request for you', 'plumber')$$, 'worker not available for this category', 'a deactivated worker cannot be sent new requests');
select public._t_as ('w2');
select throws_ok($$select public.worker_accept_direct_request(current_setting('t.pre')::uuid)$$, 'worker not approved', 'nor answer requests already sent');
select throws_ok($$select * from public.list_open_jobs()$$, 'approved workers only', 'nor use the job board');
select throws_ok($$select public.worker_quote_job(current_setting('t.posted')::uuid, 500)$$, 'approved workers only', 'nor quote');
select is ((select account_deactivated from public.get_my_commission_summary ()), true, 'the worker is told the account is deactivated');
select is ((select outstanding_pkr from public.get_my_commission_summary ()), 450::numeric, 'with what they owe');
select is ((select overdue_pkr from public.get_my_commission_summary ()), 450::numeric, 'all of it overdue');
select is ((select overdue_count from public.get_my_commission_summary ()), 2::bigint, 'across two rows');
select is ((select next_due_date from public.get_my_commission_summary ()), current_date - 40, 'starting from the oldest');
select public._t_as ('w1');
select is ((select overdue_pkr from public.get_my_commission_summary ()), 500::numeric, 'the first worker''s overdue total');
select is ((select outstanding_pkr from public.get_my_commission_summary ()), 560::numeric, 'and total');
select is ((select account_deactivated from public.get_my_commission_summary ()), false, 'they are still active');
reset role;

-- ─── Admin: balances, aging and rows ─────────────────────────────────────
select public._t_as ('adm');
select is ((select outstanding_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w1')), 560::numeric, 'admin sees what the first worker owes');
select is ((select not_yet_due_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w1')), 60::numeric, 'of which 60 is not yet due');
select is ((select overdue_1_7_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w1')), 300::numeric, 'and 300 is 1-7 days late');
select is ((select overdue_8_30_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w1')), 200::numeric, 'and 200 is 8-30 days late');
select is ((select overdue_30_plus_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w1')), 0::numeric, 'and none is over 30 days late');
select is ((select account_deactivated from public.admin_commission_balances () where worker_id = public._t_id ('w1')), false, 'that account is active');
select is ((select overdue_8_30_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w2')), 300::numeric, 'the second worker has 300 at 8-30 days');
select is ((select overdue_30_plus_pkr from public.admin_commission_balances () where worker_id = public._t_id ('w2')), 150::numeric, 'and 150 at over 30 days');
select is ((select account_deactivated from public.admin_commission_balances () where worker_id = public._t_id ('w2')), true, 'and is flagged as deactivated');
select is ((select oldest_due_date from public.admin_commission_balances () where worker_id = public._t_id ('w2')), current_date - 40, 'with the oldest due date');
select is ((select count(*) from public.admin_commission_balances ()), 3::bigint, 'three workers owe money');
select is ((select worker_id from public.admin_commission_balances () limit 1), public._t_id ('w1'), 'largest balance first');
select is ((select count(*) from public.admin_list_commissions ()), 6::bigint, 'all six commission rows are listed');
select is ((select count(*) from public.admin_list_commissions (public._t_id ('w2'))), 2::bigint, 'filtered by worker');
select is ((select count(*) from public.admin_list_commissions (null, 'overdue')), 5::bigint, 'filtered by status: overdue');
select is ((select count(*) from public.admin_list_commissions (null, 'due')), 1::bigint, 'and due');
select is ((select worker_name from public.admin_list_commissions (public._t_id ('w3'))), 'Hamid', 'rows carry the worker name');
select is ((select job_title from public.admin_list_commissions (public._t_id ('w3'))), 'Closed job 1000', 'and the job title');
select public._t_as ('c1');
select throws_ok($$select * from public.admin_commission_balances()$$, 'admin only', 'a customer cannot see balances');
select throws_ok($$select * from public.admin_list_commissions()$$, 'admin only', 'or rows');
select public._t_as ('w1');
select throws_ok($$select * from public.admin_commission_balances()$$, 'admin only', 'a worker cannot see balances');
select public._t_as_anon ();
select throws_ok($$select * from public.admin_commission_balances()$$, '42501', null, 'a guest cannot call it at all');
reset role;

-- ─── Settling and waiving ────────────────────────────────────────────────
select public._t_as ('adm');
select throws_ok($$select public.admin_record_commission_settlement(current_setting('t.r_j1')::uuid, '  ')$$, 'settlement method is required', 'a settlement needs a method');
select throws_ok($$select public.admin_record_commission_settlement(gen_random_uuid(), 'cash')$$, 'commission not found', 'an unknown row is rejected');
select public._t_as ('w1');
select throws_ok($$select public.admin_record_commission_settlement(current_setting('t.r_j1')::uuid, 'cash')$$, 'admin only', 'a worker cannot settle their own commission');
select throws_ok($$select public.admin_waive_commission(current_setting('t.r_j1')::uuid, 'please')$$, 'admin only', 'or waive it');
select public._t_as ('adm');
select lives_ok($$select public.admin_record_commission_settlement(current_setting('t.r_j1')::uuid, 'cash', 'REF-1', 'Paid at the office')$$, 'the admin records a payment');
select throws_ok($$select public.admin_record_commission_settlement(current_setting('t.r_j1')::uuid, 'cash')$$, 'commission is already paid', 'it cannot be settled twice');
reset role;
select is ((select status from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 'paid', 'the row is paid');
select ok((select settled_at from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid) is not null, 'with a settlement time');
select is ((select settlement_method from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 'cash', 'the method');
select is ((select settlement_ref from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 'REF-1', 'the reference');
select is ((select note from public.worker_commission_ledger where job_id = current_setting ('t.j1')::uuid), 'Paid at the office', 'and the note');
select is ((select by_user from public.commission_events where kind = 'settled' and amount_pkr = 300), public._t_id ('adm'), 'the history records who settled it');
select is ((select count(*) from public.commission_events where kind = 'reactivated' and worker_id = public._t_id ('w1')), 0::bigint, 'settling an active worker''s row reactivates nobody');

-- A deactivated worker stays deactivated until nothing is overdue.
select public._t_as ('adm');
select lives_ok($$select public.admin_record_commission_settlement(current_setting('t.r_k1')::uuid, 'bank', 'TXN-9')$$, 'the admin settles one of the second worker''s two overdue rows');
reset role;
select is ((select status from public.profiles where id = public._t_id ('w2')), 'suspended', 'the worker is still deactivated while another row is overdue');
select public._t_as ('adm');
select throws_ok($$select public.admin_waive_commission(current_setting('t.r_k2')::uuid, '  ')$$, 'a reason is required', 'waiving needs a reason');
select lives_ok($$select public.admin_waive_commission(current_setting('t.r_k2')::uuid, 'Goodwill after a complaint')$$, 'the admin waives the last overdue row');
select throws_ok($$select public.admin_waive_commission(current_setting('t.r_k2')::uuid, 'Again')$$, 'commission is already waived', 'it cannot be waived twice');
reset role;
select is ((select status from public.worker_commission_ledger where job_id = current_setting ('t.k2')::uuid), 'waived', 'the row is waived');
select is ((select note from public.worker_commission_ledger where job_id = current_setting ('t.k2')::uuid), 'Goodwill after a complaint', 'with the reason');
select is ((select amount_pkr from public.commission_events where kind = 'waived'), 150::numeric, 'the history records the waived amount');
select is ((select status from public.profiles where id = public._t_id ('w2')), 'active', 'clearing the last overdue row reopens the account');
select is ((select commission_suspended from public.worker_profiles where user_id = public._t_id ('w2')), false, 'and clears the suspension flag');
select is ((select count(*) from public.commission_events where kind = 'reactivated' and worker_id = public._t_id ('w2')), 1::bigint, 'the reactivation is recorded');
select ok(public._t_notif ('w2', 'account_reactivated') like 'Account reactivated | Your balance is settled%', 'and the worker is told');
select public._t_as ('c1');
select is ((select count(*) from public.nearby_workers (24.86, 67.00, 'plumber', 30)), 2::bigint, 'the worker is back in Nearby');
select public._t_as ('w2');
select lives_ok($$select * from public.list_open_jobs()$$, 'and back on the job board');
reset role;

-- Settling the only overdue row also reopens an account.
select public._t_as ('adm');
select public.admin_record_commission_settlement (current_setting ('t.r_l1')::uuid, 'cash');
reset role;
select is ((select status from public.profiles where id = public._t_id ('w3')), 'active', 'settling the only overdue row reopens that account too');

-- Exactly at the deactivation limit.
update public.worker_commission_ledger set due_date = current_date - 13 where job_id = current_setting ('t.j3')::uuid;
select is (public.mark_overdue_commissions (), 0, 'a row 13 days late does not deactivate');
update public.worker_commission_ledger set due_date = current_date - 14 where job_id = current_setting ('t.j3')::uuid;
select is (public.mark_overdue_commissions (), 1, 'a row 14 days late does');
select is ((select status from public.profiles where id = public._t_id ('w1')), 'suspended', 'that worker is now deactivated');
select public._t_as ('adm');
select public.admin_record_commission_settlement (current_setting ('t.r_j3')::uuid, 'cash');
reset role;
select is ((select status from public.profiles where id = public._t_id ('w1')), 'active', 'and reopened once settled');
select public._t_setting ('commission_deactivate_days', '30'::jsonb);
update public.worker_commission_ledger set due_date = current_date - 20 where job_id = current_setting ('t.j4')::uuid;
select public.mark_overdue_commissions ();
select is ((select status from public.profiles where id = public._t_id ('w1')), 'active', 'a longer deactivation window from settings is respected');
select public._t_setting ('commission_deactivate_days', '14'::jsonb);

-- ─── Admin status control also stops customers ───────────────────────────
select public._t_as ('adm');
select lives_ok($$select public.admin_set_user_status(public._t_id('c2'), 'suspended')$$, 'the admin suspends a customer');
select public._t_as ('c2');
select throws_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'only active customers can post jobs', 'who can then no longer post');
select public._t_as ('c1');
select throws_ok($$select public.admin_set_user_status(public._t_id('c2'), 'active')$$, 'admin only', 'a customer cannot change anyone''s status');
select public._t_as ('adm');
select public.admin_set_user_status (public._t_id ('c2'), 'active');
select public._t_as ('c2');
select lives_ok($$select * from public.post_job('Fix tap', 'The kitchen tap is leaking badly', 'plumber')$$, 'and can post again once reactivated');
reset role;

-- ─── Settings and their audit trail ──────────────────────────────────────
select public._t_as ('adm');
select public.admin_set_app_setting ('commission_rate_pct', '20'::jsonb);
reset role;
select ok(
  exists (select 1 from public.app_setting_audit where key = 'commission_rate_pct' and old_value = '15'::jsonb and new_value = '20'::jsonb and changed_by = public._t_id ('adm')),
  'an admin''s change is audited with who, old and new value');
select public._t_as ('adm');
select is ((select changed_by_name from public.admin_list_setting_audit (50) where key = 'commission_rate_pct' and new_value = '20'::jsonb and old_value = '15'::jsonb limit 1), 'Admin', 'the audit list names the admin');
select public.admin_set_app_setting ('commission_rate_pct', '15'::jsonb);
select public._t_as ('c1');
select throws_ok($$select public.admin_set_app_setting('commission_rate_pct', '99'::jsonb)$$, 'admin only', 'a customer cannot change a setting');
select lives_ok($$update public.app_settings set value = '99'::jsonb where key = 'commission_rate_pct'$$, 'nor edit the table directly');
select throws_ok($$select * from public.admin_list_setting_audit(10)$$, 'admin only', 'nor read the audit');
reset role;
select is ((select value from public.app_settings where key = 'commission_rate_pct'), '15'::jsonb, 'the setting is unchanged');

-- ─── Funnel by flow ──────────────────────────────────────────────────────
insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status)
select public._t_id ('w1'), id, 'Plumbing by Usman', 2500, 'active' from public.service_templates where slug = 'plumbing_leak_basic';
select public._t_as ('c1');
insert into public.listing_applications (listing_id, customer_id, note) values ((select id from public.worker_service_listings limit 1), public._t_id ('c1'), 'Monday');
select set_config ('t.app', (select id from public.listing_applications limit 1)::text, true);
select public._t_as ('w1');
select public.worker_accept_listing_application (current_setting ('t.app')::uuid);
reset role;
select set_config ('t.dr', (select public.create_direct_request (public._t_id ('w1'), 'Direct', 'A direct request to Usman', 'plumber')) ::text, true) where false;
select public._t_claims ('c1');
select set_config ('t.dr', public.create_direct_request (public._t_id ('w1'), 'Direct one', 'A direct request to Usman', 'plumber')::text, true);
select public._t_claims ('adm');
select is ((select created from public.admin_jobs_funnel (30) where flow = 'service'), (select count(*) from public.jobs where origin = 'service_listing'), 'the funnel counts service jobs');
select is ((select created from public.admin_jobs_funnel (30) where flow = 'direct'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is not null), 'direct requests');
select is ((select created from public.admin_jobs_funnel (30) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null), 'and posted jobs');
select is ((select closed from public.admin_jobs_funnel (30) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null and status = 'closed'), 'closed jobs are counted per flow');
select is ((select assigned_or_later from public.admin_jobs_funnel (30) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null and status in ('assigned', 'completed', 'payment_pending', 'disputed', 'closed')), 'accepted jobs are counted');
select is ((select work_done from public.admin_jobs_funnel (30) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null and status in ('completed', 'payment_pending', 'disputed', 'closed')), 'jobs with work done');
select is ((select cancelled from public.admin_jobs_funnel (30) where flow = 'direct'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is not null and status = 'cancelled'), 'and cancelled ones');
select ok((select bool_and (created >= assigned_or_later and assigned_or_later >= work_done and work_done >= closed) from public.admin_jobs_funnel (30)), 'each stage is a subset of the one before');
reset role;
update public.jobs set created_at = now () - interval '40 days' where id = current_setting ('t.j2')::uuid;
select public._t_claims ('adm');
select is ((select created from public.admin_jobs_funnel (30) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null and created_at > now () - interval '30 days'), 'jobs older than the period are left out');
select is ((select created from public.admin_jobs_funnel (60) where flow = 'posted'), (select count(*) from public.jobs where origin = 'customer_job' and target_worker_id is null), 'and included in a longer period');
reset role;
select public._t_as ('c1');
select throws_ok($$select * from public.admin_jobs_funnel(30)$$, 'admin only', 'a customer cannot read the funnel');
reset role;

-- ─── Moderating posted jobs ──────────────────────────────────────────────
select public._t_as ('c1');
select set_config ('t.m1', (select job_id from public.post_job ('Spam job', 'Something the admin will close', 'plumber'))::text, true);
select public._t_as_anon ();
with r as (select * from public.post_job ('Guest spam', 'A guest job the admin will see', 'plumber'))
select set_config ('t.m2', (select job_id from r)::text, true);
reset role;
insert into public.jobs (customer_id, worker_id, title, description, category, status, origin)
values (public._t_id ('c2'), public._t_id ('w1'), 'Assigned job', 'Already assigned to a worker', 'plumber', 'assigned', 'customer_job');
select set_config ('t.m3', (select id from public.jobs where title = 'Assigned job')::text, true);
insert into public.jobs (customer_id, title, description, category, status, origin)
values (public._t_id ('c2'), 'Service job', 'A service booking that is open', 'plumber', 'open', 'service_listing');
select set_config ('t.m4', (select id from public.jobs where title = 'Service job')::text, true);
select public._t_as ('w1');
select public.worker_quote_job (current_setting ('t.m1')::uuid, 700);
reset role;

select public._t_as ('adm');
select is ((select count(*) from public.admin_list_posted_jobs () where id = current_setting ('t.m1')::uuid), 1::bigint, 'admin sees an open posted job');
select is ((select is_guest from public.admin_list_posted_jobs () where id = current_setting ('t.m2')::uuid), true, 'and whether it came from a guest');
select is ((select customer_name from public.admin_list_posted_jobs () where id = current_setting ('t.m1')::uuid), 'Ali', 'or from a named customer');
select is ((select quote_count from public.admin_list_posted_jobs () where id = current_setting ('t.m1')::uuid), 1::bigint, 'with its quote count');
select is ((select count(*) from public.admin_list_posted_jobs () where id in (current_setting ('t.m3')::uuid, current_setting ('t.m4')::uuid)), 0::bigint, 'assigned jobs and service bookings are not listed');
select throws_ok($$select public.admin_close_posted_job(current_setting('t.m1')::uuid, '  ')$$, 'a reason is required', 'closing needs a reason');
select throws_ok($$select public.admin_close_posted_job(current_setting('t.m3')::uuid, 'Spam')$$, 'job is not an open posted job', 'an assigned job cannot be closed this way');
select throws_ok($$select public.admin_close_posted_job(current_setting('t.m4')::uuid, 'Spam')$$, 'job is not an open posted job', 'nor a service booking');
select lives_ok($$select public.admin_close_posted_job(current_setting('t.m1')::uuid, 'Spam')$$, 'the admin closes the job');
select public._t_as ('c1');
select throws_ok($$select public.admin_close_posted_job(current_setting('t.m2')::uuid, 'Spam')$$, 'admin only', 'a customer cannot close jobs');
select public._t_as_anon ();
select throws_ok($$select public.admin_close_posted_job(current_setting('t.m2')::uuid, 'Spam')$$, '42501', null, 'a guest cannot either');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.m1')::uuid), 'cancelled', 'the job is cancelled');
select is ((select count(*) from public.quotes where job_id = current_setting ('t.m1')::uuid and status = 'pending'), 0::bigint, 'its pending quotes are rejected');
select is ((select detail ->> 'reason' from public.admin_job_events where job_id = current_setting ('t.m1')::uuid and kind = 'moderated'), 'Spam', 'the feed records the reason');
select is ((select detail ->> 'by' from public.admin_job_events where job_id = current_setting ('t.m1')::uuid and kind = 'moderated'), public._t_id ('adm')::text, 'and who closed it');
select public._t_as ('w1');
select is ((select count(*) from public.list_open_jobs () where id = current_setting ('t.m1')::uuid), 0::bigint, 'the job is off the board');
select public._t_as ('c1');
select is ((select status from public.jobs where id = current_setting ('t.m1')::uuid), 'cancelled', 'and the poster sees it cancelled');
select public._t_as ('adm');
select is ((select count(*) from public.admin_list_posted_jobs () where id = current_setting ('t.m1')::uuid), 0::bigint, 'and it leaves the moderation list');
select is ((select count(*) from public.admin_list_job_events (100) where job_id = current_setting ('t.m1')::uuid and kind = 'moderated'), 1::bigint, 'the admin feed shows the closure');
select public._t_as ('c1');
select throws_ok($$select * from public.admin_list_posted_jobs()$$, 'admin only', 'a customer cannot list posted jobs for moderation');
reset role;

select * from finish ();
rollback;
