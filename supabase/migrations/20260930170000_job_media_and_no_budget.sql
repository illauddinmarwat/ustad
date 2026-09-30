-- Job media (photos now; audio and video reuse the same tables in later phases) and removal of the
-- customer budget from job posting. See docs/job-media-plan.md (M1, M2, M3, M6).
--
-- * Media is for signed-in customers only (M1).
-- * Approved workers whose categories match an open job can see its media so they can price it (M2).
-- * The flag `job_media_enabled` ships off; enable it in a separate migration after verification.

-- ─── 1) Flag and limits ──────────────────────────────────────────────────

insert into public.app_settings (key, value) values
  ('job_media_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public._job_media_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'job_media_enabled'),
    false
  );
$$;

revoke all on function public._job_media_enabled () from public, anon, authenticated;

-- ─── 2) Table ────────────────────────────────────────────────────────────

create table if not exists public.job_media (
  id uuid primary key default gen_random_uuid (),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('photo', 'audio', 'video')),
  path text not null unique,
  bytes int not null check (bytes > 0),
  duration_s int check (duration_s is null or duration_s > 0),
  created_at timestamptz not null default now (),
  removed_at timestamptz
);

create index if not exists idx_job_media_job on public.job_media (job_id) where removed_at is null;

-- Read and written only through the functions below.
alter table public.job_media enable row level security;
revoke all on public.job_media from anon, authenticated;

-- ─── 3) Who can see a job's media ────────────────────────────────────────

create or replace function public._job_media_viewer (p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    auth.uid () is not null and exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and j.origin = 'customer_job'
        and (
          j.customer_id = auth.uid ()
          or j.worker_id = auth.uid ()
          or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
          or (
            j.status in ('open', 'quoted')
            and j.worker_id is null
            and j.expires_at > now ()
            and (j.target_worker_id is null or j.target_worker_id = auth.uid ())
            and public._is_approved_worker (auth.uid ())
            and exists (
              select 1 from public.worker_profiles wp
              where wp.user_id = auth.uid () and j.category = any (wp.categories)
            )
          )
        )
    ),
    false
  );
$$;

revoke all on function public._job_media_viewer (uuid) from public, anon;
grant execute on function public._job_media_viewer (uuid) to authenticated;

-- The signed-in customer owns this job and it can still take media.
create or replace function public._owns_open_job (p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    auth.uid () is not null and exists (
      select 1 from public.jobs j
      where j.id = p_job_id
        and j.customer_id = auth.uid ()
        and j.origin = 'customer_job'
        and j.status in ('open', 'quoted')
        and j.worker_id is null
    ),
    false
  );
$$;

revoke all on function public._owns_open_job (uuid) from public, anon;
grant execute on function public._owns_open_job (uuid) to authenticated;

-- Storage paths look like {customer_id}/{job_id}/{file}; anything else yields null.
create or replace function public._job_media_path_job (p_name text)
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

revoke all on function public._job_media_path_job (text) from public, anon;
grant execute on function public._job_media_path_job (text) to authenticated;

create or replace function public._job_media_path_readable (p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    public._job_media_viewer (public._job_media_path_job (p_name))
    and exists (select 1 from public.job_media m where m.path = p_name and m.removed_at is null),
    false
  );
$$;

revoke all on function public._job_media_path_readable (text) from public, anon;
grant execute on function public._job_media_path_readable (text) to authenticated;

-- ─── 4) Private bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-media', 'job-media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "job_media_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'job-media' and public._job_media_path_readable (name));

create policy "job_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-media'
    and (storage.foldername (name))[1] = auth.uid ()::text
    and public._job_media_path_job (name) is not null
    and public._owns_open_job (public._job_media_path_job (name))
  );

create policy "job_media_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-media'
    and (
      (storage.foldername (name))[1] = auth.uid ()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
    )
  );

-- ─── 5) Functions the app calls ──────────────────────────────────────────

