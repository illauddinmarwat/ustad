-- Phase 13: contact reveal, cash payment, closing, disputes, admin job feed.
--
-- D4  Phone/address stay hidden until a worker accepts (job is `assigned` or later).
-- D7  Payment is cash: the customer marks paid, the worker confirms the amount
--     received, and only then is the job `closed`.
-- D6  Admin sees a feed of job events (accepted, payment pending, closed, disputed).
-- D13 Problems and mismatches point users to a helpline (number is a placeholder).
-- D22 Customer marked paid but worker never confirmed -> job becomes `disputed`.
--
-- Lifecycle: ... assigned -> completed -> payment_pending -> closed
--                                                       \-> disputed -> closed (admin)

-- ─── 1) Statuses and payment method ──────────────────────────────────────

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in (
    'open', 'quoted', 'pending_customer_confirm', 'assigned', 'completed',
    'payment_pending', 'disputed', 'closed', 'cancelled'
  )
);

alter table public.payment_ledger drop constraint if exists payment_ledger_method_check;
alter table public.payment_ledger add constraint payment_ledger_method_check check (
  method in ('manual', 'jazzcash', 'easypaisa', 'bank', 'cash')
);

-- Amount the worker says they received (compared with what the customer paid).
alter table public.payment_ledger
  add column if not exists received_amount_pkr numeric(12, 2) check (received_amount_pkr is null or received_amount_pkr >= 0);

insert into public.app_settings (key, value) values
  ('helpline_number', '"Coming soon"'::jsonb),
  ('payment_confirm_days', '3'::jsonb)
on conflict (key) do nothing;

-- ─── 2) Contact details (hidden until assigned) ──────────────────────────

create table if not exists public.job_contacts (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  customer_phone text not null,
  customer_address text not null,
  updated_at timestamptz not null default now()
);

alter table public.job_contacts enable row level security;
-- No policies: clients never read or write the table directly. All access goes
-- through the security-definer functions below, which enforce status and role.
revoke all on public.job_contacts from anon, authenticated;

-- Profiles are readable by every signed-in user, so phone and address must be
-- taken out of that public surface, not just hidden in the UI. Column-level
-- grants keep every other column exactly as before. Columns added to
-- `profiles` in future must be granted explicitly.
do $$
declare
  cols text;
