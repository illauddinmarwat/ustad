-- Estimates and final price: propose, confirm, pay and commission, with seeded users.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

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
select public._t_setting ('quote_commission_markup_enabled', 'true'::jsonb);
select public._t_setting ('commission_rate_pct', '15'::jsonb);

-- ─── Job A: an estimate quote of 100, with the 15% markup ─────────────────
select public._t_as ('c1');
select set_config ('t.a', (select job_id from public.post_job ('Fix tap', 'A job described in words', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.qa', (select public.worker_send_quote (current_setting ('t.a')::uuid, 100, null, 'estimate', current_date + 1))::text, true);
reset role;
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qa')::uuid);
reset role;
select is ((select status from public.jobs where id = current_setting ('t.a')::uuid), 'assigned', 'the accepted estimate job is assigned');
select is ((select amount_pkr from public.quotes where id = current_setting ('t.qa')::uuid), 115::numeric, 'the customer price of the estimate is 115');

-- Who may propose
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 0)$$, current_setting ('t.a')), 'invalid amount', 'a zero price is rejected');
reset role;
select public._t_as ('c1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 200)$$, current_setting ('t.a')), 'only the assigned worker can set the final price', 'the customer cannot set the final price');
reset role;
select public._t_as ('w2');
select throws_ok(format ($$select public.worker_set_final_price (%L, 200)$$, current_setting ('t.a')), 'only the assigned worker can set the final price', 'another worker cannot set it');
reset role;
select public._t_as_anon ();
select throws_ok(format ($$select public.worker_set_final_price (%L, 200)$$, current_setting ('t.a')), '42501', null, 'a guest cannot set it');
reset role;

-- Flag
select public._t_setting ('quote_upgrades_enabled', 'false'::jsonb);
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 200)$$, current_setting ('t.a')), 'quote details are not enabled', 'blocked while the flag is off');
reset role;
select public._t_setting ('quote_upgrades_enabled', 'true'::jsonb);

-- Nothing yet
select public._t_as ('c1');
select is ((select status from public.job_final_price (current_setting ('t.a')::uuid)), 'none', 'no final price yet');
select is ((select is_estimate from public.job_final_price (current_setting ('t.a')::uuid)), true, 'the job is an estimate job');
reset role;

-- Propose 200: the customer sees 230, the worker keeps 200
select public._t_as ('w1');
select is (public.worker_set_final_price (current_setting ('t.a')::uuid, 200), 230::numeric, 'proposing 200 shows the customer 230');
reset role;
select is ((select base_price_pkr from public.job_final_prices where job_id = current_setting ('t.a')::uuid), 200::numeric, 'the worker price is stored privately');
select is ((select commission_pct from public.job_final_prices where job_id = current_setting ('t.a')::uuid), 15::numeric, 'with the snapshotted percent');
select public._t_as ('c1');
select is ((select amount_pkr from public.job_final_price (current_setting ('t.a')::uuid)), 230::numeric, 'the customer sees 230');
select is ((select status from public.job_final_price (current_setting ('t.a')::uuid)), 'proposed', 'waiting for an answer');
select is ((select viewer from public.job_final_price (current_setting ('t.a')::uuid)), 'customer', 'as the customer');
select throws_ok($$select * from public.job_final_prices$$, '42501', null, 'the customer cannot read the private table');
reset role;
select public._t_as ('w1');
select is ((select amount_pkr from public.job_final_price (current_setting ('t.a')::uuid)), 200::numeric, 'the worker sees their own 200');
select is ((select viewer from public.job_final_price (current_setting ('t.a')::uuid)), 'worker', 'as the worker');
select is ((select customer_price_pkr from public.job_final_price (current_setting ('t.a')::uuid)), 230::numeric, 'and the amount to be paid is 230');
reset role;
select public._t_as ('c2');
select is ((select count(*) from public.job_final_price (current_setting ('t.a')::uuid)), 0::bigint, 'a stranger sees nothing');
reset role;
select public._t_as ('w2');
select is ((select count(*) from public.job_final_price (current_setting ('t.a')::uuid)), 0::bigint, 'another worker sees nothing');
reset role;
select public._t_as ('adm');
select is ((select amount_pkr from public.job_final_price (current_setting ('t.a')::uuid)), 230::numeric, 'an admin sees the customer price');
reset role;
select is (public._t_notif ('c1', 'final_price_proposed', '%230%') is not null, true, 'the customer is notified of Rs 230');

-- Payment is blocked until the price is agreed
select public._t_as ('w1');
select public.mark_job_completed (current_setting ('t.a')::uuid);
reset role;
select public._t_as ('c1');
select throws_ok(format ($$select public.mark_job_paid (%L, 230)$$, current_setting ('t.a')), 'agree the final price before paying', 'no payment before the final price is confirmed');
reset role;

-- Decline, propose again, accept
select public._t_as ('c2');
select throws_ok(format ($$select public.customer_respond_final_price (%L, true)$$, current_setting ('t.a')), 'only the customer can answer a final price', 'another customer cannot answer');
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select public.customer_respond_final_price (%L, true)$$, current_setting ('t.a')), 'only the customer can answer a final price', 'the worker cannot answer their own proposal');
reset role;
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.a')::uuid, false), 'declined', 'the customer declines');
reset role;
select is (public._t_notif ('w1', 'final_price_declined', '%') is not null, true, 'the worker is told it was declined');
select public._t_as ('c1');
select throws_ok(format ($$select public.customer_respond_final_price (%L, true)$$, current_setting ('t.a')), 'there is no final price waiting for an answer', 'nothing left to answer');
reset role;
select public._t_as ('w1');
select is (public.worker_set_final_price (current_setting ('t.a')::uuid, 180), 207::numeric, 'a new price of 180 shows 207');
reset role;
select is ((select attempts from public.job_final_prices where job_id = current_setting ('t.a')::uuid), 2, 'this is the second attempt');
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.a')::uuid, true), 'confirmed', 'the customer accepts');
reset role;
select is (public._t_notif ('w1', 'final_price_confirmed', '%180%') is not null, true, 'the worker is told Rs 180 was confirmed');
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 150)$$, current_setting ('t.a')), 'the final price is already confirmed', 'a confirmed price cannot change');
reset role;

-- Pay the agreed amount
select public._t_as ('c1');
select throws_ok(format ($$select public.mark_job_paid (%L, 200)$$, current_setting ('t.a')), 'the amount must match the agreed final price (Rs 207.00)', 'the amount must match the agreed price');
select lives_ok(format ($$select public.mark_job_paid (%L, 207)$$, current_setting ('t.a')), 'paying the agreed 207 works');
reset role;
select public._t_as ('w1');
select is (public.worker_confirm_payment_received (current_setting ('t.a')::uuid, 207), 'closed', 'the worker confirms and the job closes');
reset role;
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.a')::uuid), 27::numeric, 'the commission is 207 minus 180');
select is ((select commission_pct from public.payment_ledger where job_id = current_setting ('t.a')::uuid), 15::numeric, 'at the snapshotted percent');

-- ─── Job B: a fixed price is unaffected ───────────────────────────────────
select public._t_as ('c1');
select set_config ('t.b', (select job_id from public.post_job ('Fix basin', 'A job described in words', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.qb', (select public.worker_send_quote (current_setting ('t.b')::uuid, 100, null, 'fixed', current_date + 1))::text, true);
reset role;
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qb')::uuid);
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 200)$$, current_setting ('t.b')), 'this job has a fixed price', 'a fixed price has no final price');
select public.mark_job_completed (current_setting ('t.b')::uuid);
reset role;
select public._t_as ('c1');
select is ((select is_estimate from public.job_final_price (current_setting ('t.b')::uuid)), false, 'a fixed job is not an estimate job');
select lives_ok(format ($$select public.mark_job_paid (%L, 115)$$, current_setting ('t.b')), 'a fixed job can be paid as before');
reset role;