-- Register an uploaded file. Caps (M3): 4 photos, 1 audio (60 s), 1 video (30 s) per job.
create or replace function public.add_job_media (
  p_job_id uuid,
  p_kind text,
  p_path text,
  p_bytes int,
  p_duration_s int default null
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
    raise exception 'sign in to add media';
  end if;
  if not public._job_media_enabled () then
    raise exception 'job media is not enabled';
  end if;
  if not public._owns_open_job (p_job_id) then
    raise exception 'job not found or no longer open';
  end if;
  if p_kind not in ('photo', 'audio', 'video') then
    raise exception 'unknown media type';
  end if;
  if p_path is null or p_path not like uid::text || '/' || p_job_id::text || '/%' then
    raise exception 'invalid file path';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'invalid file size';
  end if;

  if p_kind = 'photo' then
    if p_bytes > 3145728 then raise exception 'photo is too large (max 3 MB)'; end if;
  elsif p_kind = 'audio' then
    if p_bytes > 3145728 then raise exception 'voice note is too large (max 3 MB)'; end if;
    if p_duration_s is null or p_duration_s > 60 then raise exception 'voice note can be up to 60 seconds'; end if;
  else
    if p_bytes > 26214400 then raise exception 'video is too large (max 25 MB)'; end if;
    if p_duration_s is null or p_duration_s > 30 then raise exception 'video can be up to 30 seconds'; end if;
  end if;

  select count (*) into n from public.job_media m
    where m.job_id = p_job_id and m.kind = p_kind and m.removed_at is null;
  if n >= (case when p_kind = 'photo' then 4 else 1 end) then
    raise exception 'limit reached for this media type';
  end if;

  insert into public.job_media (job_id, kind, path, bytes, duration_s)
  values (p_job_id, p_kind, p_path, p_bytes, p_duration_s)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.add_job_media (uuid, text, text, int, int) from public, anon;
grant execute on function public.add_job_media (uuid, text, text, int, int) to authenticated;

-- Mark a file removed; returns its path so the app can delete the stored object.
create or replace function public.remove_job_media (p_media_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.job_media%rowtype;
  j public.jobs%rowtype;
  is_admin boolean;
begin
  select * into m from public.job_media where id = p_media_id and removed_at is null;
  if not found then
    raise exception 'media not found';
  end if;
  select * into j from public.jobs where id = m.job_id;
  select exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') into is_admin;
  if not is_admin and j.customer_id is distinct from auth.uid () then
    raise exception 'media not found';
  end if;
  update public.job_media set removed_at = now () where id = m.id;
  return m.path;
end;
$$;

revoke execute on function public.remove_job_media (uuid) from public, anon;
grant execute on function public.remove_job_media (uuid) to authenticated;

create or replace function public.list_job_media (p_job_id uuid)
returns table (id uuid, kind text, path text, bytes int, duration_s int, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._job_media_viewer (p_job_id) then
    return;
  end if;
  return query
  select m.id, m.kind, m.path, m.bytes, m.duration_s, m.created_at
  from public.job_media m
  where m.job_id = p_job_id and m.removed_at is null
  order by m.kind, m.created_at;
end;
$$;

revoke execute on function public.list_job_media (uuid) from public, anon;
grant execute on function public.list_job_media (uuid) to authenticated;

-- Counts for the job board ("2 photos, 1 voice note"); only for jobs the caller may see.
create or replace function public.job_media_counts (p_job_ids uuid[])
returns table (job_id uuid, photos int, audios int, videos int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select m.job_id,
         (count (*) filter (where m.kind = 'photo'))::int,
         (count (*) filter (where m.kind = 'audio'))::int,
         (count (*) filter (where m.kind = 'video'))::int
  from public.job_media m
  where m.job_id = any (coalesce (p_job_ids, '{}'))
    and m.removed_at is null
    and public._job_media_viewer (m.job_id)
  group by m.job_id;
end;
$$;

revoke execute on function public.job_media_counts (uuid[]) from public, anon;
grant execute on function public.job_media_counts (uuid[]) to authenticated;

-- ─── 6) post_job without a customer budget (M6) ──────────────────────────
-- Old signature removed so there is one function. The budget columns on `jobs` stay (nullable) so
-- jobs posted earlier keep showing theirs.

drop function if exists public.post_job (text, text, text, text, text, numeric, numeric, text);

create or replace function public.post_job (
  p_title text,
  p_description text,
  p_category text,
  p_city text default null,
  p_location_text text default null,
  p_preferred_time text default null
)
returns table (job_id uuid, guest_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  new_id uuid;
  tok uuid;
  n int;
  expiry_days int;
begin
  if not public._job_posting_enabled () then
    raise exception 'job posting is not enabled';
  end if;
  if coalesce (btrim (p_title), '') = '' or char_length (btrim (p_title)) > 120 then
    raise exception 'a title of up to 120 characters is required';
  end if;
  if char_length (btrim (coalesce (p_description, ''))) < 10 then
    raise exception 'please describe the job (at least 10 characters)';
  end if;
  if coalesce (btrim (p_category), '') = '' then
    raise exception 'category is required';
  end if;
  if public._contains_contact (p_title) or public._contains_contact (p_description)
     or public._contains_contact (p_location_text) or public._contains_contact (p_preferred_time) then
    raise exception 'please do not include phone numbers or links; they are shared after a worker accepts';
  end if;

  if uid is not null then
    if not exists (select 1 from public.profiles p where p.id = uid and p.role = 'customer' and p.status = 'active') then
      raise exception 'only active customers can post jobs';
    end if;
    select count (*) into n from public.jobs j
      where j.customer_id = uid and j.target_worker_id is null and j.created_at > now () - interval '1 day';
    if n >= public._direct_request_setting_int ('job_post_daily_limit', 10) then
      raise exception 'daily job limit reached';
    end if;
  else
    select count (*) into n from public.jobs j
      where j.posted_by_anon and j.created_at > now () - interval '1 hour';
    if n >= public._direct_request_setting_int ('guest_job_hourly_cap', 30) then
      raise exception 'too many guest jobs right now, please sign in or try later';
    end if;
    tok := gen_random_uuid ();
  end if;

  expiry_days := public._direct_request_setting_int ('job_expiry_days', 7);

  insert into public.jobs (
    customer_id, title, description, category, status, origin, city, location_text,
    preferred_time, expires_at, posted_by_anon, anon_post_token
  ) values (
    uid, btrim (p_title), btrim (p_description), p_category, 'open', 'customer_job',
    nullif (btrim (coalesce (p_city, '')), ''), nullif (btrim (coalesce (p_location_text, '')), ''),
    nullif (btrim (coalesce (p_preferred_time, '')), ''),
    now () + make_interval (days => expiry_days), uid is null, tok
  ) returning id into new_id;

  return query select new_id, tok;
end;
$$;

revoke execute on function public.post_job (text, text, text, text, text, text) from public;
grant execute on function public.post_job (text, text, text, text, text, text) to anon, authenticated;

-- In-app help no longer mentions a budget.
update public.faqs
set answer_en = 'Tap "Post a job", describe the work in words and, if you like, add photos, and submit. You do not need an account to post text; sign in to add photos. Approved workers nearby see your job and send you quotes with their own prices, and you can ask them questions. To accept a quote you sign in or create an account. Phone numbers are shared only after you accept.',
    answer_ur = '"کام پوسٹ کریں" دبائیں، کام الفاظ میں بیان کریں اور چاہیں تو تصاویر شامل کریں، پھر جمع کرائیں۔ صرف تحریر پوسٹ کرنے کے لیے اکاؤنٹ ضروری نہیں؛ تصاویر شامل کرنے کے لیے لاگ ان کریں۔ قریبی منظور شدہ کارکن آپ کا کام دیکھ کر اپنی قیمت بھیجتے ہیں اور آپ ان سے سوال پوچھ سکتے ہیں۔ قیمت قبول کرنے کے لیے لاگ ان یا اکاؤنٹ بنائیں۔ فون نمبر قبول کرنے کے بعد ہی شیئر ہوتے ہیں۔'
where slug = 'how-to-post-job-quotes';
