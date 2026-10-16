-- Listing browse was O(number of listings) per request: rank_listings_v2 scored and sorted every active
-- listing on every call (about 25k buffer hits and 30 ms at only 4,000 listings, the hottest path in the app).
--
-- Now: a small cache holds each listing's score, refreshed every 2 minutes by pg_cron. Browse reads the top
-- rows from an index and only the 30 or so winners pay for the wide columns. Listings created since the last
-- refresh are scored live and merged in, so a new listing shows up at once. If the cache is missing or older
-- than 10 minutes (pg_cron off, job failing) the function falls back to scoring everything live, so results
-- are always correct and only the speed changes.

create or replace function public._listing_score (
  p_rating numeric, p_response numeric, p_completion numeric, p_recency_days numeric, p_verified boolean
)
returns numeric
language sql
immutable
as $$
  select (
    (p_rating / 5.0) * 50.0
    + p_response * 20.0
    + p_completion * 20.0
    + (1.0 / (1.0 + p_recency_days / 14.0)) * 10.0
    + case when p_verified then 5.0 else 0.0 end
  )::numeric;
$$;

create table if not exists public.listing_rank_cache (
  listing_id uuid primary key references public.worker_service_listings (id) on delete cascade,
  category text not null,
  score numeric not null,
  created_at timestamptz not null
);
create index if not exists idx_listing_rank_cache_cat on public.listing_rank_cache (category, score desc, created_at desc);
create index if not exists idx_listing_rank_cache_all on public.listing_rank_cache (score desc, created_at desc);

create table if not exists public.listing_rank_meta (
  id boolean primary key default true check (id),
  computed_at timestamptz not null
);

-- Only the security-definer functions touch these tables.
alter table public.listing_rank_cache enable row level security;
alter table public.listing_rank_meta enable row level security;

create or replace function public.refresh_listing_rank_cache ()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now ();
begin
  delete from public.listing_rank_cache;
  insert into public.listing_rank_cache (listing_id, category, score, created_at)
  select
    l.id,
    t.category,
    public._listing_score (
      coalesce (wp.avg_rating, 0)::numeric,
      coalesce (wp.response_rate, 0)::numeric,
      coalesce (wp.completion_rate, 0)::numeric,
      greatest (0, extract (epoch from (v_at - l.created_at)) / 86400.0)::numeric,
      coalesce (wp.is_verified, false)
    ),
    l.created_at
  from public.worker_service_listings l
  join public.profiles p on p.id = l.worker_id and p.status = 'active'
  join public.service_templates t on t.id = l.template_id
  left join public.worker_profiles wp on wp.user_id = l.worker_id
  where l.status = 'active';

  insert into public.listing_rank_meta (id, computed_at) values (true, v_at)
  on conflict (id) do update set computed_at = excluded.computed_at;
end;
$$;

revoke all on function public.refresh_listing_rank_cache () from public, anon, authenticated;
grant execute on function public.refresh_listing_rank_cache () to postgres;

create or replace function public.rank_listings_v2 (p_category text default null, p_limit int default 30)
returns table (
  id uuid, worker_id uuid, template_id uuid, headline text, detail_text text, price_pkr numeric, status text,
  created_at timestamptz, category text, worker_display_name text, rating numeric, review_count int,
  response_rate numeric, completion_rate numeric, recency_days numeric, is_verified boolean, score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with meta as (
    select
      coalesce ((select m.computed_at > now () - interval '10 minutes' from public.listing_rank_meta m), false) as fresh,
      (select m.computed_at from public.listing_rank_meta m) as at
  ),
  -- Fresh cache: top rows by index, checked against the live listing and profile so paused or suspended
  -- listings drop out immediately.
  cand_cached as (
    select c.listing_id, c.score, c.created_at
    from public.listing_rank_cache c
    join public.worker_service_listings l on l.id = c.listing_id and l.status = 'active'
    join public.profiles p on p.id = l.worker_id and p.status = 'active'
    where (select fresh from meta)
      and (p_category is null or c.category = p_category)
    order by c.score desc, c.created_at desc
    limit greatest (coalesce (p_limit, 30), 1)
  ),
  -- Listings created since the last refresh are not in the cache yet: score them live.
  cand_new as (
    select
      l.id as listing_id,
      public._listing_score (
        coalesce (wp.avg_rating, 0)::numeric, coalesce (wp.response_rate, 0)::numeric,
        coalesce (wp.completion_rate, 0)::numeric,
        greatest (0, extract (epoch from (now () - l.created_at)) / 86400.0)::numeric,
        coalesce (wp.is_verified, false)
      ) as score,
      l.created_at
    from public.worker_service_listings l
    join public.profiles p on p.id = l.worker_id and p.status = 'active'
    join public.service_templates t on t.id = l.template_id
    left join public.worker_profiles wp on wp.user_id = l.worker_id
    where (select fresh from meta)
      and l.status = 'active'
      and l.created_at > (select at from meta)
      and (p_category is null or t.category = p_category)
  ),
  -- Cache missing or stale: the original behaviour, score everything.
  cand_live as (
    select
      l.id as listing_id,
      public._listing_score (
        coalesce (wp.avg_rating, 0)::numeric, coalesce (wp.response_rate, 0)::numeric,
        coalesce (wp.completion_rate, 0)::numeric,
        greatest (0, extract (epoch from (now () - l.created_at)) / 86400.0)::numeric,
        coalesce (wp.is_verified, false)
      ) as score,
      l.created_at
    from public.worker_service_listings l
    join public.profiles p on p.id = l.worker_id and p.status = 'active'
    join public.service_templates t on t.id = l.template_id
    left join public.worker_profiles wp on wp.user_id = l.worker_id
    where not (select fresh from meta)
      and l.status = 'active'
      and (p_category is null or t.category = p_category)
  ),
  top as (
    select u.listing_id, u.score, u.created_at
    from (
      select * from cand_cached
      union all select * from cand_new
      union all select * from cand_live
    ) u
    order by u.score desc, u.created_at desc
    limit greatest (coalesce (p_limit, 30), 1)
  )
  select
    l.id, l.worker_id, l.template_id, l.headline, l.detail_text, l.price_pkr, l.status, l.created_at,
    t.category,
    p.display_name,
    coalesce (wp.avg_rating, 0)::numeric,
    coalesce (wp.review_count, 0)::int,
    coalesce (wp.response_rate, 0)::numeric,
    coalesce (wp.completion_rate, 0)::numeric,
    greatest (0, extract (epoch from (now () - l.created_at)) / 86400.0)::numeric,
    coalesce (wp.is_verified, false),
    top.score
  from top
  join public.worker_service_listings l on l.id = top.listing_id
  join public.service_templates t on t.id = l.template_id
  left join public.profiles p on p.id = l.worker_id
  left join public.worker_profiles wp on wp.user_id = l.worker_id
  order by top.score desc, top.created_at desc;
$$;

-- Prime it now, then keep it fresh. Without pg_cron the function simply falls back to live scoring.
select public.refresh_listing_rank_cache ();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('refresh-listing-rank-cache', '*/2 * * * *', 'select public.refresh_listing_rank_cache ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;
