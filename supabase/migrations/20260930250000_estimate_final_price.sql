-- Estimates and final price (docs/job-quotes-plan.md, Phase 2).
--
-- A quote can be an ESTIMATE (`quotes.price_type = 'estimate'`, Phase 1). After the customer accepts it and the
-- Ustad has inspected the job, the Ustad proposes a final price and the customer confirms it before paying.
--
--   * The Ustad types their own price (X'), exactly like a quote. If the accepted quote had a commission markup,
--     the same percent (snapshotted on that quote) is applied, so the customer sees X' plus the markup and the
--     Ustad keeps X'. Without a markup the two are the same number.
--   * The customer sees and confirms only the customer price. The breakdown lives in `job_final_prices`, a
--     private table that no client can read; the app reads it through `job_final_price`, which returns each
--     side only its own number.
--   * `mark_job_paid` for an estimate job needs a confirmed final price, and the amount must match it.
--   * When the job closes, the commission is the difference (`_job_commission`), as for marked-up quotes.
--
-- Everything sits behind `quote_upgrades_enabled` (seeded false in Phase 1). Fixed quotes and old jobs are
-- unaffected: the new checks apply only to jobs whose accepted quote is an estimate.

-- ─── 1) Private table ────────────────────────────────────────────────────

create table if not exists public.job_final_prices (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  base_price_pkr numeric(12, 2) not null check (base_price_pkr > 0),
  commission_pct numeric(5, 2) not null default 0 check (commission_pct >= 0),
  has_markup boolean not null default false,
  customer_price_pkr numeric(12, 2) not null check (customer_price_pkr > 0),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'declined')),
  attempts int not null default 1,
  created_at timestamptz not null default now (),
  decided_at timestamptz
);

alter table public.job_final_prices enable row level security;
revoke all on public.job_final_prices from anon, authenticated;

-- ─── 2) Notification texts ───────────────────────────────────────────────

create or replace function public._notification_text_final_price (p_kind text, p_lang text, p jsonb)
returns table (title text, body text)
language plpgsql
immutable
as $$
declare
  ur boolean := coalesce (p_lang, 'ur') <> 'en';
  amt text := coalesce (p ->> 'amount', '');
  job text := coalesce (p ->> 'job_title', '');
begin
  case p_kind
    when 'final_price_proposed' then
      title := case when ur then 'حتمی قیمت کی تجویز' else 'Final price proposed' end;
      body  := case when ur then 'استاد نے ' || job || ' کے لیے حتمی قیمت روپے ' || amt || ' بتائی ہے۔ قبول یا مسترد کریں۔'
               else 'Your Ustad proposed a final price of Rs ' || amt || ' for ' || job || '. Please accept or decline.' end;
    when 'final_price_confirmed' then
      title := case when ur then 'حتمی قیمت منظور' else 'Final price confirmed' end;
      body  := case when ur then 'کسٹمر نے ' || job || ' کے لیے روپے ' || amt || ' منظور کر لیے۔'
               else 'The customer confirmed Rs ' || amt || ' for ' || job || '.' end;
    when 'final_price_declined' then
      title := case when ur then 'حتمی قیمت مسترد' else 'Final price declined' end;
      body  := case when ur then 'کسٹمر نے ' || job || ' کے لیے آپ کی قیمت قبول نہیں کی۔ بات کر کے نئی قیمت بھیجیں۔'
               else 'The customer did not accept your price for ' || job || '. Talk to them and send a new price.' end;
    else
      return;
  end case;
  return next;
end;
$$;

revoke all on function public._notification_text_final_price (text, text, jsonb) from public, anon, authenticated;

