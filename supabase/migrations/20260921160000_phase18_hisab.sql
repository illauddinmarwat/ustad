-- Phase 18: worker Hisab (commission ledger), admin settings audit, overdue
-- handling, and admin reporting / moderation.
--
-- Payment is cash, paid straight to the worker, so the platform has to track
-- what each worker owes it. When a job's payment is confirmed (`paid`), one
-- commission row is created for that job: order value x the commission percent
-- in force at that moment (snapshotted), due `commission_due_days` later.
-- Overdue rows warn the worker and, after `commission_deactivate_days`, suspend
-- the account until the balance is settled or waived.
--
-- Assumptions used until you decide otherwise (all editable in admin settings):
--   * commission is 15% of the amount the worker confirmed receiving,
--   * due 7 days after the job closes, warning 7 days after the due date,
--     deactivation 14 days after the due date,
--   * workers settle with the platform by any method the admin records.

-- ─── 1) Settings and audit ───────────────────────────────────────────────

insert into public.app_settings (key, value) values
  ('commission_due_days', '7'::jsonb),
  ('commission_warn_days', '7'::jsonb),
  ('commission_deactivate_days', '14'::jsonb)
on conflict (key) do nothing;

create table if not exists public.app_setting_audit (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists idx_app_setting_audit_time on public.app_setting_audit (changed_at desc);

alter table public.app_setting_audit enable row level security;
revoke all on public.app_setting_audit from anon, authenticated;

create or replace function public._audit_app_setting ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_setting_audit (key, old_value, new_value, changed_by)
    values (new.key, null, new.value, auth.uid ());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.value is distinct from old.value then
      insert into public.app_setting_audit (key, old_value, new_value, changed_by)
      values (new.key, old.value, new.value, auth.uid ());
    end if;
    return new;
  else
    insert into public.app_setting_audit (key, old_value, new_value, changed_by)
    values (old.key, old.value, null, auth.uid ());
    return old;
  end if;
end;
$$;

drop trigger if exists trg_audit_app_setting on public.app_settings;
create trigger trg_audit_app_setting
  after insert or update or delete on public.app_settings
  for each row execute function public._audit_app_setting ();

create or replace function public.admin_list_setting_audit (p_limit int default 50)
returns table (id uuid, key text, old_value jsonb, new_value jsonb, changed_by_name text, changed_at timestamptz)
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
  select a.id, a.key, a.old_value, a.new_value, p.display_name, a.changed_at
  from public.app_setting_audit a
  left join public.profiles p on p.id = a.changed_by
  order by a.changed_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.admin_list_setting_audit (int) from public, anon;
grant execute on function public.admin_list_setting_audit (int) to authenticated;

-- ─── 2) Ledger tables ────────────────────────────────────────────────────

alter table public.worker_profiles
  add column if not exists commission_suspended boolean not null default false;

create table if not exists public.worker_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete restrict,
  job_id uuid not null references public.jobs (id) on delete restrict,
  payment_id uuid references public.payment_ledger (id) on delete set null,
  order_amount_pkr numeric(12, 2) not null check (order_amount_pkr >= 0),
  commission_pct numeric(5, 2) not null,
  commission_pkr numeric(12, 2) not null check (commission_pkr >= 0),
  due_date date not null,
  status text not null default 'due' check (status in ('due', 'paid', 'overdue', 'waived')),
  warned_at timestamptz,
  settled_at timestamptz,
  settlement_method text,
  settlement_ref text,
  note text,
  created_at timestamptz not null default now(),
  unique (job_id)
);

create index if not exists idx_commission_worker_status on public.worker_commission_ledger (worker_id, status);
create index if not exists idx_commission_due on public.worker_commission_ledger (due_date) where status in ('due', 'overdue');

alter table public.worker_commission_ledger enable row level security;
revoke all on public.worker_commission_ledger from anon, authenticated;
grant select on public.worker_commission_ledger to authenticated;

drop policy if exists "commission_select_own" on public.worker_commission_ledger;
create policy "commission_select_own"
  on public.worker_commission_ledger for select
  to authenticated
  using (worker_id = auth.uid ());

