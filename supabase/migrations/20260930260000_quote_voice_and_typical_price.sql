-- Voice notes on quotes and in the pre-assignment thread, and the "typical price" hint
-- (docs/job-quotes-plan.md, Phase 3). Behind `quote_upgrades_enabled` (seeded false in Phase 1).
--
--   * A voice note is at most 30 seconds, stored in the private bucket `quote-voice` at
--     {sender_id}/{job_id}/{file}, and readable only by the two people involved (the Ustad and the job's
--     signed-in owner) and admins. A guest poster has no account and cannot upload or hear voice notes.
--   * Quote voice notes sit on the quote; thread voice notes are thread messages with no text.
--   * `typical_price` shows a range from paid jobs in the last 90 days, only when there are enough of them
--     (setting `typical_price_min_jobs`, default 10), so it never reveals a single job.

-- ─── 1) Private bucket ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-voice', 'quote-voice', false, 3145728,
  array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/3gpp', 'audio/webm']
)
on conflict (id) do nothing;

-- ─── 2) Columns ──────────────────────────────────────────────────────────

alter table public.quotes
  add column if not exists audio_path text,
  add column if not exists audio_seconds int check (audio_seconds is null or audio_seconds between 1 and 30);

alter table public.job_thread_messages
  add column if not exists audio_path text,
  add column if not exists audio_seconds int check (audio_seconds is null or audio_seconds between 1 and 30);

alter table public.job_thread_messages alter column body drop not null;
alter table public.job_thread_messages drop constraint if exists job_thread_messages_body_check;
alter table public.job_thread_messages drop constraint if exists job_thread_messages_text_or_voice;
alter table public.job_thread_messages
  add constraint job_thread_messages_text_or_voice
  check ((body is not null and char_length (body) between 1 and 1000) or audio_path is not null);

-- ─── 3) Who may hear a file ──────────────────────────────────────────────

create or replace function public._quote_voice_readable (p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    auth.uid () is not null and (
      exists (
        select 1 from public.quotes q
        join public.jobs j on j.id = q.job_id
        where q.audio_path = p_name
          and (q.worker_id = auth.uid () or j.customer_id = auth.uid () or public._is_admin ())
      )
      or exists (
        select 1 from public.job_thread_messages m
        join public.jobs j on j.id = m.job_id
        where m.audio_path = p_name
          and (m.worker_id = auth.uid () or j.customer_id = auth.uid () or public._is_admin ())
      )
    ),
    false
  );
$$;

revoke all on function public._quote_voice_readable (text) from public, anon;
grant execute on function public._quote_voice_readable (text) to authenticated;

create policy "quote_voice_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'quote-voice' and public._quote_voice_readable (name));

-- Uploading is allowed for whoever may take part in the job (its owner or a matching approved worker).
create policy "quote_voice_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quote-voice'
    and (storage.foldername (name))[1] = auth.uid ()::text
    and public._job_media_path_job (name) is not null
    and public._job_media_viewer (public._job_media_path_job (name))
  );

create policy "quote_voice_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'quote-voice'
    and ((storage.foldername (name))[1] = auth.uid ()::text
         or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  );

-- ─── 4) Attach a voice note to my quote ──────────────────────────────────

create or replace function public.worker_attach_quote_voice (p_quote_id uuid, p_path text, p_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
begin
  if not public._quote_upgrades_enabled () then
    raise exception 'quote details are not enabled';
  end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or q.worker_id is distinct from auth.uid () then
    raise exception 'quote not found';
  end if;
  if q.status <> 'pending' then
    raise exception 'quote is not pending';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 30 then
    raise exception 'a voice note can be up to 30 seconds';
  end if;
  if p_path is null or p_path not like auth.uid ()::text || '/' || q.job_id::text || '/%' then
    raise exception 'invalid file path';
  end if;
  update public.quotes set audio_path = p_path, audio_seconds = p_seconds where id = q.id;
end;
$$;

revoke execute on function public.worker_attach_quote_voice (uuid, text, int) from public, anon;
grant execute on function public.worker_attach_quote_voice (uuid, text, int) to authenticated;

-- ─── 5) Voice notes in the thread (signed-in people only) ────────────────

