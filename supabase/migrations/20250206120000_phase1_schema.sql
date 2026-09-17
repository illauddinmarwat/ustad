-- Ustad Phase 1 — core schema & RLS
-- Apply with: supabase db push / SQL editor

-- ─── Extensions ─────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Profiles ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'worker', 'admin')),
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  categories text[] default '{}',
  service_areas jsonb default '[]'::jsonb,
  avg_rating numeric(3,2),
  review_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- ─── Rail B catalogue ─────────────────────────────────────
create table public.service_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  description_hint text,
  media_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.worker_service_listings (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.service_templates (id) on delete restrict,
  headline text not null,
  detail_text text,
  price_pkr numeric(12,2) not null check (price_pkr >= 0),
  service_areas jsonb default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_listings_worker on public.worker_service_listings (worker_id);
create index idx_listings_template on public.worker_service_listings (template_id);
create index idx_listings_active on public.worker_service_listings (status) where status = 'active';

create table public.listing_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.worker_service_listings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  note text,
  location_text text,
  preferred_time text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index listing_applications_one_pending_or_accepted
  on public.listing_applications (listing_id, customer_id)
  where status in ('pending', 'accepted');

-- ─── Shared job spine ───────────────────────────────────────
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid references public.profiles (id) on delete set null,
  title text not null,
  description text,
  category text not null,
  status text not null default 'open' check (
    status in ('open', 'quoted', 'pending_customer_confirm', 'assigned', 'completed', 'cancelled')
  ),
  origin text not null check (origin in ('customer_job', 'service_listing')),
  listing_application_id uuid references public.listing_applications (id) on delete set null,
  location_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_jobs_customer on public.jobs (customer_id);
create index idx_jobs_worker on public.jobs (worker_id);
create index idx_jobs_status on public.jobs (status);

create unique index jobs_one_per_listing_application
  on public.jobs (listing_application_id)
  where listing_application_id is not null;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  amount_pkr numeric(12,2) not null check (amount_pkr >= 0),
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create unique index quotes_one_accepted_per_job on public.quotes (job_id) where status = 'accepted';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_messages_job on public.messages (job_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ─── New user → profile ───────────────────────────────────
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, phone)
  values (
    new.id,
    'customer',
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(coalesce(new.email, ''), '@', 1),
      'user'
    ),
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Helpers: updated_at ───────────────────────────────────
create or replace function public.set_updated_at ()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at ();

create trigger set_jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at ();

create trigger set_listings_updated_at before update on public.worker_service_listings
  for each row execute function public.set_updated_at ();

-- ─── RLS ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.service_templates enable row level security;
alter table public.worker_service_listings enable row level security;
alter table public.listing_applications enable row level security;
alter table public.jobs enable row level security;
alter table public.quotes enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- Profiles
create policy "profiles_select_own_or_public_discovery"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid ());

-- Worker profiles (read for discovery when linked to active listings jobs — simple: authenticated read all)
create policy "worker_profiles_read"
  on public.worker_profiles for select to authenticated using (true);

create policy "worker_profiles_upsert_own"
  on public.worker_profiles for all
  to authenticated
  using (user_id = auth.uid ())
  with check (user_id = auth.uid ());

-- Templates: read active for all authenticated; admins via service_role only in dashboard
create policy "service_templates_read_active"
  on public.service_templates for select
  to authenticated
  using (active = true or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

-- Listings
create policy "listings_public_read_active"
  on public.worker_service_listings for select
  to authenticated
  using (status = 'active' or worker_id = auth.uid ());

create policy "listings_manage_own_worker"
  on public.worker_service_listings for insert
  to authenticated
  with check (
    worker_id = auth.uid ()
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'worker')
  );

create policy "listings_update_own"
  on public.worker_service_listings for update
  to authenticated
  using (worker_id = auth.uid ());

create policy "listings_delete_own"
  on public.worker_service_listings for delete
  to authenticated
  using (worker_id = auth.uid ());

-- Applications
create policy "applications_select_participants"
  on public.listing_applications for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or exists (
      select 1 from public.worker_service_listings l
      where l.id = listing_applications.listing_id and l.worker_id = auth.uid ()
    )
  );

create policy "applications_insert_customer"
  on public.listing_applications for insert
  to authenticated
  with check (
    customer_id = auth.uid ()
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'customer')
  );

-- Customer can cancel own pending applications
create policy "applications_customer_update_cancel"
  on public.listing_applications for update
  to authenticated
  using (customer_id = auth.uid () and status = 'pending')
  with check (customer_id = auth.uid () and status = 'cancelled');

-- ─── Jobs: participants + open jobs browse for workers ─────
create policy "jobs_select_related"
  on public.jobs for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or worker_id = auth.uid ()
    or (
      status = 'open'
      and origin = 'customer_job'
      and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'worker')
    )
  );

create policy "jobs_insert_customer_post"
  on public.jobs for insert
  to authenticated
  with check (
    customer_id = auth.uid ()
    and origin = 'customer_job'
    and status = 'open'
    and worker_id is null
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'customer')
  );

-- Status changes go through SECURITY DEFINER RPCs only (prevents forging assigned).
create policy "jobs_customer_edit_draft_fields"
  on public.jobs for update
  to authenticated
  using (
    customer_id = auth.uid ()
    and status in ('open', 'quoted')
  )
  with check (
    customer_id = auth.uid ()
    and status in ('open', 'quoted')
  );

-- Quotes
create policy "quotes_select_job_participants_or_open_quotees"
  on public.quotes for select
  to authenticated
  using (
    worker_id = auth.uid ()
    or exists (select 1 from public.jobs j where j.id = quotes.job_id and j.customer_id = auth.uid ())
    or exists (
      select 1 from public.jobs j
      where j.id = quotes.job_id and j.status = 'open' and j.origin = 'customer_job'
    )
  );

