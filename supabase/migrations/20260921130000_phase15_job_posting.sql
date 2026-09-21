-- Phase 15: job posting with quotes, guests allowed (flow C).
--
-- A customer (or a guest, with no account) posts a job. Approved workers see it
-- on a job board, ask questions in a thread, and send quotes (free, unlimited,
-- every quote logged). The customer accepts one quote, which assigns the worker
-- and continues into the normal lifecycle (contact reveal, cash payment, close).
--
-- D3  Guests may post; no phone/address is collected at posting.
-- D4  Contact details stay hidden until a worker is assigned. Job text and
--     thread messages that contain phone numbers or links are rejected.
-- D9  Guest jobs live behind a secret token and are only reachable through the
--     token-checked functions below, never through table access.
-- D11 Workers see full job details before quoting; quoting is free and tracked.
-- D14 Only approved workers can see the board, ask, and quote.
--
-- Everything is exposed as security-definer functions (no insert policies on
-- `jobs`), so the anonymous role cannot touch tables directly.
--
-- Not in this migration (see plan): phone OTP and SMS (no provider chosen; a
-- guest must sign in or register to accept a quote), photos, distance filtering
-- on the board (jobs have a city, not coordinates), per-IP guest rate limits
-- (this migration uses an overall hourly cap for guests instead).

-- ─── 1) Columns, tables, settings ────────────────────────────────────────

alter table public.jobs
  add column if not exists city text,
  add column if not exists budget_min_pkr numeric(12, 2) check (budget_min_pkr is null or budget_min_pkr >= 0),
  add column if not exists budget_max_pkr numeric(12, 2) check (budget_max_pkr is null or budget_max_pkr >= 0),
  add column if not exists expires_at timestamptz not null default (now () + interval '7 days');

create index if not exists idx_jobs_board
  on public.jobs (category, created_at desc)
  where origin = 'customer_job' and status in ('open', 'quoted');

-- Every quote a worker sends, kept for tracking (D11: unlimited but tracked).
create table if not exists public.quote_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  amount_pkr numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_events_worker_time on public.quote_events (worker_id, created_at desc);

alter table public.quote_events enable row level security;
revoke all on public.quote_events from anon, authenticated;

-- Pre-assignment conversation between one worker and the poster of a job.
-- Guests have no account, so a customer-side message records only its role.
create table if not exists public.job_thread_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('worker', 'customer')),
  body text not null check (char_length (body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_thread_job_worker on public.job_thread_messages (job_id, worker_id, created_at);

alter table public.job_thread_messages enable row level security;
revoke all on public.job_thread_messages from anon, authenticated;

insert into public.app_settings (key, value) values
  ('job_posting_enabled', 'false'::jsonb),
  ('job_post_daily_limit', '10'::jsonb),
  ('guest_job_hourly_cap', '30'::jsonb),
  ('job_expiry_days', '7'::jsonb)
on conflict (key) do nothing;

-- ─── 2) Helpers ──────────────────────────────────────────────────────────

create or replace function public._job_posting_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'job_posting_enabled'),
    false
  );
$$;

revoke all on function public._job_posting_enabled () from public, anon, authenticated;

-- True when the text looks like it contains a phone number or a link (D4/D21).
create or replace function public._contains_contact (p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce (
    regexp_replace (coalesce (p_text, ''), '[\s().+-]', '', 'g') ~ '[0-9]{7,}'
    or coalesce (p_text, '') ~* '(https?://|www\.|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|wa\.me|whats ?app)',
    false
  );
$$;

revoke all on function public._contains_contact (text) from public, anon, authenticated;

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
    where wp.user_id = p_uid and p.role = 'worker' and wp.approval_status = 'approved'
  );
$$;

revoke all on function public._is_approved_worker (uuid) from public, anon, authenticated;

create or replace function public._can_manage_job (j public.jobs, p_token uuid)
returns boolean
language sql
stable
as $$
  -- Must be a definite true/false: callers write `if not _can_manage_job(...)`, and NOT NULL is NULL,
  -- which would silently let everyone through (e.g. a signed-in stranger on a guest job with no owner).
  select coalesce (
    (auth.uid () is not null and j.customer_id = auth.uid ())
    or (p_token is not null and j.anon_post_token is not null and j.anon_post_token = p_token),
    false
  );
