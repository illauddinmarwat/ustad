-- Phase 5 slice 6: optional community-lite + UI/accessibility support hooks.
-- Additive only and fully gated by app_settings.

create table if not exists public.community_tips (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities (id) on delete set null,
  author_user_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text not null,
  lang text not null default 'en' check (lang in ('en', 'ur', 'bilingual')),
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_tips_city_active
  on public.community_tips (city_id, is_active, sort_order, created_at desc);

create trigger set_community_tips_updated_at before update on public.community_tips
  for each row execute function public.set_updated_at ();

alter table public.community_tips enable row level security;

drop policy if exists "community_tips_select_active_authenticated" on public.community_tips;
create policy "community_tips_select_active_authenticated"
  on public.community_tips for select
  to authenticated
  using (is_active = true);

drop policy if exists "community_tips_admin_write" on public.community_tips;
create policy "community_tips_admin_write"
  on public.community_tips for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.phase5_get_community_tips (
  p_city_code text default null,
  p_limit int default 10
)
returns table (
  id uuid,
  title text,
  body text,
  lang text,
  city_code text,
  sort_order int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with gate as (
    select coalesce(public.get_app_setting('phase5_city_community_enabled'), 'false'::jsonb) = 'true'::jsonb as enabled
  ),
  city_ctx as (
    select coalesce(nullif(lower(trim(p_city_code)), ''), public.phase5_effective_city_code()) as code
  )
  select
    t.id,
    t.title,
    t.body,
    t.lang,
    coalesce(c.code, (select code from city_ctx)) as city_code,
    t.sort_order,
    t.created_at
  from public.community_tips t
  left join public.cities c on c.id = t.city_id
  where
    (select enabled from gate) = true
    and t.is_active = true
    and (
      t.city_id is null
      or c.code = (select code from city_ctx)
    )
  order by t.sort_order asc, t.created_at desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.phase5_get_community_tips (text, int) to authenticated;
