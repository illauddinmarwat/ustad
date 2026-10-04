-- Quote commission markup (docs/quote-commission-plan.md, Phase 1): the customer sees the Ustad price plus the
-- commission percent, the Ustad keeps their price, and the commission owed is the difference.
-- Seeded-user tests: real people are created through the signup trigger and act through
-- the same roles the app uses (authenticated / anon), so row-level security and privileges are exercised.

begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

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
select public._t_setting ('direct_requests_enabled', 'true'::jsonb);
select public._t_setting ('commission_rate_pct', '15'::jsonb);

-- An assigned job -> worker marks it done -> customer pays `amt` -> worker confirms receiving `got`.
-- Returns the confirm result ('closed' or 'disputed').
create function public._t_finish (p_job uuid, p_cust text, p_worker text, p_amt numeric, p_got numeric) returns text language plpgsql as $$
declare r text;
begin
  perform public._t_as (p_worker);
  perform public.worker_mark_work_done (p_job);
  perform public._t_as (p_cust);
  perform public.mark_job_completed (p_job);
  perform public.mark_job_paid (p_job, p_amt, 'cash');
  perform public._t_as (p_worker);
  r := public.worker_confirm_payment_received (p_job, p_got);
  reset role;
  return r;
end $$;

select public._t_as ('c1');
select set_config ('t.j', (select job_id from public.post_job ('Fix tap', 'The kitchen tap is leaking badly', 'plumber', 'Karachi'))::text, true);
select set_config ('t.k', (select job_id from public.post_job ('Fix basin', 'The bathroom basin is cracked', 'plumber', 'Karachi'))::text, true);
reset role;

-- ─── Flag off: behaves exactly as before ─────────────────────────────────
select public._t_as ('w1');
select public.worker_quote_job (current_setting ('t.j')::uuid, 100, 'Can do it today');
select is ((select customer_price from public.quote_price_preview (100)), 100::numeric, 'flag off: the preview adds nothing');
reset role;
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 100::numeric, 'flag off: the quote is stored as typed');
select is ((select count(*) from public.quote_pricing), 0::bigint, 'flag off: no pricing row is kept');

-- ─── Flag on: preview ────────────────────────────────────────────────────
select public._t_setting ('quote_commission_markup_enabled', 'true'::jsonb);

select public._t_as ('w1');
select is ((select customer_price from public.quote_price_preview (100)), 115::numeric, 'preview: Rs 100 at 15% shows the customer Rs 115');
select is ((select commission from public.quote_price_preview (100)), 15::numeric, 'preview: the platform fee is Rs 15');
select is ((select commission_pct from public.quote_price_preview (100)), 15::numeric, 'preview: at 15%');
select is ((select customer_price from public.quote_price_preview (333)), 383::numeric, 'preview: Rs 333 becomes 382.95, rounded up to Rs 383');
select is ((select commission from public.quote_price_preview (333)), 50::numeric, 'preview: the fee is the difference, Rs 50');
select throws_ok($$select * from public.quote_price_preview (-1)$$, 'invalid amount', 'preview: a negative amount is rejected');
reset role;
select public._t_as ('c1');
select throws_ok($$select * from public.quote_price_preview (100)$$, 'approved workers only', 'preview: a customer cannot use it');
reset role;

-- ─── Quoting a posted job ────────────────────────────────────────────────
select public._t_as ('w1');
select public.worker_quote_job (current_setting ('t.j')::uuid, 100, 'Can do it today');
reset role;
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 115::numeric, 'the customer price on the quote is Rs 115');
select is ((select base_amount_pkr from public.quote_pricing p join public.quotes q on q.id = p.quote_id where q.job_id = current_setting ('t.j')::uuid and q.status = 'pending'), 100::numeric, 'the Ustad price of Rs 100 is kept privately');
select is ((select commission_pct from public.quote_pricing p join public.quotes q on q.id = p.quote_id where q.job_id = current_setting ('t.j')::uuid and q.status = 'pending'), 15::numeric, 'with the percent snapshotted');