$$;

revoke all on function public._can_manage_job (public.jobs, uuid) from public, anon, authenticated;

-- ─── 3) Post a job (signed-in or guest) ──────────────────────────────────

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
    if not exists (select 1 from public.profiles p where p.id = uid and p.role = 'customer') then
      raise exception 'only customers can post jobs';
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

grant execute on function public.post_job (text, text, text, text, text, numeric, numeric, text) to anon, authenticated;

-- ─── 4) Guest / owner views ──────────────────────────────────────────────

create or replace function public.get_guest_job (p_token uuid)
returns table (
  id uuid, title text, description text, category text, status text, city text,
  location_text text, budget_min_pkr numeric, budget_max_pkr numeric,
  preferred_time text, expires_at timestamptz, created_at timestamptz,
  worker_id uuid, quote_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.title, j.description, j.category, j.status, j.city, j.location_text,
         j.budget_min_pkr, j.budget_max_pkr, j.preferred_time, j.expires_at, j.created_at,
         j.worker_id,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status in ('pending', 'accepted'))
  from public.jobs j
  where p_token is not null and j.anon_post_token = p_token
  limit 1;
$$;

grant execute on function public.get_guest_job (uuid) to anon, authenticated;

-- Quotes on a job, with what a customer needs to compare workers.
create or replace function public.job_quotes (p_job_id uuid, p_token uuid default null)
returns table (
  quote_id uuid, worker_id uuid, worker_name text, amount_pkr numeric, message text,
  status text, created_at timestamptz, avg_rating numeric, review_count int,
  is_verified boolean, years_experience int, photo_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found or not public._can_manage_job (j, p_token) then
    return;
  end if;
  return query
  select q.id, q.worker_id, p.display_name, q.amount_pkr, q.message, q.status, q.created_at,
         wp.avg_rating, wp.review_count, coalesce (wp.is_verified, false), wp.years_experience, wp.photo_url
  from public.quotes q
  join public.profiles p on p.id = q.worker_id
  left join public.worker_profiles wp on wp.user_id = q.worker_id
  where q.job_id = p_job_id and q.status in ('pending', 'accepted')
  order by q.amount_pkr asc, q.created_at asc;
end;
$$;

grant execute on function public.job_quotes (uuid, uuid) to anon, authenticated;

-- ─── 5) Job board for approved workers ───────────────────────────────────

create or replace function public.list_open_jobs (
  p_category text default null,
  p_city text default null,
  p_limit int default 30
)
returns table (
  id uuid, title text, description text, category text, city text, location_text text,
  budget_min_pkr numeric, budget_max_pkr numeric, preferred_time text,
  created_at timestamptz, expires_at timestamptz, quote_count bigint, my_quote_pkr numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cats text[];
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  select wp.categories into cats from public.worker_profiles wp where wp.user_id = auth.uid ();

  return query
  select j.id, j.title, j.description, j.category, j.city, j.location_text,
         j.budget_min_pkr, j.budget_max_pkr, j.preferred_time, j.created_at, j.expires_at,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status = 'pending'),
         (select q.amount_pkr from public.quotes q
            where q.job_id = j.id and q.worker_id = auth.uid () and q.status = 'pending'
            order by q.created_at desc limit 1)
  from public.jobs j
  where j.origin = 'customer_job'
    and j.status in ('open', 'quoted')
    and j.worker_id is null
    and (j.target_worker_id is null or j.target_worker_id = auth.uid ())
    and j.expires_at > now ()
    and j.category = any (coalesce (cats, '{}'))
    and (p_category is null or j.category = p_category)
    and (p_city is null or lower (j.city) = lower (p_city))
    and (j.customer_id is null or j.customer_id <> auth.uid ())
  order by j.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke execute on function public.list_open_jobs (text, text, int) from public, anon;
grant execute on function public.list_open_jobs (text, text, int) to authenticated;

