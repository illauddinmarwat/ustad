-- Service listings without a price, listing photos, and "Request a quote" from a listing.
-- See docs/wizard-ai-plan.md (Phase 2).
--
-- * A listing no longer carries a price. The Ustad's quote is the only price (same rule as job posts).
-- * A customer asks a listing's Ustad for a quote. That creates a direct-request job
--   (jobs.target_worker_id) tagged with jobs.listing_id, so media, quotes, the question thread, the
--   2-hour fallback and the accept / contact-reveal flow are the existing ones.
-- * Listing photos (up to 4 per listing) are public like the listing itself, so guests see them too.
-- * `listing_applications` is left in place and is no longer used by the app.
-- * The flag `listing_quote_requests_enabled` ships off; direct requests must be on as well.

-- ─── 1) Flag ─────────────────────────────────────────────────────────────

insert into public.app_settings (key, value) values
  ('listing_quote_requests_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public._listing_requests_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'listing_quote_requests_enabled'),
    false
  );
$$;

revoke all on function public._listing_requests_enabled () from public, anon, authenticated;

-- ─── 2) Listings have no price ───────────────────────────────────────────
-- The column stays (nullable) so ranking and discovery functions that return it keep working;
-- they now return null for new listings.

alter table public.worker_service_listings alter column price_pkr drop not null;

-- ─── 3) Which listing a request came from ────────────────────────────────

alter table public.jobs
  add column if not exists listing_id uuid references public.worker_service_listings (id) on delete set null;

create index if not exists idx_jobs_listing on public.jobs (listing_id) where listing_id is not null;

-- ─── 4) Listing photos ───────────────────────────────────────────────────

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid (),
  listing_id uuid not null references public.worker_service_listings (id) on delete cascade,
  path text not null unique,
  bytes int not null check (bytes > 0),
  created_at timestamptz not null default now (),
  removed_at timestamptz
);

create index if not exists idx_listing_media_listing on public.listing_media (listing_id) where removed_at is null;

-- Read and written only through the functions below.
alter table public.listing_media enable row level security;
revoke all on public.listing_media from anon, authenticated;

-- The signed-in Ustad owns this listing.
create or replace function public._owns_listing (p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    auth.uid () is not null and exists (
      select 1 from public.worker_service_listings l
      where l.id = p_listing_id and l.worker_id = auth.uid ()
    ),
    false
  );
$$;

revoke all on function public._owns_listing (uuid) from public, anon;
grant execute on function public._owns_listing (uuid) to authenticated;

-- Storage paths look like {worker_id}/{listing_id}/{file}; anything else yields null.
create or replace function public._listing_media_path_listing (p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername (p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername (p_name))[2])::uuid
    else null
  end;
$$;

revoke all on function public._listing_media_path_listing (text) from public, anon;
grant execute on function public._listing_media_path_listing (text) to authenticated;

-- Public bucket: a listing and its photos are visible to everyone, signed in or not.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "listing_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername (name))[1] = auth.uid ()::text
    and public._listing_media_path_listing (name) is not null
    and public._owns_listing (public._listing_media_path_listing (name))
  );

create policy "listing_media_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-media'
    and (
      (storage.foldername (name))[1] = auth.uid ()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
    )
  );

-- Register an uploaded photo. Up to 4 per listing, 3 MB each.
create or replace function public.add_listing_media (
  p_listing_id uuid,
  p_path text,
  p_bytes int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  n int;
  new_id uuid;
begin
  if uid is null then
    raise exception 'sign in to add photos';
  end if;
  if not public._owns_listing (p_listing_id) then
    raise exception 'listing not found';
  end if;
  if p_path is null or p_path not like uid::text || '/' || p_listing_id::text || '/%' then
    raise exception 'invalid file path';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'invalid file size';
  end if;
  if p_bytes > 3145728 then
    raise exception 'photo is too large (max 3 MB)';
  end if;

  select count (*) into n from public.listing_media m
    where m.listing_id = p_listing_id and m.removed_at is null;
  if n >= 4 then
    raise exception 'limit reached: 4 photos per listing';
  end if;

  insert into public.listing_media (listing_id, path, bytes)
  values (p_listing_id, p_path, p_bytes)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.add_listing_media (uuid, text, int) from public, anon;
grant execute on function public.add_listing_media (uuid, text, int) to authenticated;

-- Mark a photo removed; returns its path so the app can delete the stored object.
create or replace function public.remove_listing_media (p_media_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.listing_media%rowtype;
  is_admin boolean;
begin
  select * into m from public.listing_media where id = p_media_id and removed_at is null;
  if not found then
    raise exception 'photo not found';
  end if;
  select exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') into is_admin;
  if not is_admin and not public._owns_listing (m.listing_id) then
    raise exception 'photo not found';
  end if;
  update public.listing_media set removed_at = now () where id = m.id;
  return m.path;
end;
$$;

revoke execute on function public.remove_listing_media (uuid) from public, anon;
grant execute on function public.remove_listing_media (uuid) to authenticated;

-- Photos for a set of listings: anyone sees an active listing's photos; an owner also sees a draft's.
create or replace function public.list_listing_media (p_listing_ids uuid[])
returns table (id uuid, listing_id uuid, path text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.listing_id, m.path, m.created_at
  from public.listing_media m
  join public.worker_service_listings l on l.id = m.listing_id
  where m.listing_id = any (coalesce (p_listing_ids, '{}'))
    and m.removed_at is null
    and (l.status = 'active' or l.worker_id = auth.uid ())
  order by m.listing_id, m.created_at;
$$;

revoke execute on function public.list_listing_media (uuid[]) from public;
grant execute on function public.list_listing_media (uuid[]) to anon, authenticated;

-- ─── 5) Request a quote from a listing ───────────────────────────────────

create or replace function public.create_listing_request (
  p_listing_id uuid,
  p_title text,
  p_description text,
  p_location_text text default null,
  p_preferred_time text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.worker_service_listings%rowtype;
  skill text;
  new_id uuid;
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  if not public._listing_requests_enabled () then
    raise exception 'quote requests from listings are not enabled';
  end if;

  select * into l from public.worker_service_listings where id = p_listing_id and status = 'active';
  if not found then
    raise exception 'listing not available';
  end if;

  -- The listing's template category maps to the skill key the worker is approved for.
  select sc.key into skill
  from public.service_templates t
  join public.skill_categories sc on sc.template_category = t.category
  where t.id = l.template_id
  order by sc.sort_order
  limit 1;
  if skill is null then
    raise exception 'listing has no matching category';
  end if;

  -- Checks (own listing, approved worker, daily limit, required text) live in create_direct_request.
  new_id := public.create_direct_request (l.worker_id, p_title, p_description, skill, null, p_preferred_time, p_location_text);

  update public.jobs set listing_id = p_listing_id where id = new_id;
  return new_id;
end;
$$;

revoke execute on function public.create_listing_request (uuid, text, text, text, text) from public, anon;
grant execute on function public.create_listing_request (uuid, text, text, text, text) to authenticated;
