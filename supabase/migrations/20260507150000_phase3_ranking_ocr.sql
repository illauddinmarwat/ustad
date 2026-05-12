-- Phase 3: ranking v2 + OCR scaffold (additive, non-blocking)
-- Notes:
--   * No destructive changes: only ADD columns/tables/functions.
--   * Booking state machine and Phase 1/2 RPCs are untouched.
--   * Risky behavior gated through public.app_settings flags:
--       phase3_ranking_enabled, phase3_ocr_enabled.
--   * `rank_listings` is deterministic and falls back to created_at desc when
--     no signals are present, so disabling the flag in clients gives the same
--     ordering as the legacy listings query.

-- ─── Feature flags ─────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('phase3_ranking_enabled', 'false'::jsonb),
  ('phase3_ocr_enabled', 'false'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_read_all" on public.app_settings;
create policy "app_settings_read_all"
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write"
  on public.app_settings for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.get_app_setting (p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key;
$$;

grant execute on function public.get_app_setting (text) to authenticated;

create or replace function public.admin_set_app_setting (p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

grant execute on function public.admin_set_app_setting (text, jsonb) to authenticated;

-- ─── Worker ranking signals (additive columns) ─────────────
alter table public.worker_profiles
  add column if not exists response_rate numeric(4,3),
  add column if not exists completion_rate numeric(4,3),
  add column if not exists last_active_at timestamptz;

-- ─── OCR extractions (assist trail, not bound to bookings) ──
create table if not exists public.ocr_extractions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  doc_type text not null check (doc_type in ('cnic', 'license', 'other')),
  provider text not null check (provider in ('google', 'groq', 'manual')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  parsed jsonb not null default '{}'::jsonb,
  raw_text text,
  status text not null default 'pending' check (status in ('pending', 'parsed', 'failed', 'manual_fallback')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ocr_extractions_worker on public.ocr_extractions (worker_id, created_at desc);

alter table public.ocr_extractions enable row level security;

drop policy if exists "ocr_extractions_select_own_or_admin" on public.ocr_extractions;
create policy "ocr_extractions_select_own_or_admin"
  on public.ocr_extractions for select
  to authenticated
  using (
    worker_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "ocr_extractions_insert_own" on public.ocr_extractions;
create policy "ocr_extractions_insert_own"
  on public.ocr_extractions for insert
  to authenticated
  with check (worker_id = auth.uid ());

-- ─── Ranking RPC ────────────────────────────────────────────
-- Returns active listings with explainability columns. Deterministic:
-- when signals are NULL/0 the ordering reduces to created_at desc, matching
-- the existing client query. The mobile client must still gate the call on
-- the phase3_ranking_enabled flag and fall back to the plain query otherwise.
create or replace function public.rank_listings (
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
      greatest(
        0,
        extract(epoch from (now() - l.created_at)) / 86400.0
      )::numeric as recency_days
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
    -- Weighted score on 0..100 scale; weights documented in
    -- mobile/src/lib/ranking.ts so the client mirror stays in sync.
    (
      (b.rating / 5.0) * 50.0
      + b.response_rate * 20.0
      + b.completion_rate * 20.0
      + (1.0 / (1.0 + b.recency_days / 14.0)) * 10.0
    )::numeric as score
  from base b
  order by score desc, b.created_at desc
  limit greatest(coalesce(p_limit, 30), 1);
$$;

grant execute on function public.rank_listings (text, int) to authenticated;