create or replace function public.get_board_job (p_job_id uuid)
returns table (
  id uuid, title text, description text, category text, city text, location_text text,
  budget_min_pkr numeric, budget_max_pkr numeric, preferred_time text,
  created_at timestamptz, expires_at timestamptz, status text, quote_count bigint, my_quote_pkr numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cats text[];
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  select wp.categories into cats from public.worker_profiles wp where wp.user_id = auth.uid ();

  return query
  select j.id, j.title, j.description, j.category, j.city, j.location_text,
         j.budget_min_pkr, j.budget_max_pkr, j.preferred_time, j.created_at, j.expires_at, j.status,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status = 'pending'),
         (select q.amount_pkr from public.quotes q
            where q.job_id = j.id and q.worker_id = auth.uid () and q.status = 'pending'
            order by q.created_at desc limit 1)
  from public.jobs j
  where j.id = p_job_id
    and j.origin = 'customer_job'
    and j.status in ('open', 'quoted')
    and (j.target_worker_id is null or j.target_worker_id = auth.uid ())
    and j.category = any (coalesce (cats, '{}'));
end;
$$;

revoke execute on function public.get_board_job (uuid) from public, anon;
grant execute on function public.get_board_job (uuid) to authenticated;

-- ─── 6) Worker sends a quote ─────────────────────────────────────────────

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

  update public.quotes set status = 'rejected'
    where job_id = j.id and worker_id = auth.uid () and status = 'pending';
  insert into public.quotes (job_id, worker_id, amount_pkr, message)
  values (j.id, auth.uid (), p_amount_pkr, nullif (btrim (coalesce (p_message, '')), ''))
  returning id into qid;

  insert into public.quote_events (job_id, worker_id, amount_pkr) values (j.id, auth.uid (), p_amount_pkr);
  update public.jobs set status = 'quoted', updated_at = now () where id = j.id;
  return qid;
end;
$$;

revoke execute on function public.worker_quote_job (uuid, numeric, text) from public, anon;
grant execute on function public.worker_quote_job (uuid, numeric, text) to authenticated;

-- ─── 7) Thread between a worker and the poster (pre-assignment) ──────────

