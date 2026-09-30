-- Quote commission markup (docs/quote-commission-plan.md, Phase 1).
--
-- The Ustad names the price they want to earn (X). The customer sees X plus the
-- commission percent, rounded up to a whole rupee. The commission owed to the
-- platform is exactly that difference, so the Ustad keeps X.
--
--   customer price = ceil (X * (1 + pct / 100))      e.g. X = 100, pct = 15  ->  115
--   commission     = customer price - X                                       ->   15
--
-- * `quotes.amount_pkr` stays the CUSTOMER price, so every existing reader (job_quotes, inbox,
--   sorting, notifications) keeps working unchanged.
-- * X and the percent live in `quote_pricing`, a private table (only the quoting worker and
--   admins can read it), so a customer, who can select their job's quotes, never sees them.
-- * The percent is snapshotted when the quote is sent; a later settings change moves nothing.
-- * Everything sits behind `quote_commission_markup_enabled` (seeded false). While it is off
--   the quote functions behave exactly as before and old app builds keep working.
-- * Direct requests no longer take a customer budget (plan C5): with the flag on the budget
--   is ignored and "accept the budget" is closed.
-- * Jobs whose accepted quote has a `quote_pricing` row use `customer price - X` as the
--   commission; every other job keeps the old rule (commission % of the amount paid).

insert into public.app_settings (key, value) values
  ('quote_commission_markup_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ─── 1) Helpers: the flag, the rate, the one bit of maths ────────────────

create or replace function public._quote_markup_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'quote_commission_markup_enabled'),
    false
  );
$$;

revoke all on function public._quote_markup_enabled () from public, anon, authenticated;

create or replace function public._commission_pct ()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select nullif (s.value #>> '{}', '')::numeric from public.app_settings s where s.key = 'commission_rate_pct'),
    15
  );
$$;

revoke all on function public._commission_pct () from public, anon, authenticated;

create or replace function public._apply_commission (p_x numeric, p_pct numeric)
returns numeric
language sql
immutable
as $$
  select ceil (p_x * (1 + p_pct / 100));
$$;

revoke all on function public._apply_commission (numeric, numeric) from public, anon, authenticated;

-- ─── 2) Private pricing breakdown per quote ──────────────────────────────

