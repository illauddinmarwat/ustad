-- "Help me write" (AI) and English/Urdu posts and listings. See docs/wizard-ai-plan.md (Phase 3).
--
-- * Posts and listings are stored as the author's original text plus an English and an Urdu version
--   (`*_i18n`), which the author approves in the app. Readers see their own language.
-- * The AI runs in an Edge Function that uses the service role; the app never holds an AI key.
--   This file holds its usage allowance and log, and the flag and limits (all in app_settings).
-- * The phone-number check now also catches Urdu and Arabic-Indic digits, and is applied to every
--   translation as well as the original text.
-- * `profiles.preferred_language` already exists (set at registration); it picks the reader's language.

-- ─── 1) Hardened contact check ───────────────────────────────────────────

create or replace function public._contains_contact (p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce (
    regexp_replace (
      translate (coalesce (p_text, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[\s().+-]', '', 'g'
    ) ~ '[0-9]{7,}'
    or translate (coalesce (p_text, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
       ~* '(https?://|www\.|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|wa\.me|whats ?app)',
    false
  );
$$;

-- A translations object: {"source":"ur","en":"...","ur":"...","ai":true}. Only those keys, text kept short,
-- and no phone number or link in any version.
create or replace function public._valid_i18n (p jsonb, p_max int)
returns boolean
language plpgsql
immutable
as $$
declare
  k text;
  v jsonb;
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof (p) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each (p) loop
    if k = 'source' then
      if jsonb_typeof (v) <> 'string' or (v #>> '{}') not in ('en', 'ur') then
        return false;
      end if;
    elsif k in ('en', 'ur') then
      if jsonb_typeof (v) <> 'string' or char_length (v #>> '{}') > p_max or public._contains_contact (v #>> '{}') then
        return false;
      end if;
    elsif k = 'ai' then
      if jsonb_typeof (v) <> 'boolean' then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ─── 2) English and Urdu versions on jobs and listings ───────────────────

alter table public.jobs
  add column if not exists title_i18n jsonb,
  add column if not exists description_i18n jsonb;

alter table public.worker_service_listings
  add column if not exists headline_i18n jsonb,
  add column if not exists detail_i18n jsonb;

-- post_job takes the two translation objects (optional). One function: the old signature goes.
drop function if exists public.post_job (text, text, text, text, text, text);

create or replace function public.post_job (
  p_title text,
  p_description text,
  p_category text,
  p_city text default null,
  p_location_text text default null,
  p_preferred_time text default null,
  p_title_i18n jsonb default null,
  p_description_i18n jsonb default null
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
  if not public._valid_i18n (p_title_i18n, 120) or not public._valid_i18n (p_description_i18n, 2000) then
    raise exception 'the translations are not valid or contain a phone number or link';
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
    preferred_time, expires_at, posted_by_anon, anon_post_token, title_i18n, description_i18n
  ) values (
    uid, btrim (p_title), btrim (p_description), p_category, 'open', 'customer_job',
    nullif (btrim (coalesce (p_city, '')), ''), nullif (btrim (coalesce (p_location_text, '')), ''),
    nullif (btrim (coalesce (p_preferred_time, '')), ''),
    now () + make_interval (days => expiry_days), uid is null, tok, p_title_i18n, p_description_i18n
  ) returning id into new_id;

  return query select new_id, tok;
end;
$$;

revoke execute on function public.post_job (text, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.post_job (text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;

-- Listings are inserted straight from the app, so a trigger applies the same text rules.
create or replace function public._listing_text_guard ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.headline is distinct from old.headline
     or new.detail_text is distinct from old.detail_text
     or new.service_areas is distinct from old.service_areas
     or new.headline_i18n is distinct from old.headline_i18n
     or new.detail_i18n is distinct from old.detail_i18n then
    if public._contains_contact (new.headline) or public._contains_contact (new.detail_text)
       or public._contains_contact (new.service_areas::text) then
      raise exception 'please do not include phone numbers or links in a listing';
    end if;
    if not public._valid_i18n (new.headline_i18n, 120) or not public._valid_i18n (new.detail_i18n, 2000) then
      raise exception 'the translations are not valid or contain a phone number or link';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_text_guard on public.worker_service_listings;
create trigger listing_text_guard
  before insert or update on public.worker_service_listings
  for each row execute function public._listing_text_guard ();

-- The other-language text of jobs the caller may see (the job board and detail functions return fixed columns).
create or replace function public.job_translations (p_job_ids uuid[])
returns table (job_id uuid, title_i18n jsonb, description_i18n jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.title_i18n, j.description_i18n
  from public.jobs j
  where j.id = any (coalesce (p_job_ids, '{}'))
    and (j.title_i18n is not null or j.description_i18n is not null)
    and public._job_media_viewer (j.id);
$$;

revoke execute on function public.job_translations (uuid[]) from public, anon;
grant execute on function public.job_translations (uuid[]) to authenticated;

-- ─── 3) AI: flag, limits, allowance and log ──────────────────────────────

insert into public.app_settings (key, value) values
  ('ai_help_enabled', 'false'::jsonb),
  ('ai_daily_limit_user', '5'::jsonb),
  ('ai_daily_limit_guest', '2'::jsonb)
on conflict (key) do nothing;

-- One row per person per day. The key is `u:<user id>` or `g:<hash of device and address>`.
create table if not exists public.ai_usage (
  user_key text not null,
  day date not null default current_date,
  calls int not null default 0 check (calls >= 0),
  primary key (user_key, day)
);

-- One row per AI call. Never the text or the answer, only counts.
create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_key text not null,
  action text not null check (action in ('questions', 'draft', 'translate')),
  kind text not null check (kind in ('job', 'listing')),
  ok boolean not null,
  error text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz not null default now ()
);

create index if not exists idx_ai_calls_created on public.ai_calls (created_at desc);

alter table public.ai_usage enable row level security;
alter table public.ai_calls enable row level security;
revoke all on public.ai_usage, public.ai_calls from anon, authenticated;

-- Take one unit of today's allowance. True when allowed (and counted), false when the limit is reached.
create or replace function public.ai_consume (p_key text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if coalesce (p_limit, 0) <= 0 or coalesce (btrim (p_key), '') = '' then
    return false;
  end if;
  insert into public.ai_usage as u (user_key, day, calls) values (p_key, current_date, 1)
  on conflict (user_key, day) do update set calls = u.calls + 1 where u.calls < p_limit
  returning u.calls into n;
  return n is not null;
end;
$$;

-- Give a unit back when the AI call failed.
create or replace function public.ai_refund (p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set calls = greatest (calls - 1, 0) where user_key = p_key and day = current_date;
$$;

create or replace function public.ai_log_call (
  p_key text, p_action text, p_kind text, p_ok boolean, p_error text,
  p_tokens_in int, p_tokens_out int, p_latency_ms int
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_calls (user_key, action, kind, ok, error, tokens_in, tokens_out, latency_ms)
  values (p_key, p_action, p_kind, p_ok, left (p_error, 200), p_tokens_in, p_tokens_out, p_latency_ms);
$$;

revoke all on function public.ai_consume (text, int) from public, anon, authenticated;
revoke all on function public.ai_refund (text) from public, anon, authenticated;
revoke all on function public.ai_log_call (text, text, text, boolean, text, int, int, int) from public, anon, authenticated;
grant execute on function public.ai_consume (text, int) to service_role;
grant execute on function public.ai_refund (text) to service_role;
grant execute on function public.ai_log_call (text, text, text, boolean, text, int, int, int) to service_role;

-- Admin view: calls, failures and tokens per day.
create or replace function public.admin_ai_usage (p_days int default 14)
returns table (day date, calls bigint, failed bigint, tokens_in bigint, tokens_out bigint, people bigint)
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
  select c.created_at::date, count (*), count (*) filter (where not c.ok),
         coalesce (sum (c.tokens_in), 0)::bigint, coalesce (sum (c.tokens_out), 0)::bigint,
         count (distinct c.user_key)
  from public.ai_calls c
  where c.created_at >= current_date - make_interval (days => greatest (coalesce (p_days, 14), 1))
  group by c.created_at::date
  order by 1 desc;
end;
$$;

revoke execute on function public.admin_ai_usage (int) from public, anon;
grant execute on function public.admin_ai_usage (int) to authenticated;
