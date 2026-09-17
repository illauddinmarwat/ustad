-- Phase: Guest UX hardening.
--
-- Two additive changes (no breaking column drops):
--
-- 1) Open up read-only discovery to the Supabase `anon` role so unauthenticated
--    visitors can browse active listings, service templates, app settings
--    flags, and execute the read-only ranking RPCs.
--
-- 2) Allow truly anonymous job posts:
--    - jobs.customer_id becomes nullable
--    - new columns posted_by_anon / anon_post_token track the anon origin
--    - new INSERT policy `jobs_insert_anonymous_post` for the anon role with
--      strict checks
--    - new SECURITY DEFINER RPCs:
--        * get_anon_job(p_token)   -> read own anon job by token (anon-safe)
--        * claim_anon_job(p_token) -> attach an anon job to the current
--                                     authenticated customer
--
-- Worker / authenticated flows are unchanged: workers still see open
-- customer_jobs via `jobs_select_related`; quotes / messages / reviews still
-- require `auth.uid() = customer_id`, which becomes true after a claim.

-- ─── 1) Anonymous browse: listings, templates, app_settings ──────────────

drop policy if exists "service_templates_read_active" on public.service_templates;
create policy "service_templates_read_active"
  on public.service_templates for select
  to anon, authenticated
  using (
    active = true
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "listings_public_read_active" on public.worker_service_listings;
create policy "listings_public_read_active"
  on public.worker_service_listings for select
  to anon, authenticated
  using (status = 'active' or worker_id = auth.uid ());

drop policy if exists "app_settings_read_all" on public.app_settings;
create policy "app_settings_read_all"
  on public.app_settings for select
  to anon, authenticated
  using (true);

-- Make sure anon has table-level SELECT (Supabase defaults usually include
-- this, but make it explicit so the migration is self-contained).
grant select on public.service_templates to anon;
grant select on public.worker_service_listings to anon;
grant select on public.app_settings to anon;

-- ─── 2) Allow anon to execute read-only ranking RPCs ─────────────────────
-- These are all SECURITY DEFINER, so they bypass RLS internally and only
-- read public, non-PII fields. Anon execute is safe.

grant execute on function public.get_app_setting (text) to anon;
grant execute on function public.rank_listings (text, int) to anon;
grant execute on function public.rank_listings_v2 (text, int) to anon;
grant execute on function public.rank_listings_with_boosts (text, int) to anon;
grant execute on function public.phase5_discover_listings (text, text, int, boolean) to anon;
grant execute on function public.phase5_effective_city_code () to anon;

-- ─── 3) Anonymous job posts: schema ──────────────────────────────────────

alter table public.jobs
  alter column customer_id drop not null;

alter table public.jobs
  add column if not exists posted_by_anon boolean not null default false;

alter table public.jobs
  add column if not exists anon_post_token uuid;

create unique index if not exists jobs_anon_post_token_unique
  on public.jobs (anon_post_token)
  where anon_post_token is not null;

-- Either we have a real customer (Phase 1 default) OR we are an anon post
-- with a token. Belt-and-suspenders alongside the insert policy.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'jobs'
      and constraint_name = 'jobs_customer_or_anon_token'
  ) then
    alter table public.jobs
      add constraint jobs_customer_or_anon_token
      check (
        (customer_id is not null and posted_by_anon = false and anon_post_token is null)
        or (customer_id is null and posted_by_anon = true and anon_post_token is not null)
      );
  end if;
end $$;

-- ─── 4) Anon INSERT policy + table grant ─────────────────────────────────

drop policy if exists "jobs_insert_anonymous_post" on public.jobs;
create policy "jobs_insert_anonymous_post"
  on public.jobs for insert
  to anon
  with check (
    customer_id is null
    and posted_by_anon = true
    and anon_post_token is not null
    and origin = 'customer_job'
    and status = 'open'
    and worker_id is null
    and listing_application_id is null
  );

grant insert on public.jobs to anon;

-- Workers / authenticated readers already cover open customer_jobs via
-- `jobs_select_related`. We deliberately do NOT add an anon SELECT policy:
-- anon poster reads happen through `get_anon_job(token)` below.

-- ─── 5) Read own anon job by token ───────────────────────────────────────

create or replace function public.get_anon_job (p_token uuid)
returns table (
  id uuid,
  title text,
  description text,
  category text,
  status text,
  location_text text,
  worker_id uuid,
  created_at timestamptz,
  origin text,
  posted_by_anon boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id,
    j.title,
    j.description,
    j.category,
    j.status,
    j.location_text,
    j.worker_id,
    j.created_at,
    j.origin,
    j.posted_by_anon
  from public.jobs j
  where j.anon_post_token = p_token
  limit 1;
$$;

grant execute on function public.get_anon_job (uuid) to anon, authenticated;

-- ─── 6) Claim an anon job after sign-in ──────────────────────────────────

create or replace function public.claim_anon_job (p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j_id uuid;
  uid uuid := auth.uid ();
begin
  if uid is null then
    raise exception 'must be authenticated to claim';
  end if;

  -- Ensure a profile exists for this user. handle_new_user() trigger creates
  -- one on auth.users insert; we re-assert to keep this RPC robust if the
  -- profile row was deleted manually.
  insert into public.profiles (id, role)
  values (uid, 'customer')
  on conflict (id) do nothing;

  update public.jobs
    set customer_id = uid,
        anon_post_token = null,
        posted_by_anon = false,
        updated_at = now ()
    where anon_post_token = p_token
      and posted_by_anon = true
      and customer_id is null
    returning id into j_id;

  if j_id is null then
    raise exception 'job not found or already claimed';
  end if;

  return j_id;
end;
$$;

grant execute on function public.claim_anon_job (uuid) to authenticated;