-- The customer sees one price and cannot read the breakdown.
select public._t_as ('c1');
select is ((select amount_pkr from public.job_quotes (current_setting ('t.j')::uuid) where worker_name = 'Usman' and status = 'pending'), 115::numeric, 'the customer sees Rs 115 in the quote list');
select is ((select count(*) from public.quote_pricing), 0::bigint, 'the customer cannot read the pricing breakdown');
reset role;
select public._t_as_anon ();
select throws_ok($$select * from public.quote_pricing$$, '42501', null, 'a guest cannot read the pricing breakdown');
reset role;

-- The worker sees only their own breakdown.
select public._t_as ('w2');
select public.worker_quote_job (current_setting ('t.j')::uuid, 200, 'Can start tomorrow');
select is ((select count(*) from public.quote_pricing), 1::bigint, 'a worker sees only their own pricing row');
select is ((select base_amount_pkr from public.quote_pricing), 200::numeric, 'and it is their own price');
reset role;
select public._t_as ('w1');
select is ((select base_amount_pkr from public.quote_pricing), 100::numeric, 'the other worker sees only theirs');
reset role;
select public._t_as ('adm');
select is ((select count(*) from public.quote_pricing), 2::bigint, 'an admin sees every pricing row');
reset role;

-- Worker-facing views show the worker's own price, so re-sending never compounds the markup.
select public._t_as ('w1');
select is ((select my_quote_pkr from public.get_board_job (current_setting ('t.j')::uuid)), 100::numeric, 'the board job shows the Ustad their own price, Rs 100');
select is ((select my_customer_price_pkr from public.get_board_job (current_setting ('t.j')::uuid)), 115::numeric, 'and what the customer will see, Rs 115');
select is ((select my_quote_pkr from public.list_open_jobs () where id = current_setting ('t.j')::uuid), 100::numeric, 'the job board list shows Rs 100');
select is ((select amount_pkr from public.list_my_quotes () where job_id = current_setting ('t.j')::uuid and status = 'pending'), 100::numeric, 'my quotes list shows Rs 100');
reset role;

-- The percent is snapshotted: changing the setting moves nothing already sent.
select public._t_setting ('commission_rate_pct', '20'::jsonb);
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'), 115::numeric, 'a later rate change does not move a quote already sent');
select public._t_as ('w2');
select public.worker_quote_job (current_setting ('t.j')::uuid, 200, 'Can start tomorrow');
reset role;
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w2') and status = 'pending'), 240::numeric, 'a new quote uses the new rate: Rs 200 at 20% is Rs 240');
select is ((select p.commission_pct from public.quote_pricing p join public.quotes q on q.id = p.quote_id where q.job_id = current_setting ('t.j')::uuid and q.worker_id = public._t_id ('w2') and q.status = 'pending'), 20::numeric, 'and snapshots 20%');
select public._t_setting ('commission_rate_pct', '15'::jsonb);

-- ─── Accepting, paying and the commission owed ───────────────────────────
select public._t_as ('c1');
select public.customer_accept_quote ((select id from public.quotes where job_id = current_setting ('t.j')::uuid and worker_id = public._t_id ('w1') and status = 'pending'));
reset role;
select is (public._t_finish (current_setting ('t.j')::uuid, 'c1', 'w1', 115, 115), 'closed', 'the customer pays Rs 115 and the worker confirms it');
select is ((select order_amount_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j')::uuid), 115::numeric, 'the order value is what the customer paid');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.j')::uuid), 15::numeric, 'the Ustad owes Rs 15, not 15% of 115');
select is ((select commission_pct from public.worker_commission_ledger where job_id = current_setting ('t.j')::uuid), 15::numeric, 'at the snapshotted 15%');
select is ((select fee_pkr from public.payment_ledger where job_id = current_setting ('t.j')::uuid), 15::numeric, 'the payment ledger agrees');

