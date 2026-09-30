-- A rejected Ustad can open their registration form pre-filled, correct anything, and send the
-- application back for review. National ID and location columns are hidden from direct selects,
-- so the worker reads their own application through a security-definer function. Only a rejected
-- worker can resubmit; doing so moves the profile back to 'pending' and clears the admin's remark.
-- New images are uploaded by the app first (own folder in worker-documents / worker-photos).

create or replace function public.worker_get_own_application ()
returns table (
  display_name text,
  phone text,
  city text,
  area text,
  address text,
  cnic_number text,
  skill_category text,
  years_experience int,
  rate_pkr numeric,
  rate_unit text,
  working_hours text,
  bio text,
  photo_url text,
  cnic_front_url text,
  cnic_back_url text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.display_name, p.phone, p.city, p.area, p.address,
    wp.cnic_number, wp.categories[1], wp.years_experience, wp.rate_pkr, wp.rate_unit,
    wp.working_hours, wp.bio, wp.photo_url, wp.cnic_front_url, wp.cnic_back_url, wp.lat, wp.lng
  from public.worker_profiles wp
  join public.profiles p on p.id = wp.user_id
  where wp.user_id = auth.uid ();
$$;

revoke all on function public.worker_get_own_application () from public, anon;
grant execute on function public.worker_get_own_application () to authenticated;

drop function if exists public.worker_resubmit_application (text);

create or replace function public.worker_resubmit_application (
  p_display_name text,
  p_phone text,
  p_city text,
  p_area text,
  p_address text,
  p_cnic text,
  p_skill_category text,
  p_years_experience int,
  p_rate_pkr numeric,
  p_rate_unit text,
  p_working_hours text,
  p_bio text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.worker_profiles wp
    where wp.user_id = auth.uid () and wp.approval_status = 'rejected'
  ) then
    raise exception 'application is not rejected';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(btrim (p_display_name), ''), display_name),
      phone = coalesce(nullif(btrim (p_phone), ''), phone),
      city = p_city,
      area = p_area,
      address = p_address
  where id = auth.uid ();

  update public.worker_profiles
  set cnic_number = coalesce(nullif(btrim (p_cnic), ''), cnic_number),
      categories = case when p_skill_category is not null then array[p_skill_category] else categories end,
      years_experience = p_years_experience,
      rate_pkr = p_rate_pkr,
      rate_unit = p_rate_unit,
      working_hours = p_working_hours,
      bio = p_bio,
      approval_status = 'pending',
      rejection_reason = null,
      approval_reviewed_at = null,
      approval_reviewed_by = null,
      updated_at = now()
  where user_id = auth.uid ();
end;
$$;

revoke all on function public.worker_resubmit_application (text, text, text, text, text, text, text, int, numeric, text, text, text) from public, anon;
grant execute on function public.worker_resubmit_application (text, text, text, text, text, text, text, int, numeric, text, text, text) to authenticated;