create or replace function public.post_thread_message (
  p_job_id uuid,
  p_worker_id uuid,
  p_body text,
  p_token uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  role_ text;
  body_ text := btrim (coalesce (p_body, ''));
begin
  if body_ = '' or char_length (body_) > 1000 then
    raise exception 'message must be 1 to 1000 characters';
  end if;
  if public._contains_contact (body_) then
    raise exception 'please do not share phone numbers or links; they are shown after a worker is assigned';
  end if;

  select * into j from public.jobs where id = p_job_id;
  if not found or j.origin <> 'customer_job' then
    raise exception 'job not found';
  end if;
  if j.status not in ('open', 'quoted') then
    raise exception 'this job is no longer open';
  end if;

  if public._can_manage_job (j, p_token) then
    role_ := 'customer';
    if not public._is_approved_worker (p_worker_id) then
      raise exception 'worker not found';
    end if;
  elsif auth.uid () = p_worker_id and public._is_approved_worker (auth.uid ())
        and (j.target_worker_id is null or j.target_worker_id = auth.uid ()) then
    role_ := 'worker';
  else
    raise exception 'not allowed';
  end if;

  insert into public.job_thread_messages (job_id, worker_id, sender_role, body)
  values (p_job_id, p_worker_id, role_, body_);

  if role_ = 'worker' then
    perform public._notify (j.customer_id, 'thread_message', j.id, jsonb_build_object ('job_title', j.title));
  else
    perform public._notify (p_worker_id, 'thread_message', j.id, jsonb_build_object ('job_title', j.title));
  end if;
end;
$$;

grant execute on function public.post_thread_message (uuid, uuid, text, uuid) to anon, authenticated;

create or replace function public.list_thread (p_job_id uuid, p_worker_id uuid, p_token uuid default null)
returns table (id uuid, sender_role text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select jj.* into j from public.jobs jj where jj.id = p_job_id;
  if not found then
    return;
  end if;
  if not (public._can_manage_job (j, p_token) or coalesce (auth.uid () = p_worker_id, false)) then
    return;
  end if;
  return query
  select m.id, m.sender_role, m.body, m.created_at
  from public.job_thread_messages m
  where m.job_id = p_job_id and m.worker_id = p_worker_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.list_thread (uuid, uuid, uuid) to anon, authenticated;

-- ─── 8) Accept a quote, claim a guest job, cancel, expire ────────────────

-- Signed-in customers only: a guest must sign in or register first (claim), which
-- is the "guest becomes a user" step. Works for any customer job, including
-- direct requests that expired and opened up.
create or replace function public.customer_accept_quote (p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  j public.jobs%rowtype;
begin
  if auth.uid () is null then
    raise exception 'sign in to accept a quote';
  end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'quote not found';
  end if;
  select * into j from public.jobs where id = q.job_id for update;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.origin <> 'customer_job' or j.status not in ('open', 'quoted') or j.worker_id is not null then
    raise exception 'job is no longer open';
  end if;
  if q.status <> 'pending' then
    raise exception 'quote is not pending';
  end if;

  update public.quotes set status = 'rejected' where job_id = j.id and id <> q.id and status = 'pending';
  update public.quotes set status = 'accepted' where id = q.id;
  update public.jobs
    set status = 'assigned', worker_id = q.worker_id, target_expires_at = null, updated_at = now ()
    where id = j.id;
end;
$$;

revoke execute on function public.customer_accept_quote (uuid) from public, anon;
grant execute on function public.customer_accept_quote (uuid) to authenticated;

-- Attach a guest job (and, by extension, its quotes and threads) to the signed-in customer.
create or replace function public.claim_guest_job (p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  jid uuid;
begin
  if uid is null then
    raise exception 'sign in to keep this job';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.role = 'customer') then
    raise exception 'only customers can claim a job';
  end if;
  update public.jobs
    set customer_id = uid, anon_post_token = null, posted_by_anon = false, updated_at = now ()
    where anon_post_token = p_token and posted_by_anon and customer_id is null
    returning id into jid;
  if jid is null then
    raise exception 'job not found or already claimed';
  end if;
  return jid;
end;
$$;

revoke execute on function public.claim_guest_job (uuid) from public, anon;
grant execute on function public.claim_guest_job (uuid) to authenticated;

create or replace function public.cancel_posted_job (p_job_id uuid, p_token uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or not public._can_manage_job (j, p_token) then
    raise exception 'not job owner';
  end if;
  if j.status not in ('open', 'quoted') then
    raise exception 'cannot cancel from this state';
  end if;
  update public.quotes set status = 'rejected' where job_id = j.id and status = 'pending';
  update public.jobs set status = 'cancelled', updated_at = now () where id = j.id;
end;
$$;

grant execute on function public.cancel_posted_job (uuid, uuid) to anon, authenticated;

create or replace function public.expire_posted_jobs ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.quotes q set status = 'rejected'
    from public.jobs j
    where q.job_id = j.id and q.status = 'pending'
      and j.origin = 'customer_job' and j.status in ('open', 'quoted')
      and j.worker_id is null and j.expires_at < now ();
  update public.jobs
    set status = 'cancelled', updated_at = now ()
    where origin = 'customer_job' and status in ('open', 'quoted')
      and worker_id is null and expires_at < now ();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_posted_jobs () from public, anon, authenticated;
grant execute on function public.expire_posted_jobs () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('expire-posted-jobs', '*/30 * * * *', 'select public.expire_posted_jobs ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;

-- ─── 9) Notification text for thread messages ────────────────────────────
-- Replaces the Phase 14 text function with the same cases plus `thread_message`.

create or replace function public._notification_text (p_kind text, p_lang text, p jsonb)
returns table (title text, body text)
language plpgsql
immutable
as $$
declare
  ur boolean := coalesce (p_lang, 'ur') <> 'en';
  job text := coalesce (p ->> 'job_title', '');
  amt text := coalesce (p ->> 'amount', '');
begin
  case p_kind
    when 'request_received' then
      title := case when ur then 'نئی درخواست' else 'New request' end;
      body  := case when ur then 'آپ کو ایک کام کی درخواست ملی: ' else 'You received a request: ' end || job;
    when 'quote_received' then
      title := case when ur then 'نئی قیمت' else 'New quote' end;
      body  := case when ur then 'کارکن نے قیمت بھیجی: روپے ' else 'A worker sent a quote: Rs ' end || amt || ' — ' || job;
    when 'thread_message' then
      title := case when ur then 'نیا پیغام' else 'New message' end;
      body  := case when ur then 'اس کام کے بارے میں نیا پیغام: ' else 'New message about: ' end || job;
    when 'job_assigned' then
      title := case when ur then 'کارکن نے قبول کر لیا' else 'A worker accepted' end;
      body  := case when ur then 'اپنا فون نمبر اور پتہ شامل کریں: ' else 'Add your phone number and address: ' end || job;
    when 'job_assigned_worker' then
      title := case when ur then 'کام آپ کو مل گیا' else 'You got the job' end;
      body  := case when ur then 'کسٹمر کی تفصیلات کا انتظار کریں: ' else 'Waiting for the customer''s details: ' end || job;
    when 'request_declined' then
      title := case when ur then 'درخواست مسترد' else 'Request declined' end;
      body  := case when ur then 'کارکن نے درخواست قبول نہیں کی: ' else 'The worker could not take: ' end || job;
    when 'request_cancelled' then
      title := case when ur then 'درخواست منسوخ' else 'Request cancelled' end;
      body  := case when ur then 'کسٹمر نے درخواست منسوخ کر دی: ' else 'The customer cancelled: ' end || job;
    when 'contact_shared' then
      title := case when ur then 'کسٹمر کی تفصیلات' else 'Customer details shared' end;
      body  := case when ur then 'اب آپ فون نمبر اور پتہ دیکھ سکتے ہیں: ' else 'You can now see the phone number and address: ' end || job;
    when 'job_completed' then
      title := case when ur then 'کام مکمل' else 'Work completed' end;
      body  := case when ur then 'نقد ادائیگی کریں اور ادا شدہ نشان زد کریں: ' else 'Pay in cash and mark as paid: ' end || job;
    when 'payment_marked' then
      title := case when ur then 'ادائیگی کی تصدیق کریں' else 'Confirm payment' end;
      body  := case when ur then 'کسٹمر نے ادا کرنے کا کہا ہے۔ رقم کی تصدیق کریں: ' else 'The customer says they paid. Confirm the amount: ' end || job;
    when 'job_closed' then
      title := case when ur then 'کام بند' else 'Job closed' end;
      body  := case when ur then 'ادائیگی کی تصدیق ہو گئی: ' else 'Payment confirmed: ' end || job;
    when 'job_disputed' then
      title := case when ur then 'ادائیگی میں مسئلہ' else 'Payment problem' end;
      body  := case when ur then 'براہ کرم استاد ہیلپ لائن پر کال کریں: ' else 'Please call the Ustad helpline: ' end || job;
    when 'application_received' then
      title := case when ur then 'نئی درخواست' else 'New application' end;
      body  := case when ur then 'آپ کی سروس کے لیے درخواست آئی: ' else 'Someone applied to your service: ' end || job;
    when 'application_accepted' then
      title := case when ur then 'درخواست قبول' else 'Application accepted' end;
      body  := case when ur then 'اپنی بکنگ کی تصدیق کریں: ' else 'Confirm your booking: ' end || job;
    when 'application_declined' then
      title := case when ur then 'درخواست مسترد' else 'Application declined' end;
      body  := case when ur then 'کارکن نے درخواست قبول نہیں کی: ' else 'The worker declined: ' end || job;
    else
      title := case when ur then 'استاد' else 'Ustad' end;
      body  := job;
  end case;
  return next;
end;
$$;

revoke all on function public._notification_text (text, text, jsonb) from public, anon, authenticated;

-- ─── 10) In-app help ─────────────────────────────────────────────────────

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'how-to-post-job-quotes',
    'getting-started',
    'How do I post a job and get quotes?',
    'میں کام کیسے پوسٹ کروں اور قیمتیں کیسے حاصل کروں؟',
    'Tap "Post a job", describe the work and your budget, and submit. You do not need an account to post. Approved workers nearby send you quotes, and you can ask them questions. To accept a quote you sign in or create an account. Phone numbers are shared only after you accept.',
    '"کام پوسٹ کریں" دبائیں، کام اور اپنا بجٹ لکھیں اور جمع کرائیں۔ پوسٹ کرنے کے لیے اکاؤنٹ ضروری نہیں۔ قریبی منظور شدہ کارکن آپ کو قیمتیں بھیجتے ہیں اور آپ ان سے سوال پوچھ سکتے ہیں۔ قیمت قبول کرنے کے لیے لاگ ان یا اکاؤنٹ بنائیں۔ فون نمبر قبول کرنے کے بعد ہی شیئر ہوتے ہیں۔',
    array['post', 'job', 'quote', 'guest', 'account']
  )
on conflict (slug) do nothing;