begin
  select string_agg (quote_ident (column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in ('phone', 'address');

  execute 'revoke select on public.profiles from anon, authenticated';
  execute format ('grant select (%s) on public.profiles to authenticated', cols);
end
$$;

create or replace function public._is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin');
$$;

revoke all on function public._is_admin () from public, anon, authenticated;

-- The signed-in user's own saved phone/address, used to prefill the contact form.
create or replace function public.get_my_contact_defaults ()
returns table (phone text, address text)
language sql
stable
security definer
set search_path = public
as $$
  select p.phone, p.address from public.profiles p where p.id = auth.uid ();
$$;

revoke execute on function public.get_my_contact_defaults () from public, anon;
grant execute on function public.get_my_contact_defaults () to authenticated;

create or replace function public.customer_set_job_contact (
  p_job_id uuid,
  p_phone text,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  phone_clean text := btrim (coalesce (p_phone, ''));
  addr_clean text := btrim (coalesce (p_address, ''));
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.status not in ('assigned', 'completed', 'payment_pending') then
    raise exception 'contact details can be shared once a worker has accepted';
  end if;
  if phone_clean !~ '^[+0-9][0-9 ()-]{6,19}$' then
    raise exception 'invalid phone number';
  end if;
  if char_length (addr_clean) < 5 then
    raise exception 'address is required';
  end if;

  insert into public.job_contacts (job_id, customer_phone, customer_address)
  values (p_job_id, phone_clean, addr_clean)
  on conflict (job_id) do update
    set customer_phone = excluded.customer_phone,
        customer_address = excluded.customer_address,
        updated_at = now ();
end;
$$;

revoke execute on function public.customer_set_job_contact (uuid, text, text) from public, anon;
grant execute on function public.customer_set_job_contact (uuid, text, text) to authenticated;

-- Contact details for a job, only for its participants (and admin) and only once
-- a worker has accepted. The customer sees the worker's phone; the worker sees
-- the customer's phone and address once the customer has provided them.
create or replace function public.get_job_contacts (p_job_id uuid)
returns table (
  worker_phone text,
  customer_phone text,
  customer_address text,
  contact_shared boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  is_cust boolean;
  is_work boolean;
  is_adm boolean;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found then
    return;
  end if;
  is_cust := coalesce (j.customer_id = auth.uid (), false);
  is_work := coalesce (j.worker_id = auth.uid (), false);
  is_adm := public._is_admin ();
  if not (is_cust or is_work or is_adm) then
    return;
  end if;
  if j.status not in ('assigned', 'completed', 'payment_pending', 'disputed', 'closed') then
    return;
  end if;

  return query
  select
    case when is_cust or is_adm then (select p.phone from public.profiles p where p.id = j.worker_id) end,
    case when is_work or is_adm or is_cust then c.customer_phone end,
    case when is_work or is_adm or is_cust then c.customer_address end,
    (c.job_id is not null)
  from (select 1) x
  left join public.job_contacts c on c.job_id = j.id;
end;
$$;

revoke execute on function public.get_job_contacts (uuid) from public, anon;
grant execute on function public.get_job_contacts (uuid) to authenticated;

-- ─── 3) Nearby no longer returns phone numbers ───────────────────────────

drop function if exists public.nearby_workers (double precision, double precision, text, int);

create function public.nearby_workers (
  p_lat double precision,
  p_lng double precision,
  p_category text default null,
  p_limit int default 30
)
returns table (
  user_id uuid,
  display_name text,
  city text,
  bio text,
  categories text[],
  avg_rating numeric,
  review_count int,
  is_verified boolean,
  rate_pkr numeric,
  rate_unit text,
  years_experience int,
  photo_url text,
  distance_km double precision,
  is_available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.display_name,
    p.city,
    wp.bio,
    wp.categories,
    wp.avg_rating,
    wp.review_count,
    coalesce(wp.is_verified, false) as is_verified,
    wp.rate_pkr,
    wp.rate_unit,
    wp.years_experience,
    wp.photo_url,
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(p_lat)) * cos(radians(wp.lat)) * cos(radians(wp.lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(wp.lat))
      ))
    ) as distance_km,
    wp.is_available
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where p.role = 'worker'
    and wp.lat is not null
    and wp.lng is not null
    and wp.approval_status = 'approved'
    and (p_category is null or wp.categories @> array[p_category])
  order by wp.is_available desc, distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.nearby_workers (double precision, double precision, text, int) to anon, authenticated;

-- ─── 4) Admin job events feed (D6) ───────────────────────────────────────

create table if not exists public.admin_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('accepted', 'payment_pending', 'closed', 'disputed', 'dispute_resolved')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_job_events_time on public.admin_job_events (created_at desc);

alter table public.admin_job_events enable row level security;
revoke all on public.admin_job_events from anon, authenticated;