create policy "quotes_insert_worker_open_job"
  on public.quotes for insert
  to authenticated
  with check (
    worker_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.status = 'open' and j.origin = 'customer_job'
    )
  );

create policy "quotes_worker_update_own_pending"
  on public.quotes for update
  to authenticated
  using (worker_id = auth.uid () and status = 'pending');

-- ─── Quote accept: customer RPC (security definer) ─────────
create or replace function public.customer_accept_quote (quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  j public.jobs%rowtype;
begin
  select * into strict q from public.quotes where id = quote_id for update;
  select * into strict j from public.jobs where id = q.job_id for update;

  if j.customer_id <> auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.origin <> 'customer_job' then
    raise exception 'wrong job origin';
  end if;
  if j.status <> 'open' then
    raise exception 'job not open';
  end if;

  update public.quotes set status = 'rejected' where job_id = j.id and id <> quote_id and status = 'pending';
  update public.quotes set status = 'accepted' where id = quote_id;
  update public.jobs set status = 'assigned', worker_id = q.worker_id, updated_at = now() where id = j.id;
end;
$$;

grant execute on function public.customer_accept_quote (uuid) to authenticated;

create or replace function public.worker_accept_listing_application (application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  la public.listing_applications%rowtype;
  listing public.worker_service_listings%rowtype;
  tpl public.service_templates%rowtype;
  new_job_id uuid;
begin
  select * into strict la from public.listing_applications where id = application_id for update;
  select * into strict listing from public.worker_service_listings where id = la.listing_id;
  select * into strict tpl from public.service_templates where id = listing.template_id;

  if listing.worker_id <> auth.uid () then
    raise exception 'not listing owner';
  end if;
  if la.status <> 'pending' then
    raise exception 'application not pending';
  end if;

  update public.listing_applications set status = 'accepted' where id = application_id;

  insert into public.jobs (
    customer_id, worker_id, title, description, category, status, origin,
    listing_application_id, location_text
  ) values (
    la.customer_id,
    listing.worker_id,
    listing.headline,
    coalesce(la.note, '') || E'\n' || coalesce(listing.detail_text, ''),
    tpl.category,
    'pending_customer_confirm',
    'service_listing',
    la.id,
    la.location_text
  )
  returning id into new_job_id;

  return new_job_id;
end;
$$;

grant execute on function public.worker_accept_listing_application (uuid) to authenticated;

create or replace function public.customer_confirm_booking (job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs where id = job_id for update;
  if j.customer_id <> auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.status <> 'pending_customer_confirm' or j.origin <> 'service_listing' then
    raise exception 'invalid state';
  end if;
  update public.jobs set status = 'assigned', updated_at = now() where id = job_id;
end;
$$;

grant execute on function public.customer_confirm_booking (uuid) to authenticated;

create or replace function public.worker_decline_listing_application (application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  la public.listing_applications%rowtype;
  listing public.worker_service_listings%rowtype;
begin
  select * into strict la from public.listing_applications where id = application_id for update;
  select * into strict listing from public.worker_service_listings where id = la.listing_id;
  if listing.worker_id <> auth.uid () then raise exception 'not listing owner'; end if;
  if la.status <> 'pending' then raise exception 'application not pending'; end if;
  update public.listing_applications set status = 'declined' where id = application_id;
end;
$$;

grant execute on function public.worker_decline_listing_application (uuid) to authenticated;

create or replace function public.mark_job_completed (job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs where id = job_id for update;
  if j.customer_id is distinct from auth.uid () and j.worker_id is distinct from auth.uid () then
    raise exception 'not a participant';
  end if;
  if j.status <> 'assigned' then
    raise exception 'job must be assigned';
  end if;
  update public.jobs set status = 'completed', updated_at = now() where id = job_id;
end;
$$;

grant execute on function public.mark_job_completed (uuid) to authenticated;

create or replace function public.customer_cancel_job (job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs where id = job_id for update;
  if j.customer_id <> auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.status not in ('open', 'quoted', 'pending_customer_confirm') then
    raise exception 'cannot cancel from this state';
  end if;
  update public.quotes set status = 'rejected' where job_id = j.id and status = 'pending';
  update public.jobs set status = 'cancelled', updated_at = now() where id = job_id;
end;
$$;

grant execute on function public.customer_cancel_job (uuid) to authenticated;

-- ─── Messages: participants ─────────────────────────────────
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (
          j.customer_id = auth.uid ()
          or j.worker_id = auth.uid ()
          or (
            j.origin = 'customer_job'
            and j.status in ('open', 'quoted')
            and exists (
              select 1 from public.quotes q
              where q.job_id = j.id
                and q.worker_id = auth.uid ()
                and q.status = 'pending'
            )
          )
        )
    )
  );

create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (
          (
            j.customer_id = auth.uid ()
            and j.status in ('open', 'quoted', 'pending_customer_confirm', 'assigned')
          )
          or (
            j.worker_id = auth.uid ()
            and j.status in ('pending_customer_confirm', 'assigned')
          )
          or (
            j.origin = 'customer_job'
            and j.status in ('open', 'quoted')
            and exists (
              select 1 from public.quotes q
              where q.job_id = j.id
                and q.worker_id = auth.uid ()
                and q.status = 'pending'
            )
          )
        )
    )
  );

-- ─── Reviews: customer after complete ───────────────────────
create policy "reviews_select_participants"
  on public.reviews for select to authenticated using (true);

create policy "reviews_insert_customer_completed"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = reviews.job_id
        and j.customer_id = auth.uid ()
        and j.status = 'completed'
    )
    and reviewee_id = (select worker_id from public.jobs where id = reviews.job_id)
  );