-- `_notify` asks the Hisab texts, then these, then the general ones.
create or replace function public._notify (p_user uuid, p_kind text, p_job uuid, p jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lang text;
  txt record;
  payload jsonb;
begin
  if p_user is null then
    return;
  end if;
  select preferred_language into lang from public.profiles where id = p_user;
  select * into txt from public._notification_text_hisab (p_kind, lang, p);
  if not found then
    select * into txt from public._notification_text_final_price (p_kind, lang, p);
  end if;
  if not found then
    select * into txt from public._notification_text (p_kind, lang, p);
  end if;
  payload := jsonb_build_object ('kind', p_kind, 'job_id', p_job) || coalesce (p, '{}'::jsonb);

  insert into public.notifications (user_id, kind, job_id, title, body, data)
  values (p_user, p_kind, p_job, txt.title, txt.body, payload);

  perform public._push_to_user (p_user, txt.title, txt.body, payload);
exception when others then
  raise warning 'notification failed: %', sqlerrm;
end;
$$;

revoke all on function public._notify (uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ─── 3) The Ustad proposes a final price ─────────────────────────────────

create or replace function public.worker_set_final_price (p_job_id uuid, p_amount_pkr numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  q public.quotes%rowtype;
  qp public.quote_pricing%rowtype;
  f public.job_final_prices%rowtype;
  cust numeric;
  pct numeric := 0;
  markup boolean := false;
begin
  if not public._quote_upgrades_enabled () then
    raise exception 'quote details are not enabled';
  end if;
  if p_amount_pkr is null or p_amount_pkr <= 0 then
    raise exception 'invalid amount';
  end if;

  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.worker_id is distinct from auth.uid () then
    raise exception 'only the assigned worker can set the final price';
  end if;
  if j.status not in ('assigned', 'completed') then
    raise exception 'the final price can only be set before payment';
  end if;
  select * into q from public.quotes where job_id = p_job_id and status = 'accepted' limit 1;
  if not found or q.price_type <> 'estimate' then
    raise exception 'this job has a fixed price';
  end if;

  select * into f from public.job_final_prices where job_id = p_job_id for update;
  if found then
    if f.status = 'confirmed' then
      raise exception 'the final price is already confirmed';
    end if;
    if f.status = 'declined' and f.attempts >= 3 then
      raise exception 'too many proposals; please call the helpline';
    end if;
  end if;

  select * into qp from public.quote_pricing where quote_id = q.id;
  if found then
    markup := true;
    pct := qp.commission_pct;
    cust := public._apply_commission (p_amount_pkr, pct);
  else
    cust := p_amount_pkr;
  end if;

  insert into public.job_final_prices (job_id, worker_id, base_price_pkr, commission_pct, has_markup, customer_price_pkr)
  values (p_job_id, auth.uid (), p_amount_pkr, pct, markup, cust)
  on conflict (job_id) do update
    set base_price_pkr = excluded.base_price_pkr,
        commission_pct = excluded.commission_pct,
        has_markup = excluded.has_markup,
        customer_price_pkr = excluded.customer_price_pkr,
        status = 'proposed',
        decided_at = null,
        attempts = case when public.job_final_prices.status = 'declined'
                        then public.job_final_prices.attempts + 1
                        else public.job_final_prices.attempts end;

  perform public._notify (j.customer_id, 'final_price_proposed', j.id,
    jsonb_build_object ('job_title', j.title, 'amount', cust));
  return cust;
end;
$$;

revoke execute on function public.worker_set_final_price (uuid, numeric) from public, anon;
grant execute on function public.worker_set_final_price (uuid, numeric) to authenticated;

-- ─── 4) The customer answers ─────────────────────────────────────────────

create or replace function public.customer_respond_final_price (p_job_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  f public.job_final_prices%rowtype;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.customer_id is distinct from auth.uid () then
    raise exception 'only the customer can answer a final price';
  end if;
  select * into f from public.job_final_prices where job_id = p_job_id for update;
  if not found or f.status <> 'proposed' then
    raise exception 'there is no final price waiting for an answer';
  end if;
  if j.status not in ('assigned', 'completed') then
    raise exception 'the job is no longer open for a final price';
  end if;
  if p_accept is null then
    raise exception 'accept or decline';
  end if;

  update public.job_final_prices
    set status = case when p_accept then 'confirmed' else 'declined' end, decided_at = now ()
    where job_id = p_job_id;

  perform public._notify (f.worker_id,
    case when p_accept then 'final_price_confirmed' else 'final_price_declined' end, j.id,
    jsonb_build_object ('job_title', j.title, 'amount', f.base_price_pkr));
  return case when p_accept then 'confirmed' else 'declined' end;
end;
$$;

revoke execute on function public.customer_respond_final_price (uuid, boolean) from public, anon;
grant execute on function public.customer_respond_final_price (uuid, boolean) to authenticated;

-- ─── 5) What each side may see ───────────────────────────────────────────
-- amount_pkr is the viewer's own number (customer: the customer price; worker: their own price; admin: the customer
-- price). customer_price_pkr is what is paid in cash, which both sides need for the payment step.

