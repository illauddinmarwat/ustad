-- Self-service account deletion (Google Play requires an in-app way to delete the account).
-- Same soft-delete as admin_delete_user: personal data is wiped, the sign-in is locked, and the
-- row stays because jobs, payments and reviews point at it.

create or replace function public.delete_my_account ()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid ();
  v_role text;
  v_name text;
  v_phone text;
  v_status text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'sign in to delete your account';
  end if;

  select p.role, p.display_name, p.phone, p.status into v_role, v_name, v_phone, v_status
  from public.profiles p where p.id = v_uid;
  if v_role is null then
    raise exception 'account not found';
  end if;
  if v_role = 'admin' then
    raise exception 'admin accounts cannot be deleted here';
  end if;
  if v_status = 'deleted' then
    return;
  end if;

  if exists (
    select 1 from public.jobs j
    where (j.customer_id = v_uid or j.worker_id = v_uid)
      and j.status in ('assigned', 'pending_customer_confirm')
  ) then
    raise exception 'you have a job in progress; finish or cancel it first';
  end if;

  select u.email::text into v_email from auth.users u where u.id = v_uid;

  insert into public.user_deletion_audit (user_id, role, display_name, email, phone, reason, deleted_by)
  values (v_uid, v_role, v_name, v_email, v_phone, 'self-service deletion', v_uid);

  update public.jobs set status = 'cancelled', updated_at = now ()
  where customer_id = v_uid and status in ('open', 'quoted');

  -- Must run as a definer: the profile guard only blocks status changes from the client roles.
  update public.profiles
  set display_name = 'Deleted user', phone = null, city = null, area = null, address = null,
      status = 'deleted', updated_at = now ()
  where id = v_uid;

  if v_role = 'worker' then
    update public.worker_profiles
    set bio = null, cnic_number = null, cnic_front_url = null, cnic_back_url = null, photo_url = null,
        working_hours = null, lat = null, lng = null, is_available = false, updated_at = now ()
    where user_id = v_uid;
    update public.worker_service_listings set status = 'paused' where worker_id = v_uid;
  end if;

  delete from public.device_tokens where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;

  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  update auth.users
  set email = 'deleted-' || v_uid::text || '@deleted.invalid',
      phone = null,
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity',
      updated_at = now ()
  where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account () from public, anon;
grant execute on function public.delete_my_account () to authenticated;