create table if not exists public.quote_pricing (
  quote_id uuid primary key references public.quotes (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  base_amount_pkr numeric(12, 2) not null check (base_amount_pkr >= 0),
  commission_pct numeric(5, 2) not null check (commission_pct >= 0)
);

alter table public.quote_pricing enable row level security;
revoke all on public.quote_pricing from anon, authenticated;
grant select on public.quote_pricing to authenticated;

drop policy if exists "quote_pricing_select_own" on public.quote_pricing;
create policy "quote_pricing_select_own"
  on public.quote_pricing for select
  to authenticated
  using (worker_id = auth.uid () or public._is_admin ());

-- Creates the quote row's pricing and returns the customer price to store on the quote.
-- Called before the quote insert, so it only computes; `_save_quote_pricing` stores.
create or replace function public._quote_price (p_x numeric)
returns table (customer_price numeric, pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public._quote_markup_enabled () then
    pct := public._commission_pct ();
    customer_price := public._apply_commission (p_x, pct);
  else
    pct := 0;
    customer_price := p_x;
  end if;
  return next;
end;
$$;

revoke all on function public._quote_price (numeric) from public, anon, authenticated;

create or replace function public._save_quote_pricing (p_quote_id uuid, p_worker uuid, p_x numeric, p_pct numeric)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.quote_pricing (quote_id, worker_id, base_amount_pkr, commission_pct)
  select p_quote_id, p_worker, p_x, p_pct
  where public._quote_markup_enabled ();
$$;

revoke all on function public._save_quote_pricing (uuid, uuid, numeric, numeric) from public, anon, authenticated;

-- What the worker form shows while typing. Uses the same maths as the quote functions.
create or replace function public.quote_price_preview (p_amount_pkr numeric)
returns table (customer_price numeric, commission numeric, commission_pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cp record;
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  if p_amount_pkr is null or p_amount_pkr < 0 then
    raise exception 'invalid amount';
  end if;
  select * into cp from public._quote_price (p_amount_pkr);
  customer_price := cp.customer_price;
  commission := cp.customer_price - p_amount_pkr;
  commission_pct := cp.pct;
  return next;
end;
$$;

revoke execute on function public.quote_price_preview (numeric) from public, anon;
grant execute on function public.quote_price_preview (numeric) to authenticated;

-- ─── 3) Quote functions: the typed amount is now X ───────────────────────

create or replace function public.worker_quote_job (
  p_job_id uuid,
  p_amount_pkr numeric,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  qid uuid;
  cp record;
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  if p_amount_pkr is null or p_amount_pkr <= 0 then
    raise exception 'invalid amount';
  end if;
  if public._contains_contact (p_message) then
    raise exception 'please do not include phone numbers or links; they are shared after you are assigned';
  end if;

  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.origin <> 'customer_job' then
    raise exception 'job not found';
  end if;
  if j.status not in ('open', 'quoted') or j.worker_id is not null or j.expires_at <= now () then
    raise exception 'this job is no longer open';
  end if;
  if j.target_worker_id is not null and j.target_worker_id <> auth.uid () then
    raise exception 'this request is reserved for another worker';
  end if;
  if j.customer_id is not distinct from auth.uid () then
    raise exception 'you cannot quote on your own job';
  end if;
  if not exists (
    select 1 from public.worker_profiles wp where wp.user_id = auth.uid () and j.category = any (wp.categories)
  ) then
    raise exception 'this job is outside your categories';
  end if;

  select * into cp from public._quote_price (p_amount_pkr);

  update public.quotes set status = 'rejected'
    where job_id = j.id and worker_id = auth.uid () and status = 'pending';
  insert into public.quotes (job_id, worker_id, amount_pkr, message)
  values (j.id, auth.uid (), cp.customer_price, nullif (btrim (coalesce (p_message, '')), ''))
  returning id into qid;
  perform public._save_quote_pricing (qid, auth.uid (), p_amount_pkr, cp.pct);

  insert into public.quote_events (job_id, worker_id, amount_pkr) values (j.id, auth.uid (), cp.customer_price);
  update public.jobs set status = 'quoted', updated_at = now () where id = j.id;
  return qid;
end;
$$;

revoke execute on function public.worker_quote_job (uuid, numeric, text) from public, anon;
grant execute on function public.worker_quote_job (uuid, numeric, text) to authenticated;

create or replace function public.worker_quote_direct_request (
  p_job_id uuid,
  p_amount_pkr numeric,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  qid uuid;
  cp record;
begin
  j := public._targeted_open_job (p_job_id);
  if p_amount_pkr is null or p_amount_pkr < 0 then
    raise exception 'invalid amount';
  end if;

  select * into cp from public._quote_price (p_amount_pkr);

  update public.quotes set status = 'rejected'
    where job_id = j.id and worker_id = auth.uid () and status = 'pending';
  insert into public.quotes (job_id, worker_id, amount_pkr, message)
  values (j.id, auth.uid (), cp.customer_price, nullif (btrim (coalesce (p_message, '')), ''))
  returning id into qid;
  perform public._save_quote_pricing (qid, auth.uid (), p_amount_pkr, cp.pct);

  update public.jobs set status = 'quoted', updated_at = now () where id = j.id;
  return qid;
end;
$$;

revoke execute on function public.worker_quote_direct_request (uuid, numeric, text) from public, anon;
grant execute on function public.worker_quote_direct_request (uuid, numeric, text) to authenticated;

-- ─── 4) Direct requests: no customer budget (plan C5) ────────────────────
-- With the flag on the budget is ignored, and the old "accept the budget as-is" path is
-- closed because there is no customer number to work backwards from.

create or replace function public.create_direct_request (
  p_worker_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_budget_pkr numeric default null,
  p_preferred_time text default null,
  p_location_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  open_today int;
  daily_limit int;
  timeout_hours int;
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  if not public._direct_requests_enabled () then
    raise exception 'direct requests are not enabled';
  end if;
  if p_worker_id = auth.uid () then
    raise exception 'cannot request yourself';
  end if;
  if coalesce (btrim (p_title), '') = '' or coalesce (btrim (p_description), '') = '' then
    raise exception 'title and description are required';
  end if;
  if coalesce (btrim (p_category), '') = '' then
    raise exception 'category is required';
  end if;

  -- Target must be an approved worker (D14) who offers this category.
  if not exists (
    select 1
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.user_id
    where wp.user_id = p_worker_id
      and p.role = 'worker'
      and p.status = 'active'
      and wp.approval_status = 'approved'
      and wp.categories @> array[p_category]
  ) then
    raise exception 'worker not available for this category';
  end if;

  daily_limit := public._direct_request_setting_int ('direct_request_daily_limit', 5);
  select count (*) into open_today
  from public.jobs j
  where j.customer_id = auth.uid ()
    and j.target_worker_id is not null
    and j.created_at > now () - interval '1 day';
  if open_today >= daily_limit then
    raise exception 'daily request limit reached';
  end if;

  timeout_hours := public._direct_request_setting_int ('direct_request_timeout_hours', 2);

  insert into public.jobs (
    customer_id, title, description, category, status, origin,
    location_text, target_worker_id, target_expires_at, budget_pkr, preferred_time
  ) values (
    auth.uid (), btrim (p_title), btrim (p_description), p_category, 'open', 'customer_job',
    nullif (btrim (coalesce (p_location_text, '')), ''),
    p_worker_id, now () + make_interval (hours => timeout_hours),
    case when public._quote_markup_enabled () then null else p_budget_pkr end,
    nullif (btrim (coalesce (p_preferred_time, '')), '')
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.create_direct_request (uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.create_direct_request (uuid, text, text, text, numeric, text, text) to authenticated;

create or replace function public.worker_accept_direct_request (p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  j := public._targeted_open_job (p_job_id);
  if public._quote_markup_enabled () then
    raise exception 'no budget set; send a quote instead';
  end if;
  if j.budget_pkr is null then
    raise exception 'no budget set; send a quote instead';
  end if;

  insert into public.quotes (job_id, worker_id, amount_pkr, message, status)
  values (j.id, auth.uid (), j.budget_pkr, 'Accepted your budget', 'accepted');
  update public.quotes set status = 'rejected'
    where job_id = j.id and worker_id <> auth.uid () and status = 'pending';
  update public.jobs
    set status = 'assigned', worker_id = auth.uid (), target_expires_at = null, updated_at = now ()
    where id = j.id;
end;
$$;

revoke execute on function public.worker_accept_direct_request (uuid) from public, anon;
grant execute on function public.worker_accept_direct_request (uuid) to authenticated;

-- ─── 5) Commission on close: X-priced jobs owe `customer price - X` ──────
-- Returns the percent and the fee for a job's payment of `p_amount`.
--   * accepted quote has a pricing row -> fee = customer price - X (capped at the amount paid)
--   * otherwise (old quotes, listings, flag off) -> the old rule: percent of the amount paid.

create or replace function public._job_commission (p_job_id uuid, p_amount numeric)
returns table (pct numeric, fee numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  qp record;
begin
  select q.amount_pkr as customer_price, qp2.base_amount_pkr as base, qp2.commission_pct as qpct
    into qp
    from public.quotes q
    join public.quote_pricing qp2 on qp2.quote_id = q.id
    where q.job_id = p_job_id and q.status = 'accepted'
    limit 1;
  if found then
    pct := qp.qpct;
    fee := least (p_amount, qp.customer_price - qp.base);
  else
    pct := public._commission_pct ();
    fee := round (p_amount * pct / 100, 2);
  end if;
  return next;
end;
$$;

revoke all on function public._job_commission (uuid, numeric) from public, anon, authenticated;

create or replace function public.worker_confirm_payment_received (
  p_job_id uuid,
  p_received_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  pay public.payment_ledger%rowtype;
  c record;
  matched boolean;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if j.worker_id is distinct from auth.uid () then
    raise exception 'only the assigned worker can confirm payment';
  end if;
  if j.status <> 'payment_pending' then
    raise exception 'no payment is waiting for confirmation';
  end if;
  if p_received_amount is null or p_received_amount < 0 then
    raise exception 'invalid amount';
  end if;

  select * into pay from public.payment_ledger
    where job_id = p_job_id and status = 'pending'
    order by created_at desc limit 1 for update;
  if not found then
    raise exception 'no pending payment found';
  end if;

  matched := (p_received_amount = pay.amount_pkr);

  if matched then
    select * into c from public._job_commission (p_job_id, pay.amount_pkr);
    update public.payment_ledger
      set status = 'paid', worker_confirmed = true, received_amount_pkr = p_received_amount,
          commission_pct = c.pct, fee_pkr = c.fee
      where id = pay.id;
    update public.jobs set status = 'closed', updated_at = now () where id = p_job_id;
    return 'closed';
  end if;

  update public.payment_ledger
    set status = 'disputed', worker_confirmed = false, received_amount_pkr = p_received_amount
    where id = pay.id;
  update public.jobs set status = 'disputed', updated_at = now () where id = p_job_id;
  return 'disputed';
end;
$$;

revoke execute on function public.worker_confirm_payment_received (uuid, numeric) from public, anon;
grant execute on function public.worker_confirm_payment_received (uuid, numeric) to authenticated;

create or replace function public.admin_resolve_job_dispute (
  p_job_id uuid,
  p_ledger_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  pay public.payment_ledger%rowtype;
  c record;
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  if p_ledger_status not in ('paid', 'refunded') then
    raise exception 'ledger status must be paid or refunded';
  end if;
  if coalesce (btrim (p_note), '') = '' then
    raise exception 'a note is required';
  end if;

  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.status <> 'disputed' then
    raise exception 'job is not disputed';
  end if;
  select * into pay from public.payment_ledger
    where job_id = p_job_id and status = 'disputed'
    order by created_at desc limit 1 for update;
  if not found then
    raise exception 'no disputed payment found';
  end if;

  if p_ledger_status = 'paid' then
    select * into c from public._job_commission (p_job_id, pay.amount_pkr);
    update public.payment_ledger
      set status = 'paid', worker_confirmed = true, commission_pct = c.pct, fee_pkr = c.fee,
          note = coalesce (note || E'\n', '') || 'Admin: ' || btrim (p_note)
      where id = pay.id;
  else
    update public.payment_ledger
      set status = 'refunded', fee_pkr = 0,
          note = coalesce (note || E'\n', '') || 'Admin: ' || btrim (p_note)
      where id = pay.id;
  end if;

  update public.jobs set status = 'closed', updated_at = now () where id = p_job_id;
  insert into public.admin_job_events (job_id, kind, detail)
  values (p_job_id, 'dispute_resolved',
          jsonb_build_object ('ledger_status', p_ledger_status, 'note', btrim (p_note), 'by', auth.uid ()));
end;
$$;

revoke execute on function public.admin_resolve_job_dispute (uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_job_dispute (uuid, text, text) to authenticated;