-- Append-only history of everything that happens to a commission row or a worker's standing.
create table if not exists public.commission_events (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid references public.worker_commission_ledger (id) on delete set null,
  worker_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null check (kind in ('created', 'overdue', 'warned', 'settled', 'waived', 'deactivated', 'reactivated')),
  amount_pkr numeric(12, 2),
  method text,
  ref text,
  note text,
  by_user uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_commission_events_worker on public.commission_events (worker_id, created_at desc);

alter table public.commission_events enable row level security;
revoke all on public.commission_events from anon, authenticated;

-- ─── 3) Notification text for these events ───────────────────────────────

create or replace function public._notification_text_hisab (p_kind text, p_lang text, p jsonb)
returns table (title text, body text)
language plpgsql
immutable
as $$
declare
  ur boolean := coalesce (p_lang, 'ur') <> 'en';
  amt text := coalesce (p ->> 'amount', '');
  due text := coalesce (p ->> 'due', '');
  days text := coalesce (p ->> 'days', '');
begin
  case p_kind
    when 'commission_created' then
      title := case when ur then 'کمیشن واجب الادا' else 'Commission due' end;
      body  := case when ur then 'استاد کو روپے ' || amt || ' ادا کرنے ہیں، آخری تاریخ ' || due
               else 'Please pay Rs ' || amt || ' to Ustad by ' || due end;
    when 'commission_overdue' then
      title := case when ur then 'کمیشن کی مدت گزر گئی' else 'Commission overdue' end;
      body  := case when ur then 'روپے ' || amt || ' کی ادائیگی باقی ہے۔ براہ کرم جلد ادا کریں۔'
               else 'Rs ' || amt || ' is overdue. Please pay as soon as you can.' end;
    when 'commission_warning' then
      title := case when ur then 'اکاؤنٹ بند ہونے کا انتباہ' else 'Account warning' end;
      body  := case when ur then 'روپے ' || amt || ' باقی ہیں۔ ' || days || ' دن میں ادا نہ ہوئے تو اکاؤنٹ بند ہو جائے گا۔'
               else 'Rs ' || amt || ' is still unpaid. Your account will be deactivated in ' || days || ' days if it is not settled.' end;
    when 'account_deactivated' then
      title := case when ur then 'اکاؤنٹ بند' else 'Account deactivated' end;
      body  := case when ur then 'بقایا کمیشن کی وجہ سے اکاؤنٹ بند ہے۔ روپے ' || amt || ' ادا کر کے دوبارہ کھولیں۔'
               else 'Your account is deactivated because of unpaid commission. Settle Rs ' || amt || ' to reopen it.' end;
    when 'account_reactivated' then
      title := case when ur then 'اکاؤنٹ بحال' else 'Account reactivated' end;
      body  := case when ur then 'بقایا ادا ہو گیا۔ آپ دوبارہ کام لے سکتے ہیں۔' else 'Your balance is settled. You can take jobs again.' end;
    else
      return;
  end case;
  return next;
end;
$$;

revoke all on function public._notification_text_hisab (text, text, jsonb) from public, anon, authenticated;

-- `_notify` now asks the Hisab texts first, then the general ones.
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

-- ─── 4) Create a commission row when a payment is confirmed ──────────────

create or replace function public._create_commission_row ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  due_days int := public._direct_request_setting_int ('commission_due_days', 7);
  due date := current_date + due_days;
  jt text;
begin
  if new.status <> 'paid' or (tg_op = 'UPDATE' and old.status is not distinct from 'paid') then
    return new;
  end if;
  if coalesce (new.fee_pkr, 0) <= 0 then
    return new; -- nothing owed (e.g. commission set to 0%)
  end if;

  insert into public.worker_commission_ledger (
    worker_id, job_id, payment_id, order_amount_pkr, commission_pct, commission_pkr, due_date
  ) values (
    new.payee_id, new.job_id, new.id, new.amount_pkr, coalesce (new.commission_pct, 0), new.fee_pkr, due
  ) on conflict (job_id) do nothing;

  if found then
    insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr)
      select l.id, l.worker_id, 'created', l.commission_pkr
      from public.worker_commission_ledger l where l.job_id = new.job_id;
    select title into jt from public.jobs where id = new.job_id;
    perform public._notify (
      new.payee_id, 'commission_created', new.job_id,
      jsonb_build_object ('job_title', coalesce (jt, ''), 'amount', new.fee_pkr, 'due', to_char (due, 'DD Mon YYYY'))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_commission_row on public.payment_ledger;
create trigger trg_create_commission_row
  after insert or update of status on public.payment_ledger
  for each row execute function public._create_commission_row ();

-- ─── 5) Overdue, warnings, deactivation, reactivation ────────────────────