-- ─── Direct requests: no budget, same markup ─────────────────────────────
select public._t_as ('c2');
select set_config ('t.d', public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'The pipe under the sink is leaking', 'plumber', 5000)::text, true);
reset role;
select is ((select budget_pkr from public.jobs where id = current_setting ('t.d')::uuid), null::numeric, 'a direct request no longer keeps a budget');
select public._t_as ('w1');
select throws_ok(format ($$select public.worker_accept_direct_request (%L)$$, current_setting ('t.d')), 'no budget set; send a quote instead', 'there is no budget to accept as-is');
select public.worker_quote_direct_request (current_setting ('t.d')::uuid, 200, 'Can come this evening');
reset role;
select is ((select amount_pkr from public.quotes where job_id = current_setting ('t.d')::uuid and status = 'pending'), 230::numeric, 'a direct request quote of Rs 200 shows the customer Rs 230');
select public._t_as ('c2');
select is ((select amount_pkr from public.job_quotes (current_setting ('t.d')::uuid) where status = 'pending'), 230::numeric, 'the customer sees only Rs 230');
select public.customer_accept_direct_quote ((select id from public.quotes where job_id = current_setting ('t.d')::uuid and status = 'pending'));
reset role;
select is (public._t_finish (current_setting ('t.d')::uuid, 'c2', 'w1', 230, 230), 'closed', 'the direct request job closes');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.d')::uuid), 30::numeric, 'the Ustad owes Rs 30 on a Rs 200 price');

-- ─── A disputed job resolved as paid still owes the difference ───────────
select public._t_as ('w2');
select public.worker_quote_job (current_setting ('t.k')::uuid, 100, 'Can do it');
reset role;
select public._t_as ('c1');
select public.customer_accept_quote ((select id from public.quotes where job_id = current_setting ('t.k')::uuid and status = 'pending'));
reset role;
select is (public._t_finish (current_setting ('t.k')::uuid, 'c1', 'w2', 115, 100), 'disputed', 'a mismatch is a dispute');
select public._t_as ('adm');
select public.admin_resolve_job_dispute (current_setting ('t.k')::uuid, 'paid', 'Agreed on the phone');
reset role;
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.k')::uuid), 15::numeric, 'resolved as paid: the fee is the difference, Rs 15');

-- ─── Old rule still applies without a pricing row (flag off) ─────────────
select public._t_setting ('quote_commission_markup_enabled', 'false'::jsonb);
select public._t_as ('c1');
select set_config ('t.l', public.create_direct_request (public._t_id ('w1'), 'Fix leak', 'Leak behind the washing machine', 'plumber', 2000)::text, true);
reset role;
select is ((select budget_pkr from public.jobs where id = current_setting ('t.l')::uuid), 2000::numeric, 'flag off: the budget is still kept');
select public._t_as ('w1');
select public.worker_accept_direct_request (current_setting ('t.l')::uuid);
reset role;
select is (public._t_finish (current_setting ('t.l')::uuid, 'c1', 'w1', 2000, 2000), 'closed', 'flag off: the budget job closes');
select is ((select commission_pkr from public.worker_commission_ledger where job_id = current_setting ('t.l')::uuid), 300::numeric, 'flag off: the old rule, 15% of Rs 2000, applies');

-- ─── Admin per-job pricing ───────────────────────────────────────────────
select public._t_as ('adm');
select is ((select customer_price_pkr from public.admin_job_pricing (array[current_setting ('t.j')::uuid])), 115::numeric, 'admin: the customer price of a marked-up job');
select is ((select ustad_price_pkr from public.admin_job_pricing (array[current_setting ('t.j')::uuid])), 100::numeric, 'admin: the Ustad price');
select is ((select commission_pkr from public.admin_job_pricing (array[current_setting ('t.j')::uuid])), 15::numeric, 'admin: the commission');
select is ((select marked_up from public.admin_job_pricing (array[current_setting ('t.l')::uuid])), false, 'admin: a job accepted at the budget as-is is not marked up');
select is ((select ustad_price_pkr from public.admin_job_pricing (array[current_setting ('t.l')::uuid])), null::numeric, 'admin: and has no separate Ustad price');
reset role;
select public._t_as ('c1');
select throws_ok(format ($$select * from public.admin_job_pricing (array[%L::uuid])$$, current_setting ('t.j')), 'admin only', 'a customer cannot read job pricing');
reset role;
select public._t_as ('w1');
select throws_ok(format ($$select * from public.admin_job_pricing (array[%L::uuid])$$, current_setting ('t.j')), 'admin only', 'a worker cannot read job pricing');
reset role;

select * from finish ();
rollback;