create or replace function public.job_final_price (p_job_id uuid)
returns table (is_estimate boolean, status text, amount_pkr numeric, customer_price_pkr numeric, attempts int, viewer text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  f public.job_final_prices%rowtype;
  who text;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found then
    return;
  end if;
  if j.customer_id is not distinct from auth.uid () and auth.uid () is not null then
    who := 'customer';
  elsif j.worker_id is not distinct from auth.uid () and auth.uid () is not null then
    who := 'worker';
  elsif public._is_admin () then
    who := 'admin';
  else
    return;
  end if;

  select * into f from public.job_final_prices where job_id = p_job_id;
  is_estimate := exists (
    select 1 from public.quotes q where q.job_id = p_job_id and q.status = 'accepted' and q.price_type = 'estimate'
  );
  status := coalesce (f.status, 'none');
  amount_pkr := case when who = 'worker' then f.base_price_pkr else f.customer_price_pkr end;
  customer_price_pkr := f.customer_price_pkr;
  attempts := coalesce (f.attempts, 0);
  viewer := who;
  return next;
end;
$$;

revoke execute on function public.job_final_price (uuid) from public, anon;
grant execute on function public.job_final_price (uuid) to authenticated;

-- ─── 6) Paying an estimate job needs the confirmed price ─────────────────

create or replace function public.mark_job_paid (
  p_job_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  new_id uuid;
  agreed numeric;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'only the customer can mark a job as paid';
  end if;
  if j.status <> 'completed' then
    raise exception 'job must be completed before payment';
  end if;
  if j.worker_id is null then
    raise exception 'job has no worker';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;
  if p_method is distinct from 'cash' then
    raise exception 'only cash payments are supported';
  end if;

  if exists (select 1 from public.quotes q where q.job_id = p_job_id and q.status = 'accepted' and q.price_type = 'estimate') then
    select f.customer_price_pkr into agreed from public.job_final_prices f
      where f.job_id = p_job_id and f.status = 'confirmed';
    if agreed is null then
      raise exception 'agree the final price before paying';
    end if;
    if p_amount <> agreed then
      raise exception 'the amount must match the agreed final price (Rs %)', agreed;
    end if;
  end if;

  insert into public.payment_ledger (
    job_id, amount_pkr, payer_id, payee_id, method, status, note, worker_confirmed
  ) values (
    p_job_id, p_amount, j.customer_id, j.worker_id, 'cash', 'pending', p_note, false
  ) returning id into new_id;

  update public.jobs set status = 'payment_pending', updated_at = now () where id = p_job_id;
  return new_id;
end;
$$;

revoke execute on function public.mark_job_paid (uuid, numeric, text, text) from public, anon;
grant execute on function public.mark_job_paid (uuid, numeric, text, text) to authenticated;

-- ─── 7) Commission on close uses the confirmed final price ───────────────
-- A confirmed final price with a markup owes `customer price - X'`; everything else is as before
-- (accepted quote pricing row, else the old percent of the amount paid).

create or replace function public._job_commission (p_job_id uuid, p_amount numeric)
returns table (pct numeric, fee numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  qp record;
  fp record;
begin
  select f.customer_price_pkr as customer_price, f.base_price_pkr as base, f.commission_pct as fpct
    into fp
    from public.job_final_prices f
    where f.job_id = p_job_id and f.status = 'confirmed' and f.has_markup
    limit 1;
  if found then
    pct := fp.fpct;
    fee := least (p_amount, fp.customer_price - fp.base);
    return next;
    return;
  end if;

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