create or replace function public._worker_active (p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce ((select p.status = 'active' from public.profiles p where p.id = p_uid), false);
$$;

grant execute on function public._worker_active (uuid) to anon, authenticated;

-- Re-opens an account that was deactivated for commission once nothing is overdue.
create or replace function public._reactivate_if_clear (p_worker uuid, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.worker_profiles wp where wp.user_id = p_worker and wp.commission_suspended) then
    return false;
  end if;
  if exists (select 1 from public.worker_commission_ledger l where l.worker_id = p_worker and l.status = 'overdue') then
    return false;
  end if;
  update public.profiles set status = 'active', updated_at = now () where id = p_worker and status = 'suspended';
  update public.worker_profiles set commission_suspended = false where user_id = p_worker;
  insert into public.commission_events (worker_id, kind, by_user) values (p_worker, 'reactivated', p_by);
  perform public._notify (p_worker, 'account_reactivated', null, '{}'::jsonb);
  return true;
end;
$$;

revoke all on function public._reactivate_if_clear (uuid, uuid) from public, anon, authenticated;

create or replace function public.mark_overdue_commissions ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  warn_days int := public._direct_request_setting_int ('commission_warn_days', 7);
  cut_days int := public._direct_request_setting_int ('commission_deactivate_days', 14);
  r record;
  changed int := 0;
begin
  -- 1) due -> overdue
  for r in
    with moved as (
      update public.worker_commission_ledger
        set status = 'overdue'
        where status = 'due' and due_date < current_date
        returning id, worker_id, commission_pkr
    ), ev as (
      insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr)
      select id, worker_id, 'overdue', commission_pkr from moved
      returning worker_id
    )
    select worker_id, count (*) as n, sum (commission_pkr) as total from moved group by worker_id
  loop
    changed := changed + r.n;
    perform public._notify (r.worker_id, 'commission_overdue', null, jsonb_build_object ('amount', r.total));
  end loop;

  -- 2) one warning per row once it is warn_days past due
  for r in
    with warned as (
      update public.worker_commission_ledger
        set warned_at = now ()
        where status = 'overdue' and warned_at is null and current_date - due_date >= warn_days
        returning id, worker_id, commission_pkr
    ), ev as (
      insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr)
      select id, worker_id, 'warned', commission_pkr from warned
      returning worker_id
    )
    select worker_id, sum (commission_pkr) as total from warned group by worker_id
  loop
    perform public._notify (
      r.worker_id, 'commission_warning', null,
      jsonb_build_object ('amount', r.total, 'days', greatest (cut_days - warn_days, 1))
    );
  end loop;

  -- 3) deactivate accounts with a row this far past due
  for r in
    select l.worker_id, sum (l.commission_pkr) as total
    from public.worker_commission_ledger l
    join public.profiles p on p.id = l.worker_id and p.status = 'active'
    where l.status = 'overdue'
    group by l.worker_id
    having max (current_date - l.due_date) >= cut_days
  loop
    update public.profiles set status = 'suspended', updated_at = now () where id = r.worker_id;
    update public.worker_profiles set commission_suspended = true where user_id = r.worker_id;
    insert into public.commission_events (worker_id, kind, amount_pkr, note)
    values (r.worker_id, 'deactivated', r.total, 'Overdue commission');
    perform public._notify (r.worker_id, 'account_deactivated', null, jsonb_build_object ('amount', r.total));
    changed := changed + 1;
  end loop;

  return changed;