create or replace function public.post_thread_voice (p_job_id uuid, p_worker_id uuid, p_path text, p_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid ();
  j public.jobs%rowtype;
  role_ text;
begin
  if uid is null then
    raise exception 'sign in to send a voice note';
  end if;
  if not public._quote_upgrades_enabled () then
    raise exception 'quote details are not enabled';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 30 then
    raise exception 'a voice note can be up to 30 seconds';
  end if;
  if p_path is null or p_path not like uid::text || '/' || p_job_id::text || '/%' then
    raise exception 'invalid file path';
  end if;

  select * into j from public.jobs where id = p_job_id;
  if not found or j.origin <> 'customer_job' then
    raise exception 'job not found';
  end if;
  if j.status not in ('open', 'quoted') then
    raise exception 'this job is no longer open';
  end if;

  if j.customer_id = uid then
    role_ := 'customer';
    if not public._is_approved_worker (p_worker_id) then
      raise exception 'worker not found';
    end if;
  elsif uid = p_worker_id and public._is_approved_worker (uid)
        and (j.target_worker_id is null or j.target_worker_id = uid) then
    role_ := 'worker';
  else
    raise exception 'not allowed';
  end if;

  insert into public.job_thread_messages (job_id, worker_id, sender_role, body, audio_path, audio_seconds)
  values (p_job_id, p_worker_id, role_, null, p_path, p_seconds);

  if role_ = 'worker' then
    perform public._notify (j.customer_id, 'thread_message', j.id, jsonb_build_object ('job_title', j.title));
  else
    perform public._notify (p_worker_id, 'thread_message', j.id, jsonb_build_object ('job_title', j.title));
  end if;
end;
$$;

revoke execute on function public.post_thread_voice (uuid, uuid, text, int) from public, anon;
grant execute on function public.post_thread_voice (uuid, uuid, text, int) to authenticated;

-- The thread now also returns the voice note columns (body is empty for a voice note).
drop function if exists public.list_thread (uuid, uuid, uuid);

create or replace function public.list_thread (p_job_id uuid, p_worker_id uuid, p_token uuid default null)
returns table (id uuid, sender_role text, body text, created_at timestamptz, audio_path text, audio_seconds int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select jj.* into j from public.jobs jj where jj.id = p_job_id;
  if not found then
    return;
  end if;
  if not (public._can_manage_job (j, p_token) or coalesce (auth.uid () = p_worker_id, false)) then
    return;
  end if;
  return query
  select m.id, m.sender_role, m.body, m.created_at, m.audio_path, m.audio_seconds
  from public.job_thread_messages m
  where m.job_id = p_job_id and m.worker_id = p_worker_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.list_thread (uuid, uuid, uuid) to anon, authenticated;

-- ─── 6) Quotes with their voice notes ────────────────────────────────────

drop function if exists public.job_quotes (uuid, uuid);

create or replace function public.job_quotes (p_job_id uuid, p_token uuid default null)
returns table (
  quote_id uuid, worker_id uuid, worker_name text, amount_pkr numeric, message text,
  status text, created_at timestamptz, avg_rating numeric, review_count int,
  is_verified boolean, years_experience int, photo_url text,
  price_type text, available_from date, completed_jobs bigint,
  audio_path text, audio_seconds int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = p_job_id;
  if not found or not public._can_manage_job (j, p_token) then
    return;
  end if;
  return query
  select q.id, q.worker_id, p.display_name, q.amount_pkr, q.message, q.status, q.created_at,
         wp.avg_rating, wp.review_count, coalesce (wp.is_verified, false), wp.years_experience, wp.photo_url,
         q.price_type, q.available_from,
         (select count (*) from public.jobs d
            where d.worker_id = q.worker_id and d.status in ('completed', 'payment_pending', 'disputed', 'closed')),
         q.audio_path, q.audio_seconds
  from public.quotes q
  join public.profiles p on p.id = q.worker_id
  left join public.worker_profiles wp on wp.user_id = q.worker_id
  where q.job_id = p_job_id and q.status in ('pending', 'accepted')
  order by q.amount_pkr asc, q.created_at asc;
end;
$$;

grant execute on function public.job_quotes (uuid, uuid) to anon, authenticated;

-- ─── 7) Typical price ────────────────────────────────────────────────────
-- 25th, 50th and 75th percentile of what customers paid for jobs of this category in the last 90 days,
-- rounded to the nearest Rs 10. City first, then the whole category, and nothing when there are too few jobs.

create or replace function public.typical_price (p_category text, p_city text default null)
returns table (scope text, sample_size int, low_pkr numeric, median_pkr numeric, high_pkr numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  min_n int := public._direct_request_setting_int ('typical_price_min_jobs', 10);
  r record;
begin
  if coalesce (btrim (p_category), '') = '' then
    return;
  end if;

  if coalesce (btrim (p_city), '') <> '' then
    select count (*)::int as n,
           percentile_cont (0.25) within group (order by l.amount_pkr) as p25,
           percentile_cont (0.5) within group (order by l.amount_pkr) as p50,
           percentile_cont (0.75) within group (order by l.amount_pkr) as p75
      into r
      from public.payment_ledger l
      join public.jobs j on j.id = l.job_id
      where l.status = 'paid' and l.created_at > now () - interval '90 days'
        and j.category = p_category and lower (j.city) = lower (btrim (p_city));
    if r.n >= min_n then
      scope := 'city';
      sample_size := r.n;
      low_pkr := round (r.p25 / 10) * 10;
      median_pkr := round (r.p50 / 10) * 10;
      high_pkr := round (r.p75 / 10) * 10;
      return next;
      return;
    end if;
  end if;

  select count (*)::int as n,
         percentile_cont (0.25) within group (order by l.amount_pkr) as p25,
         percentile_cont (0.5) within group (order by l.amount_pkr) as p50,
         percentile_cont (0.75) within group (order by l.amount_pkr) as p75
    into r
    from public.payment_ledger l
    join public.jobs j on j.id = l.job_id
    where l.status = 'paid' and l.created_at > now () - interval '90 days' and j.category = p_category;
  if r.n >= min_n then
    scope := 'category';
    sample_size := r.n;
    low_pkr := round (r.p25 / 10) * 10;
    median_pkr := round (r.p50 / 10) * 10;
    high_pkr := round (r.p75 / 10) * 10;
    return next;
  end if;
end;
$$;

revoke execute on function public.typical_price (text, text) from public;
grant execute on function public.typical_price (text, text) to anon, authenticated;
