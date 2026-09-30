-- Admin user management: deactivate/activate (reversible) and delete (permanent), kept separate.
--
-- "Delete" removes the person, not the history. The profile row stays as an anonymous
-- "Deleted user" so jobs, payments, commissions, reviews and reports keep their links.
-- Everything personal is wiped: name, phone, email, address, CNIC number and images, photo,
-- location, sessions, push tokens, notifications. The sign-in account is renamed to an unusable
-- address, its password removed and it is banned, so the email can be registered again.
-- Storage files are removed by the admin app through the Storage API (blobs cannot be deleted from SQL).

-- ─── 1) A third status for deleted people ────────────────────────────────
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'suspended', 'deleted'));

-- ─── 2) Audit trail (survives the delete) ────────────────────────────────
create table if not exists public.user_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text,
  display_name text,
  email text,
  phone text,
  reason text,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);

alter table public.user_deletion_audit enable row level security;
revoke all on public.user_deletion_audit from anon, authenticated;

-- ─── 3) Activate / deactivate: only active <-> suspended ─────────────────
create or replace function public.admin_set_user_status (
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'status must be active or suspended';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.status = 'deleted') then
    raise exception 'this account was deleted';
  end if;
  update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_status (uuid, text) to authenticated;

-- ─── 4) List people for the admin Users page ─────────────────────────────
create or replace function public.admin_list_users (
  p_role text default null,
  p_search text default null,
  p_limit int default 200
)
returns table (
  id uuid, role text, display_name text, email text, phone text, city text, area text,
  status text, approval_status text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  return query
  select p.id, p.role, p.display_name, u.email::text, p.phone, p.city, p.area, p.status,
         wp.approval_status, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.worker_profiles wp on wp.user_id = p.id
  where p.role in ('customer', 'worker')
    and (p_role is null or p.role = p_role)
    and (
      p_search is null or btrim(p_search) = ''
      or p.display_name ilike '%' || btrim(p_search) || '%'
      or p.phone ilike '%' || btrim(p_search) || '%'
      or u.email ilike '%' || btrim(p_search) || '%'
    )
  order by (p.status = 'deleted'), p.created_at desc
  limit greatest(1, least(p_limit, 500));
end;
$$;

grant execute on function public.admin_list_users (text, text, int) to authenticated;

create or replace function public.admin_list_user_deletions (p_limit int default 20)
returns table (id uuid, user_id uuid, role text, display_name text, email text, reason text, deleted_by_name text, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  return query
  select a.id, a.user_id, a.role, a.display_name, a.email, a.reason, ap.display_name, a.deleted_at
  from public.user_deletion_audit a
  left join public.profiles ap on ap.id = a.deleted_by
  order by a.deleted_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function public.admin_list_user_deletions (int) to authenticated;

-- ─── 5) Delete: wipe personal data, keep the records ─────────────────────
create or replace function public.admin_delete_user (p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_phone text;
  v_email text;
  v_status text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reason is required';
  end if;
  if p_user_id = auth.uid () then
    raise exception 'you cannot delete your own account';
  end if;

  select p.role, p.display_name, p.phone, p.status into v_role, v_name, v_phone, v_status
  from public.profiles p where p.id = p_user_id;
  if v_role is null then
    raise exception 'user not found';
  end if;
  if v_role = 'admin' then
    raise exception 'admin accounts cannot be deleted here';
  end if;
  if v_status = 'deleted' then
    raise exception 'this account was already deleted';
  end if;

  if exists (
    select 1 from public.jobs j
    where (j.customer_id = p_user_id or j.worker_id = p_user_id)
      and j.status in ('assigned', 'pending_customer_confirm')
  ) then
    raise exception 'this person has a job in progress; finish or cancel it first';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_user_id;

  insert into public.user_deletion_audit (user_id, role, display_name, email, phone, reason, deleted_by)
  values (p_user_id, v_role, v_name, v_email, v_phone, btrim(p_reason), auth.uid ());

  -- A customer's unfinished requests are cancelled; finished history stays as it was.
  update public.jobs set status = 'cancelled', updated_at = now ()
  where customer_id = p_user_id and status in ('open', 'quoted');

  update public.profiles
  set display_name = 'Deleted user', phone = null, city = null, area = null, address = null,
      status = 'deleted', updated_at = now ()
  where id = p_user_id;

  if v_role = 'worker' then
    update public.worker_profiles
    set bio = null, cnic_number = null, cnic_front_url = null, cnic_back_url = null, photo_url = null,
        working_hours = null, lat = null, lng = null, is_available = false, updated_at = now ()
    where user_id = p_user_id;
  end if;

  delete from public.device_tokens where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;

  -- Lock the sign-in account; keep the row because profiles.id points at it.
  delete from auth.identities where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  update auth.users
  set email = 'deleted-' || p_user_id::text || '@deleted.invalid',
      phone = null,
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity',
      updated_at = now ()
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user (uuid, text) to authenticated;

-- ─── 6) Let admins remove a person's stored files through the Storage API ─
drop policy if exists "worker_documents_admin_delete" on storage.objects;
create policy "worker_documents_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'worker-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "worker_photos_admin_delete" on storage.objects;
create policy "worker_photos_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'worker-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );
