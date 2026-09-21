-- Phase 12: direct requests (customer -> one chosen worker from Nearby).
--
-- A direct request is a `customer_job` in `public.jobs` with `target_worker_id`
-- set (decision D1: one mechanism shared with the later job-posting flow).
-- Pricing is hybrid (D2): the customer may state a budget; the worker either
-- accepts it as-is or sends a different quote (`public.quotes`).
--
-- Additive only: no drops of existing tables/policies except the select policy
-- on jobs, which is recreated to also expose targeted requests to their worker.
-- Contact details are NOT part of a request (D4); they arrive in Phase 2.

-- ─── 1) Columns ──────────────────────────────────────────────────────────

alter table public.jobs
  add column if not exists target_worker_id uuid references public.profiles (id) on delete set null,
  add column if not exists target_expires_at timestamptz,
  add column if not exists budget_pkr numeric(12, 2) check (budget_pkr is null or budget_pkr >= 0),
  add column if not exists preferred_time text;

create index if not exists idx_jobs_target_worker
  on public.jobs (target_worker_id)
  where target_worker_id is not null;

-- Worker availability (D23). Existing workers stay available.
alter table public.worker_profiles
  add column if not exists is_available boolean not null default true;

-- ─── 2) Settings / feature flag (D16, D17) ───────────────────────────────

insert into public.app_settings (key, value) values
  ('direct_requests_enabled', 'false'::jsonb),
  ('direct_request_timeout_hours', '2'::jsonb),
  ('direct_request_daily_limit', '5'::jsonb)
on conflict (key) do nothing;

create or replace function public._direct_request_setting_int (p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when jsonb_typeof (s.value) = 'number' then (s.value #>> '{}')::int
              when jsonb_typeof (s.value) = 'string' and (s.value #>> '{}') ~ '^[0-9]+$' then (s.value #>> '{}')::int
              else null
            end
     from public.app_settings s where s.key = p_key),
    p_default
  );
$$;

revoke all on function public._direct_request_setting_int (text, int) from public, anon, authenticated;

create or replace function public._direct_requests_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'direct_requests_enabled'),
    false
  );
$$;

revoke all on function public._direct_requests_enabled () from public, anon, authenticated;

-- ─── 3) Visibility: a targeted worker can see the request ────────────────

drop policy if exists "jobs_select_related" on public.jobs;
create policy "jobs_select_related"
  on public.jobs for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or worker_id = auth.uid ()
    or (target_worker_id = auth.uid () and status in ('open', 'quoted'))
  );

drop policy if exists "quotes_select_job_participants" on public.quotes;
create policy "quotes_select_job_participants"
  on public.quotes for select
  to authenticated
  using (
    worker_id = auth.uid ()
    or exists (select 1 from public.jobs j where j.id = quotes.job_id and j.customer_id = auth.uid ())
  );

-- ─── 4) Customer: create a direct request ────────────────────────────────

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
    p_budget_pkr, nullif (btrim (coalesce (p_preferred_time, '')), '')
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.create_direct_request (uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.create_direct_request (uuid, text, text, text, numeric, text, text) to authenticated;

-- ─── 5) Worker: accept as-is, quote, decline ─────────────────────────────

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
  if not exists (
    select 1 from public.worker_profiles wp
    where wp.user_id = auth.uid () and wp.approval_status = 'approved'
  ) then
    raise exception 'worker not approved';
  end if;
  return j;
end;
$$;

revoke all on function public._targeted_open_job (uuid) from public, anon, authenticated;

-- Accept the customer's stated budget as-is.
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

-- Send (or replace) a quote; the customer then accepts or ignores it.
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
begin
  j := public._targeted_open_job (p_job_id);
  if p_amount_pkr is null or p_amount_pkr < 0 then
    raise exception 'invalid amount';
  end if;

  update public.quotes set status = 'rejected'
    where job_id = j.id and worker_id = auth.uid () and status = 'pending';
  insert into public.quotes (job_id, worker_id, amount_pkr, message)
  values (j.id, auth.uid (), p_amount_pkr, nullif (btrim (coalesce (p_message, '')), ''))
  returning id into qid;

  update public.jobs set status = 'quoted', updated_at = now () where id = j.id;
  return qid;
end;
$$;

revoke execute on function public.worker_quote_direct_request (uuid, numeric, text) from public, anon;
grant execute on function public.worker_quote_direct_request (uuid, numeric, text) to authenticated;

create or replace function public.worker_decline_direct_request (p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  j := public._targeted_open_job (p_job_id);
  update public.quotes set status = 'rejected' where job_id = j.id and status = 'pending';
  update public.jobs set status = 'cancelled', updated_at = now () where id = j.id;
end;
$$;

revoke execute on function public.worker_decline_direct_request (uuid) from public, anon;
grant execute on function public.worker_decline_direct_request (uuid) to authenticated;

-- ─── 6) Customer: accept a quote on a direct request ─────────────────────
-- (The general `customer_accept_quote` for posted jobs returns in a later phase.)

create or replace function public.customer_accept_direct_quote (p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  j public.jobs%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'quote not found';
  end if;
  select * into j from public.jobs where id = q.job_id for update;
  if j.customer_id <> auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.origin <> 'customer_job' or j.target_worker_id is null then
    raise exception 'not a direct request';
  end if;
  if j.status not in ('open', 'quoted') then
    raise exception 'request is no longer open';
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

revoke execute on function public.customer_accept_direct_quote (uuid) from public, anon;
grant execute on function public.customer_accept_direct_quote (uuid) to authenticated;

-- ─── 7) Timeout: unanswered requests open up (D12) ───────────────────────
-- Clears the target so the request is no longer tied to one worker. The job
-- board that lets other workers see and quote it arrives with job posting; until
-- then the customer can cancel it (`customer_cancel_job`).

create or replace function public.expire_direct_requests ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.jobs
    set target_worker_id = null, target_expires_at = null, updated_at = now ()
    where target_worker_id is not null
      and status = 'open'
      and worker_id is null
      and target_expires_at is not null
      and target_expires_at < now ();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_direct_requests () from public, anon, authenticated;
grant execute on function public.expire_direct_requests () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('expire-direct-requests', '*/10 * * * *', 'select public.expire_direct_requests ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;

-- ─── 8) Worker toggles own availability ──────────────────────────────────

create or replace function public.worker_set_availability (p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.worker_profiles set is_available = p_available where user_id = auth.uid ();
end;
$$;

revoke execute on function public.worker_set_availability (boolean) from public, anon;
grant execute on function public.worker_set_availability (boolean) to authenticated;

-- ─── 9) Nearby: expose availability, rank available workers first (D23) ──

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
  phone text,
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
    p.phone,
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

-- ─── 10) In-app help ─────────────────────────────────────────────────────

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'how-to-request-worker',
    'getting-started',
    'How do I request a specific worker?',
    'میں کسی مخصوص کارکن کو درخواست کیسے بھیجوں؟',
    'Open Nearby, pick a worker and tap "Send request". Describe the job and, if you like, add a budget. The worker can accept your budget or send a different price. If they do not reply within a couple of hours the request opens up.',
    'قریب میں جائیں، کارکن منتخب کریں اور "درخواست بھیجیں" دبائیں۔ کام بیان کریں اور چاہیں تو بجٹ لکھیں۔ کارکن آپ کا بجٹ مان سکتا ہے یا دوسری قیمت بھیج سکتا ہے۔ اگر وہ کچھ گھنٹوں میں جواب نہ دے تو درخواست دوسروں کے لیے کھل جاتی ہے۔',
    array['request', 'book', 'worker', 'nearby', 'direct']
  )
on conflict (slug) do nothing;