-- ─── Job C: an estimate with the markup switched off ──────────────────────
select public._t_setting ('quote_commission_markup_enabled', 'false'::jsonb);
select public._t_as ('c1');
select set_config ('t.c', (select job_id from public.post_job ('Fix sink', 'A job described in words', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.qc', (select public.worker_send_quote (current_setting ('t.c')::uuid, 300, null, 'estimate', current_date + 1))::text, true);
reset role;
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qc')::uuid);
reset role;
select public._t_as ('w1');
select is (public.worker_set_final_price (current_setting ('t.c')::uuid, 350), 350::numeric, 'without a markup the customer price is the typed price');
reset role;
select is ((select has_markup from public.job_final_prices where job_id = current_setting ('t.c')::uuid), false, 'no markup is recorded');
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.c')::uuid, true), 'confirmed', 'accepted');
reset role;
select public._t_as ('w1');
select public.mark_job_completed (current_setting ('t.c')::uuid);
reset role;
select public._t_as ('c1');
select lives_ok(format ($$select public.mark_job_paid (%L, 350)$$, current_setting ('t.c')), 'pays 350');
reset role;
select public._t_as ('w1');
select is (public.worker_confirm_payment_received (current_setting ('t.c')::uuid, 350), 'closed', 'closes');
reset role;
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.c')::uuid), 52.5::numeric, 'the old rule applies: 15 percent of 350');

-- ─── Job D: at most three proposals ───────────────────────────────────────
select public._t_as ('c1');
select set_config ('t.d', (select job_id from public.post_job ('Fix pipe', 'A job described in words', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.qd', (select public.worker_send_quote (current_setting ('t.d')::uuid, 100, null, 'estimate', current_date + 1))::text, true);
reset role;
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qd')::uuid);
reset role;
select public._t_as ('w1');
select lives_ok(format ($$select public.worker_set_final_price (%L, 110)$$, current_setting ('t.d')), 'proposal of 110');
reset role;
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.d')::uuid, false), 'declined', 'declined 110');
reset role;
select public._t_as ('w1');
select lives_ok(format ($$select public.worker_set_final_price (%L, 120)$$, current_setting ('t.d')), 'proposal of 120');
reset role;
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.d')::uuid, false), 'declined', 'declined 120');
reset role;
select public._t_as ('w1');
select lives_ok(format ($$select public.worker_set_final_price (%L, 130)$$, current_setting ('t.d')), 'proposal of 130');
reset role;
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.d')::uuid, false), 'declined', 'declined 130');
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_set_final_price (%L, 140)$$, current_setting ('t.d')), 'too many proposals; please call the helpline', 'a fourth proposal is refused');
reset role;

-- ─── Job E: the job is completed before a price is set ────────────────────
select public._t_as ('c1');
select set_config ('t.e', (select job_id from public.post_job ('Fix door', 'A job described in words', 'plumber', 'Karachi'))::text, true);
reset role;
select public._t_as ('w1');
select set_config ('t.qe', (select public.worker_send_quote (current_setting ('t.e')::uuid, 100, null, 'estimate', current_date + 1))::text, true);
reset role;
select public._t_as ('c1');
select public.customer_accept_quote (current_setting ('t.qe')::uuid);
reset role;
select public._t_as ('c1');
select public.mark_job_completed (current_setting ('t.e')::uuid);
reset role;
select public._t_as ('w1');
select lives_ok(format ($$select public.worker_set_final_price (%L, 120)$$, current_setting ('t.e')), 'a price can still be set on a completed job');
reset role;
select public._t_as ('c1');
select is (public.customer_respond_final_price (current_setting ('t.e')::uuid, true), 'confirmed', 'and confirmed');
reset role;

select * from finish ();
rollback;
