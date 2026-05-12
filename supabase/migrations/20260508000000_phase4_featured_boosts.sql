-- Phase 4 slice 3: featured listings / boosts + impression tracking.
-- Additive and flag-gated; deterministic fallback keeps existing ranking behavior.

insert into public.app_settings (key, value)
values ('phase4_boosts_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.worker_service_listings (id) on delete cascade,
  boost_weight int not null default 10 check (boost_weight >= 0 and boost_weight <= 50),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create trigger set_listing_boosts_updated_at before update on public.listing_boosts
  for each row execute function public.set_updated_at ();

create index if not exists idx_listing_boosts_listing on public.listing_boosts (listing_id, status, ends_at desc);

create table if not exists public.listing_promo_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.worker_service_listings (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  event_name text not null check (event_name in ('impression', 'click')),
  position int check (position is null or position >= 0),
  ranking_enabled boolean not null default false,
  boosts_enabled boolean not null default false,
  cohort text,
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_listing_promo_events_name_time on public.listing_promo_events (event_name, created_at desc);
create index if not exists idx_listing_promo_events_listing on public.listing_promo_events (listing_id, created_at desc);

alter table public.listing_boosts enable row level security;
alter table public.listing_promo_events enable row level security;

drop policy if exists "listing_boosts_select_active_or_admin" on public.listing_boosts;
create policy "listing_boosts_select_active_or_admin"
  on public.listing_boosts for select
  to authenticated
  using (
    status = 'active'
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "listing_boosts_admin_write" on public.listing_boosts;
create policy "listing_boosts_admin_write"
  on public.listing_boosts for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "listing_promo_events_insert_own_or_anon" on public.listing_promo_events;
create policy "listing_promo_events_insert_own_or_anon"
  on public.listing_promo_events for insert
  to authenticated
  with check (viewer_id is null or viewer_id = auth.uid ());

drop policy if exists "listing_promo_events_select_admin" on public.listing_promo_events;
create policy "listing_promo_events_select_admin"
  on public.listing_promo_events for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.rank_listings_with_boosts (
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
  score numeric,
  is_boosted boolean,
  boost_weight int,
  boosted_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select *
    from public.rank_listings_v2(p_category, greatest(coalesce(p_limit, 30), 1) * 3)
  ),
  boosts as (
    select distinct on (b.listing_id)
      b.listing_id,
      b.boost_weight
    from public.listing_boosts b
    where b.status = 'active'
      and b.starts_at <= now()
      and b.ends_at > now()
    order by b.listing_id, b.created_at desc
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
    b.score,
    (coalesce(x.boost_weight, 0) > 0) as is_boosted,
    coalesce(x.boost_weight, 0)::int as boost_weight,
    (b.score + coalesce(x.boost_weight, 0))::numeric as boosted_score
  from base b
  left join boosts x on x.listing_id = b.id
  order by boosted_score desc, b.created_at desc
  limit greatest(coalesce(p_limit, 30), 1);
$$;

grant execute on function public.rank_listings_with_boosts (text, int) to authenticated;

create or replace function public.track_listing_promo_event (
  p_listing_id uuid,
  p_event_name text,
  p_position int default null,
  p_ranking_enabled boolean default false,
  p_boosts_enabled boolean default false,
  p_cohort text default null,
  p_event_props jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_event_name not in ('impression', 'click') then
    raise exception 'invalid event';
  end if;

  if not exists (
    select 1 from public.worker_service_listings l
    where l.id = p_listing_id and l.status = 'active'
  ) then
    raise exception 'listing not active';
  end if;

  insert into public.listing_promo_events (
    listing_id,
    viewer_id,
    event_name,
    position,
    ranking_enabled,
    boosts_enabled,
    cohort,
    event_props
  )
  values (
    p_listing_id,
    auth.uid (),
    p_event_name,
    p_position,
    p_ranking_enabled,
    p_boosts_enabled,
    p_cohort,
    coalesce(p_event_props, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.track_listing_promo_event (uuid, text, int, boolean, boolean, text, jsonb) to authenticated;