create or replace function public._job_status_event ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  k := case new.status
    when 'assigned' then 'accepted'
    when 'payment_pending' then 'payment_pending'
    when 'closed' then 'closed'
    when 'disputed' then 'disputed'
    else null
  end;
  if k is not null then
    insert into public.admin_job_events (job_id, kind, detail)
    values (new.id, k, jsonb_build_object ('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_status_event on public.jobs;
create trigger trg_job_status_event
  after update of status on public.jobs
  for each row execute function public._job_status_event ();

create or replace function public.admin_list_job_events (p_limit int default 50)
returns table (
  id uuid,
  job_id uuid,
  kind text,
  detail jsonb,
  created_at timestamptz,
  job_title text,
  job_status text,
  customer_name text,
  worker_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  return query
  select e.id, e.job_id, e.kind, e.detail, e.created_at,
         j.title, j.status, cp.display_name, wp.display_name
  from public.admin_job_events e
  join public.jobs j on j.id = e.job_id
  left join public.profiles cp on cp.id = j.customer_id
  left join public.profiles wp on wp.id = j.worker_id
  order by e.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.admin_list_job_events (int) from public, anon;
grant execute on function public.admin_list_job_events (int) to authenticated;

-- ─── 5) Payment: customer marks paid, worker confirms, job closes ────────

drop function if exists public.mark_job_paid (uuid, numeric, text, text);

create function public.mark_job_paid (
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
  pct numeric := 15;
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
    select coalesce (nullif ((s.value #>> '{}'), '')::numeric, 15) into pct
      from public.app_settings s where s.key = 'commission_rate_pct';
    pct := coalesce (pct, 15);
    update public.payment_ledger
      set status = 'paid', worker_confirmed = true, received_amount_pkr = p_received_amount,
          commission_pct = pct, fee_pkr = round (pay.amount_pkr * pct / 100, 2)
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

-- ─── 6) Unconfirmed payments become disputes (D22) ───────────────────────

create or replace function public.flag_unconfirmed_payments ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  days int;
  n int;
begin
  select coalesce (
    (select case when jsonb_typeof (s.value) = 'number' then (s.value #>> '{}')::int end
       from public.app_settings s where s.key = 'payment_confirm_days'),
    3
  ) into days;

  update public.payment_ledger l
    set status = 'disputed'
    from public.jobs j
    where l.job_id = j.id
      and j.status = 'payment_pending'
      and l.status = 'pending'
      and l.created_at < now () - make_interval (days => days);

  update public.jobs j
    set status = 'disputed', updated_at = now ()
    where j.status = 'payment_pending'
      and exists (
        select 1 from public.payment_ledger l
        where l.job_id = j.id and l.status = 'disputed'
      );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.flag_unconfirmed_payments () from public, anon, authenticated;
grant execute on function public.flag_unconfirmed_payments () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('flag-unconfirmed-payments', '15 * * * *', 'select public.flag_unconfirmed_payments ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;

-- Admin resolves a dispute after the helpline call: the job closes, the ledger
-- row is marked paid (money changed hands) or refunded, and the reason is kept.
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
  pct numeric;
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
    select coalesce (nullif ((s.value #>> '{}'), '')::numeric, 15) into pct
      from public.app_settings s where s.key = 'commission_rate_pct';
    pct := coalesce (pct, 15);
    update public.payment_ledger
      set status = 'paid', worker_confirmed = true, commission_pct = pct,
          fee_pkr = round (pay.amount_pkr * pct / 100, 2),
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

-- ─── 7) In-app help ──────────────────────────────────────────────────────

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'when-is-my-number-shared',
    'privacy',
    'When is my phone number shared?',
    'میرا فون نمبر کب شیئر ہوتا ہے؟',
    'Never before a worker accepts your job. After acceptance you add your phone number and address, and only then do you and the worker see each other''s contact details.',
    'کارکن کے آپ کا کام قبول کرنے سے پہلے آپ کا نمبر کبھی شیئر نہیں ہوتا۔ قبولیت کے بعد آپ اپنا فون نمبر اور پتہ شامل کرتے ہیں، اور تب ہی آپ اور کارکن ایک دوسرے کی تفصیلات دیکھتے ہیں۔',
    array['phone', 'number', 'privacy', 'contact', 'address']
  ),
  (
    'how-payment-works',
    'payments',
    'How does payment work?',
    'ادائیگی کیسے ہوتی ہے؟',
    'Payment is in cash directly to the worker. After the work is done, mark the job as paid. The worker then confirms the amount they received and the job closes. If the amounts differ or the worker does not confirm, call the Ustad helpline.',
    'ادائیگی نقد براہ راست کارکن کو ہوتی ہے۔ کام مکمل ہونے کے بعد کام کو ادا شدہ نشان زد کریں۔ پھر کارکن وصول شدہ رقم کی تصدیق کرتا ہے اور کام بند ہو جاتا ہے۔ اگر رقم مختلف ہو یا کارکن تصدیق نہ کرے تو استاد ہیلپ لائن پر کال کریں۔',
    array['payment', 'cash', 'pay', 'paid', 'close', 'dispute', 'helpline']
  )
on conflict (slug) do nothing;
