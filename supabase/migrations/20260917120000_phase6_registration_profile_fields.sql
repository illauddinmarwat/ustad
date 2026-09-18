-- ─── Phase 6: registration form fields (customer + professional) ──────────
-- Adds the profile columns the blueprint registration forms collect, and
-- teaches handle_new_user() to populate them (plus pick role + create the
-- worker_profiles row) straight from auth.users.raw_user_meta_data, since
-- the client only has a session *after* signUp resolves and RLS would
-- otherwise block the initial insert.

alter table public.profiles
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists preferred_language text not null default 'ur'
    check (preferred_language in ('ur', 'en'));

alter table public.worker_profiles
  add column if not exists cnic_number text,
  add column if not exists years_experience int check (years_experience >= 0),
  add column if not exists rate_pkr numeric(12,2) check (rate_pkr >= 0),
  add column if not exists rate_unit text check (rate_unit in ('hour', 'day')),
  add column if not exists working_hours text,
  add column if not exists photo_url text;

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

  insert into public.profiles (id, role, display_name, phone, city, address, preferred_language)
  values (
    new.id,
    chosen_role,
    coalesce(meta->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'user'),
    coalesce(meta->>'phone', new.phone),
    meta->>'city',
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

-- ─── Worker profile photo storage ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('worker-photos', 'worker-photos', true)
on conflict (id) do nothing;

create policy "worker_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'worker-photos');

create policy "worker_photos_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'worker-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "worker_photos_owner_update"
  on storage.objects for update
  using (bucket_id = 'worker-photos' and (storage.foldername(name))[1] = auth.uid()::text);