end;
$$;

revoke all on function public.mark_overdue_commissions () from public, anon, authenticated;
grant execute on function public.mark_overdue_commissions () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('mark-overdue-commissions', '10 0 * * *', 'select public.mark_overdue_commissions ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;

-- ─── 6) Deactivated workers are hidden and cannot act ────────────────────

create or replace function public._is_approved_worker (p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1
    from public.worker_profiles wp
    join public.profiles p on p.id = wp.user_id
    where wp.user_id = p_uid and p.role = 'worker' and wp.approval_status = 'approved' and p.status = 'active'
  );
$$;

revoke all on function public._is_approved_worker (uuid) from public, anon, authenticated;

create or replace function public._targeted_open_job (p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if j.target_worker_id is distinct from auth.uid () then
    raise exception 'not your request';
  end if;
  if j.status not in ('open', 'quoted') or j.worker_id is not null then
    raise exception 'request is no longer open';
  end if;
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'worker not approved';
  end if;
  return j;
end;
$$;

revoke all on function public._targeted_open_job (uuid) from public, anon, authenticated;

create or replace function public.nearby_workers (
  p_lat double precision,
  p_lng double precision,
  p_category text default null,
  p_limit int default 30
)
returns table (
  user_id uuid, display_name text, city text, bio text, categories text[], avg_rating numeric,
  review_count int, is_verified boolean, rate_pkr numeric, rate_unit text, years_experience int,
  photo_url text, distance_km double precision, is_available boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id, p.display_name, p.city, wp.bio, wp.categories, wp.avg_rating, wp.review_count,
    coalesce(wp.is_verified, false) as is_verified, wp.rate_pkr, wp.rate_unit, wp.years_experience, wp.photo_url,
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
    and p.status = 'active'
    and wp.lat is not null
    and wp.lng is not null
    and wp.approval_status = 'approved'
    and (p_category is null or wp.categories @> array[p_category])
  order by wp.is_available desc, distance_km asc
  limit greatest(1, least(p_limit, 100));
$$;

drop policy if exists "listings_public_read_active" on public.worker_service_listings;
create policy "listings_public_read_active"
  on public.worker_service_listings for select
  to anon, authenticated
  using ((status = 'active' and public._worker_active (worker_id)) or worker_id = auth.uid ());

-- Suspended customers cannot post jobs. Same as before plus an active-account check.
create or replace function public.post_job (
  p_title text,
  p_description text,
  p_category text,
  p_city text default null,
  p_location_text text default null,
  p_budget_min numeric default null,
  p_budget_max numeric default null,
  p_preferred_time text default null
)
returns table (job_id uuid, guest_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  new_id uuid;
  tok uuid;
  n int;
  expiry_days int;
begin
  if not public._job_posting_enabled () then
    raise exception 'job posting is not enabled';
  end if;
  if coalesce (btrim (p_title), '') = '' or char_length (btrim (p_title)) > 120 then
    raise exception 'a title of up to 120 characters is required';
  end if;
  if char_length (btrim (coalesce (p_description, ''))) < 10 then
    raise exception 'please describe the job (at least 10 characters)';
  end if;
  if coalesce (btrim (p_category), '') = '' then
    raise exception 'category is required';
  end if;
  if public._contains_contact (p_title) or public._contains_contact (p_description)
     or public._contains_contact (p_location_text) or public._contains_contact (p_preferred_time) then
    raise exception 'please do not include phone numbers or links; they are shared after a worker accepts';
  end if;
  if p_budget_min is not null and p_budget_max is not null and p_budget_min > p_budget_max then
    raise exception 'minimum budget cannot be above maximum budget';
  end if;

  if uid is not null then
    if not exists (select 1 from public.profiles p where p.id = uid and p.role = 'customer' and p.status = 'active') then
      raise exception 'only active customers can post jobs';
    end if;
    select count (*) into n from public.jobs j
      where j.customer_id = uid and j.target_worker_id is null and j.created_at > now () - interval '1 day';
    if n >= public._direct_request_setting_int ('job_post_daily_limit', 10) then
      raise exception 'daily job limit reached';
    end if;
  else
    select count (*) into n from public.jobs j
      where j.posted_by_anon and j.created_at > now () - interval '1 hour';
    if n >= public._direct_request_setting_int ('guest_job_hourly_cap', 30) then
      raise exception 'too many guest jobs right now, please sign in or try later';
    end if;
    tok := gen_random_uuid ();
  end if;

  expiry_days := public._direct_request_setting_int ('job_expiry_days', 7);

  insert into public.jobs (
    customer_id, title, description, category, status, origin, city, location_text,
    budget_min_pkr, budget_max_pkr, preferred_time, expires_at, posted_by_anon, anon_post_token
  ) values (
    uid, btrim (p_title), btrim (p_description), p_category, 'open', 'customer_job',
    nullif (btrim (coalesce (p_city, '')), ''), nullif (btrim (coalesce (p_location_text, '')), ''),
    p_budget_min, p_budget_max, nullif (btrim (coalesce (p_preferred_time, '')), ''),
    now () + make_interval (days => expiry_days), uid is null, tok
  ) returning id into new_id;

  return query select new_id, tok;
end;
$$;

-- ─── 7) Worker views ─────────────────────────────────────────────────────

create or replace function public.get_my_commission_summary ()
returns table (
  outstanding_pkr numeric,
  overdue_pkr numeric,
  next_due_date date,
  overdue_count bigint,
  account_deactivated boolean,
  deactivate_after_days int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  return query
  select
    coalesce (sum (l.commission_pkr) filter (where l.status in ('due', 'overdue')), 0),
    coalesce (sum (l.commission_pkr) filter (where l.status = 'overdue'), 0),
    min (l.due_date) filter (where l.status in ('due', 'overdue')),
    count (*) filter (where l.status = 'overdue'),
    coalesce ((select wp.commission_suspended from public.worker_profiles wp where wp.user_id = auth.uid ()), false),
    public._direct_request_setting_int ('commission_deactivate_days', 14)
  from public.worker_commission_ledger l
  where l.worker_id = auth.uid ();
end;
$$;

revoke execute on function public.get_my_commission_summary () from public, anon;
grant execute on function public.get_my_commission_summary () to authenticated;

create or replace function public.list_my_commissions (p_limit int default 50)
returns table (
  id uuid, job_id uuid, job_title text, order_amount_pkr numeric, commission_pct numeric,
  commission_pkr numeric, due_date date, ledger_status text, settled_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  return query
  select l.id, l.job_id, j.title, l.order_amount_pkr, l.commission_pct, l.commission_pkr,
         l.due_date, l.status, l.settled_at, l.created_at
  from public.worker_commission_ledger l
  join public.jobs j on j.id = l.job_id
  where l.worker_id = auth.uid ()
  order by l.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke execute on function public.list_my_commissions (int) from public, anon;
grant execute on function public.list_my_commissions (int) to authenticated;

-- ─── 8) Admin: balances, rows, settle, waive ─────────────────────────────

create or replace function public.admin_commission_balances (p_limit int default 100)
returns table (
  worker_id uuid,
  worker_name text,
  city text,
  outstanding_pkr numeric,
  not_yet_due_pkr numeric,
  overdue_1_7_pkr numeric,
  overdue_8_30_pkr numeric,
  overdue_30_plus_pkr numeric,
  oldest_due_date date,
  account_deactivated boolean
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
  select l.worker_id, p.display_name, p.city,
         coalesce (sum (l.commission_pkr) filter (where l.status in ('due', 'overdue')), 0),
         coalesce (sum (l.commission_pkr) filter (where l.status = 'due'), 0),
         coalesce (sum (l.commission_pkr) filter (where l.status = 'overdue' and current_date - l.due_date between 1 and 7), 0),
         coalesce (sum (l.commission_pkr) filter (where l.status = 'overdue' and current_date - l.due_date between 8 and 30), 0),
         coalesce (sum (l.commission_pkr) filter (where l.status = 'overdue' and current_date - l.due_date > 30), 0),
         min (l.due_date) filter (where l.status in ('due', 'overdue')),
         coalesce (bool_or (wp.commission_suspended), false)
  from public.worker_commission_ledger l
  join public.profiles p on p.id = l.worker_id
  left join public.worker_profiles wp on wp.user_id = l.worker_id
  group by l.worker_id, p.display_name, p.city
  having coalesce (sum (l.commission_pkr) filter (where l.status in ('due', 'overdue')), 0) > 0
      or coalesce (bool_or (wp.commission_suspended), false)
  order by 5 desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.admin_commission_balances (int) from public, anon;
grant execute on function public.admin_commission_balances (int) to authenticated;

create or replace function public.admin_list_commissions (
  p_worker_id uuid default null,
  p_status text default null,
  p_limit int default 200
)
returns table (
  id uuid, worker_id uuid, worker_name text, job_id uuid, job_title text, order_amount_pkr numeric,
  commission_pct numeric, commission_pkr numeric, due_date date, ledger_status text,
  settled_at timestamptz, settlement_method text, settlement_ref text, note text, created_at timestamptz
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
  select l.id, l.worker_id, p.display_name, l.job_id, j.title, l.order_amount_pkr, l.commission_pct,
         l.commission_pkr, l.due_date, l.status, l.settled_at, l.settlement_method, l.settlement_ref,
         l.note, l.created_at
  from public.worker_commission_ledger l
  join public.profiles p on p.id = l.worker_id
  join public.jobs j on j.id = l.job_id
  where (p_worker_id is null or l.worker_id = p_worker_id)
    and (p_status is null or l.status = p_status)
  order by l.created_at desc
  limit greatest(1, least(p_limit, 500));
end;
$$;

revoke execute on function public.admin_list_commissions (uuid, text, int) from public, anon;
grant execute on function public.admin_list_commissions (uuid, text, int) to authenticated;

create or replace function public.admin_record_commission_settlement (
  p_ledger_id uuid,
  p_method text,
  p_ref text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.worker_commission_ledger%rowtype;
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  if coalesce (btrim (p_method), '') = '' then
    raise exception 'settlement method is required';
  end if;
  select * into l from public.worker_commission_ledger where id = p_ledger_id for update;
  if not found then
    raise exception 'commission not found';
  end if;
  if l.status not in ('due', 'overdue') then
    raise exception 'commission is already %', l.status;
  end if;

  update public.worker_commission_ledger
    set status = 'paid', settled_at = now (), settlement_method = btrim (p_method),
        settlement_ref = nullif (btrim (coalesce (p_ref, '')), ''), note = nullif (btrim (coalesce (p_note, '')), '')
    where id = p_ledger_id;
  insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr, method, ref, note, by_user)
  values (l.id, l.worker_id, 'settled', l.commission_pkr, btrim (p_method), nullif (btrim (coalesce (p_ref, '')), ''),
          nullif (btrim (coalesce (p_note, '')), ''), auth.uid ());
  perform public._reactivate_if_clear (l.worker_id, auth.uid ());
end;
$$;

revoke execute on function public.admin_record_commission_settlement (uuid, text, text, text) from public, anon;
grant execute on function public.admin_record_commission_settlement (uuid, text, text, text) to authenticated;

create or replace function public.admin_waive_commission (p_ledger_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.worker_commission_ledger%rowtype;
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  if coalesce (btrim (p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;
  select * into l from public.worker_commission_ledger where id = p_ledger_id for update;
  if not found then
    raise exception 'commission not found';
  end if;
  if l.status not in ('due', 'overdue') then
    raise exception 'commission is already %', l.status;
  end if;

  update public.worker_commission_ledger set status = 'waived', note = btrim (p_reason) where id = p_ledger_id;
  insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr, note, by_user)
  values (l.id, l.worker_id, 'waived', l.commission_pkr, btrim (p_reason), auth.uid ());
  perform public._reactivate_if_clear (l.worker_id, auth.uid ());
end;
$$;

revoke execute on function public.admin_waive_commission (uuid, text) from public, anon;
grant execute on function public.admin_waive_commission (uuid, text) to authenticated;

-- ─── 9) Admin: funnel and moderation ─────────────────────────────────────

alter table public.admin_job_events drop constraint if exists admin_job_events_kind_check;
alter table public.admin_job_events add constraint admin_job_events_kind_check check (
  kind in ('accepted', 'payment_pending', 'closed', 'disputed', 'dispute_resolved', 'moderated')
);

-- Jobs by flow: service (a listing), direct (sent to one worker), posted (open job with quotes).
create or replace function public.admin_jobs_funnel (p_days int default 30)
returns table (
  flow text, created bigint, assigned_or_later bigint, work_done bigint, closed bigint, cancelled bigint
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
  select f.flow,
         count (*),
         count (*) filter (where j.status in ('assigned', 'completed', 'payment_pending', 'disputed', 'closed')),
         count (*) filter (where j.status in ('completed', 'payment_pending', 'disputed', 'closed')),
         count (*) filter (where j.status = 'closed'),
         count (*) filter (where j.status = 'cancelled')
  from public.jobs j
  cross join lateral (
    select case
      when j.origin = 'service_listing' then 'service'
      when j.target_worker_id is not null then 'direct'
      else 'posted'
    end as flow
  ) f
  where j.created_at > now () - make_interval (days => greatest (p_days, 1))
  group by f.flow
  order by f.flow;
end;
$$;

revoke execute on function public.admin_jobs_funnel (int) from public, anon;
grant execute on function public.admin_jobs_funnel (int) to authenticated;

create or replace function public.admin_list_posted_jobs (p_limit int default 100)
returns table (
  id uuid, title text, description text, category text, city text, job_status text, is_guest boolean,
  quote_count bigint, created_at timestamptz, expires_at timestamptz, customer_name text
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
  select j.id, j.title, j.description, j.category, j.city, j.status, j.posted_by_anon,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status = 'pending'),
         j.created_at, j.expires_at, cp.display_name
  from public.jobs j
  left join public.profiles cp on cp.id = j.customer_id
  where j.origin = 'customer_job' and j.status in ('open', 'quoted')
  order by j.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

revoke execute on function public.admin_list_posted_jobs (int) from public, anon;
grant execute on function public.admin_list_posted_jobs (int) to authenticated;

create or replace function public.admin_close_posted_job (p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  if coalesce (btrim (p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.origin <> 'customer_job' or j.status not in ('open', 'quoted') then
    raise exception 'job is not an open posted job';
  end if;
  update public.quotes set status = 'rejected' where job_id = j.id and status = 'pending';
  update public.jobs set status = 'cancelled', updated_at = now () where id = j.id;
  insert into public.admin_job_events (job_id, kind, detail)
  values (j.id, 'moderated', jsonb_build_object ('reason', btrim (p_reason), 'by', auth.uid ()));
end;
$$;

revoke execute on function public.admin_close_posted_job (uuid, text) from public, anon;
grant execute on function public.admin_close_posted_job (uuid, text) to authenticated;

-- ─── 10) In-app help ─────────────────────────────────────────────────────

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'how-commission-works',
    'payments',
    'What do I owe Ustad, and when?',
    'مجھے استاد کو کیا اور کب ادا کرنا ہے؟',
    'Customers pay you in cash. When a job is closed, Ustad''s commission on that job is added to your balance, with a due date shown in your Account. Pay it by the due date. If it is more than a week late you get a warning, and if it stays unpaid your account is deactivated until you settle it.',
    'کسٹمر آپ کو نقد ادائیگی کرتے ہیں۔ کام بند ہونے پر اس کام کا استاد کا کمیشن آپ کے حساب میں شامل ہو جاتا ہے، اور آخری تاریخ آپ کے اکاؤنٹ میں نظر آتی ہے۔ آخری تاریخ تک ادا کریں۔ ایک ہفتہ سے زیادہ دیر ہو تو انتباہ ملتا ہے، اور ادا نہ ہو تو اکاؤنٹ بند ہو جاتا ہے۔',
    array['commission', 'owe', 'pay', 'due', 'overdue', 'deactivated', 'hisab']
  )
on conflict (slug) do nothing;
