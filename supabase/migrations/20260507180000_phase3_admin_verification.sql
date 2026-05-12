-- Phase 3 slice 3b: admin verification queue + OCR observability.
-- Additive only; no Phase 1/2 RPCs touched.

-- ─── Worker verification ───────────────────────────────────
alter table public.worker_profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id) on delete set null;

-- Allow rank_listings to surface the verification flag without rewriting it.
-- We extend the helper instead of altering rank_listings, keeping the existing
-- shape stable for callers that haven't yet been updated.
create or replace function public.is_worker_verified (p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_verified, false)
  from public.worker_profiles
  where user_id = p_user_id;
$$;

grant execute on function public.is_worker_verified (uuid) to authenticated;

-- ─── OCR extractions: extra statuses + admin moderation ─────
-- Drop the existing CHECK and replace with the wider one. Default value and
-- column type are preserved.
alter table public.ocr_extractions drop constraint if exists ocr_extractions_status_check;
alter table public.ocr_extractions
  add constraint ocr_extractions_status_check
  check (status in ('pending', 'parsed', 'failed', 'manual_fallback', 'verified', 'rejected'));

alter table public.ocr_extractions
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_note text;

-- Admin SELECT was already covered by ocr_extractions_select_own_or_admin.
-- Add UPDATE for admins so they can move pending → verified/rejected.
drop policy if exists "ocr_extractions_admin_update" on public.ocr_extractions;
create policy "ocr_extractions_admin_update"
  on public.ocr_extractions for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.admin_set_extraction_status (
  p_extraction_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.ocr_extractions%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  if p_status not in ('verified', 'rejected', 'pending') then
    raise exception 'invalid status';
  end if;

  select * into strict e from public.ocr_extractions where id = p_extraction_id for update;

  update public.ocr_extractions
  set status = p_status,
      admin_note = coalesce(p_admin_note, admin_note),
      reviewed_by = auth.uid (),
      reviewed_at = now()
  where id = p_extraction_id;

  -- Reflect verification on the worker's profile so ranking + UI can show it.
  if p_status = 'verified' then
    insert into public.worker_profiles (user_id, is_verified, verified_at, verified_by)
    values (e.worker_id, true, now(), auth.uid ())
    on conflict (user_id) do update
      set is_verified = true,
          verified_at = now(),
          verified_by = auth.uid (),
          updated_at = now();
  elsif p_status = 'rejected' then
    update public.worker_profiles
      set is_verified = false,
          verified_at = null,
          verified_by = auth.uid (),
          updated_at = now()
    where user_id = e.worker_id;
  end if;
end;
$$;

grant execute on function public.admin_set_extraction_status (uuid, text, text) to authenticated;

-- ─── Surface verification in ranking output ─────────────────
-- New function `rank_listings_v2` adds `is_verified` to the row shape and
-- gives a small score nudge for verified workers. We keep `rank_listings`
-- unchanged so existing clients keep working.
create or replace function public.rank_listings_v2 (
  p_category text default null,
  p_limit int default 30
)
returns table (
  id uuid,
  worker_id uuid,
  template_id uuid,
  headline text,
  detail_text text,
  price_pkr numeric,
  status text,
  created_at timestamptz,
  category text,
  worker_display_name text,
  rating numeric,
  review_count int,
  response_rate numeric,
  completion_rate numeric,
  recency_days numeric,
  is_verified boolean,
  score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      l.id,
      l.worker_id,
      l.template_id,
      l.headline,
      l.detail_text,
      l.price_pkr,
      l.status,
      l.created_at,
      t.category as category,
      p.display_name as worker_display_name,
      coalesce(wp.avg_rating, 0)::numeric as rating,
      coalesce(wp.review_count, 0)::int as review_count,
      coalesce(wp.response_rate, 0)::numeric as response_rate,
      coalesce(wp.completion_rate, 0)::numeric as completion_rate,
      greatest(0, extract(epoch from (now() - l.created_at)) / 86400.0)::numeric as recency_days,
      coalesce(wp.is_verified, false) as is_verified
    from public.worker_service_listings l
    join public.service_templates t on t.id = l.template_id
    left join public.profiles p on p.id = l.worker_id
    left join public.worker_profiles wp on wp.user_id = l.worker_id
    where l.status = 'active'
      and (p_category is null or t.category = p_category)
  )
  select
    b.id,
    b.worker_id,
    b.template_id,
    b.headline,
    b.detail_text,
    b.price_pkr,
    b.status,
    b.created_at,
    b.category,
    b.worker_display_name,
    b.rating,
    b.review_count,
    b.response_rate,
    b.completion_rate,
    b.recency_days,
    b.is_verified,
    (
      (b.rating / 5.0) * 50.0
      + b.response_rate * 20.0
      + b.completion_rate * 20.0
      + (1.0 / (1.0 + b.recency_days / 14.0)) * 10.0
      + case when b.is_verified then 5.0 else 0.0 end
    )::numeric as score
  from base b
  order by score desc, b.created_at desc
  limit greatest(coalesce(p_limit, 30), 1);
$$;

grant execute on function public.rank_listings_v2 (text, int) to authenticated;

-- ─── OCR observability helper: log a failed run ─────────────
-- Called from the client orchestrator path that detected a failure. RLS
-- already ensures workers can only insert their own rows.
create or replace function public.log_ocr_failure (
  p_doc_type text,
  p_provider text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.ocr_extractions (worker_id, doc_type, provider, status, admin_note)
  values (auth.uid (), p_doc_type, p_provider, 'failed', p_note)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.log_ocr_failure (text, text, text) to authenticated;
