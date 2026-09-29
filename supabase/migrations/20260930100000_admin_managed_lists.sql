-- Admin-managed lists: cities + areas (registration pickers) and skill categories (name + icon).
-- All three are readable by guests because registration happens before login.

-- ---------------------------------------------------------------- cities / areas
alter table public.cities add column if not exists sort_order int not null default 0;

create table if not exists public.city_areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

create index if not exists idx_city_areas_city on public.city_areas (city_id, sort_order, name);

alter table public.city_areas enable row level security;

grant select on public.cities to anon;
grant select on public.city_areas to anon, authenticated;

drop policy if exists "cities_select_all_authenticated" on public.cities;
drop policy if exists "cities_select_public" on public.cities;
create policy "cities_select_public"
  on public.cities for select
  to anon, authenticated
  using (is_active = true or public._is_admin ());

drop policy if exists "city_areas_select_public" on public.city_areas;
create policy "city_areas_select_public"
  on public.city_areas for select
  to anon, authenticated
  using (is_active = true or public._is_admin ());

drop policy if exists "city_areas_admin_write" on public.city_areas;
create policy "city_areas_admin_write"
  on public.city_areas for all
  to authenticated
  using (public._is_admin ())
  with check (public._is_admin ());

-- Seed: major cities (Karachi first so it stays the oldest active city) and well-known areas.
with seed (code, name, ord, areas) as (
  values
    ('karachi', 'Karachi', 1, array['Gulshan-e-Iqbal','Gulistan-e-Jauhar','DHA','Clifton','North Nazimabad','Nazimabad','PECHS','Saddar','Korangi','Malir','Landhi','Orangi Town','Gulberg','Federal B Area','Bahadurabad']),
    ('lahore', 'Lahore', 2, array['Gulberg','DHA','Johar Town','Model Town','Bahria Town','Iqbal Town','Samanabad','Garden Town','Shadman','Wapda Town','Cantt','Allama Iqbal Town']),
    ('islamabad', 'Islamabad', 3, array['F-6','F-7','F-8','F-10','F-11','G-9','G-10','G-11','I-8','I-10','E-11','DHA Islamabad','Bahria Town','Gulberg Greens']),
    ('rawalpindi', 'Rawalpindi', 4, array['Saddar','Satellite Town','Chaklala','Bahria Town','DHA Rawalpindi','Westridge','Commercial Market','Raja Bazaar']),
    ('faisalabad', 'Faisalabad', 5, array['Peoples Colony','Madina Town','Satiana Road','Samanabad','D Ground','Jaranwala Road','Canal Road']),
    ('multan', 'Multan', 6, array['Gulgasht Colony','Cantt','Shah Rukn-e-Alam Colony','Model Town','Bosan Road','Nawan Shehr']),
    ('peshawar', 'Peshawar', 7, array['University Town','Hayatabad','Saddar','Cantt','Gulbahar','Ring Road']),
    ('quetta', 'Quetta', 8, array['Satellite Town','Jinnah Town','Sariab Road','Cantt','Brewery Road']),
    ('hyderabad', 'Hyderabad', 9, array['Latifabad','Qasimabad','Hirabad','Cantt','Saddar']),
    ('sialkot', 'Sialkot', 10, array['Cantt','Paris Road','Kashmir Road','Model Town']),
    ('gujranwala', 'Gujranwala', 11, array['Satellite Town','Model Town','Citi Housing','Cantt','G.T. Road']),
    ('bahawalpur', 'Bahawalpur', 12, array['Model Town A','Satellite Town','Cantt','Yazman Road']),
    ('sargodha', 'Sargodha', 13, array['Satellite Town','Cantt','University Road']),
    ('sukkur', 'Sukkur', 14, array['Military Road','Barrage Road','New Pind']),
    ('abbottabad', 'Abbottabad', 15, array['Mandian','Nawan Shehr','Supply','Jinnahabad'])
), ins_city as (
  insert into public.cities (code, name, sort_order, created_at)
  select code, name, ord, now() + (ord || ' seconds')::interval from seed
  on conflict (code) do update set sort_order = excluded.sort_order
  returning id, code
)
insert into public.city_areas (city_id, name, sort_order)
select ic.id, a.area, a.idx
from ins_city ic
join seed s on s.code = ic.code
cross join lateral unnest(s.areas) with ordinality as a (area, idx)
on conflict (city_id, name) do nothing;

-- ---------------------------------------------------------------- skill categories
create table if not exists public.skill_categories (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  name_en text not null,
  name_ur text not null default '',
  icon_path text,
  template_category text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.skill_categories enable row level security;

grant select on public.skill_categories to anon, authenticated;

drop policy if exists "skill_categories_select_public" on public.skill_categories;
create policy "skill_categories_select_public"
  on public.skill_categories for select
  to anon, authenticated
  using (is_active = true or public._is_admin ());

drop policy if exists "skill_categories_admin_write" on public.skill_categories;
create policy "skill_categories_admin_write"
  on public.skill_categories for all
  to authenticated
  using (public._is_admin ())
  with check (public._is_admin ());

insert into public.skill_categories (key, name_en, name_ur, template_category, sort_order)
values
  ('electrician', 'Electrician', 'الیکٹریشن', 'electrical', 1),
  ('plumber', 'Plumber', 'پلمبر', 'plumbing', 2),
  ('carpenter', 'Carpenter', 'بڑھئی', 'carpentry', 3),
  ('painter', 'Painter', 'پینٹر', 'painting', 4),
  ('ac_technician', 'AC Technician', 'اے سی ٹیکنیشن', 'hvac', 5),
  ('welder', 'Welder', 'ویلڈر', 'welding', 6)
on conflict (key) do nothing;

-- Public bucket for category icons; only admins may write.
insert into storage.buckets (id, name, public)
values ('category-icons', 'category-icons', true)
on conflict (id) do nothing;

drop policy if exists "category_icons_public_read" on storage.objects;
create policy "category_icons_public_read"
  on storage.objects for select
  using (bucket_id = 'category-icons');

drop policy if exists "category_icons_admin_write" on storage.objects;
create policy "category_icons_admin_write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'category-icons' and public._is_admin ())
  with check (bucket_id = 'category-icons' and public._is_admin ());

-- ---------------------------------------------------------------- profiles.area + registration trigger
alter table public.profiles add column if not exists area text;

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen_role text := coalesce(meta->>'role', 'customer');
begin
  if chosen_role not in ('customer', 'worker') then
    chosen_role := 'customer';
  end if;

  insert into public.profiles (id, role, display_name, phone, city, area, address, preferred_language)
  values (
    new.id,
    chosen_role,
    coalesce(meta->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'user'),
    coalesce(meta->>'phone', new.phone),
    meta->>'city',
    meta->>'area',
    meta->>'address',
    coalesce(meta->>'preferred_language', 'ur')
  );

  if chosen_role = 'worker' then
    insert into public.worker_profiles (
      user_id, bio, categories, cnic_number, years_experience, rate_pkr, rate_unit, working_hours
    )
    values (
      new.id,
      meta->>'bio',
      case when meta->>'skill_category' is not null then array[meta->>'skill_category'] else '{}' end,
      meta->>'cnic_number',
      nullif(meta->>'years_experience', '')::int,
      nullif(meta->>'rate_pkr', '')::numeric,
      meta->>'rate_unit',
      meta->>'working_hours'
    );
  end if;

  return new;
end;
$$;
