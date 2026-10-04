-- Completion handshake: the Ustad says the work is done, the customer confirms.
--
-- Before this, either side could finish an assigned job with one tap, so an Ustad could close a job the
-- customer had not seen finished. Now:
--   1. the Ustad taps "Work done"            -> jobs.worker_done_at is set, the customer is told
--   2. the customer confirms                  -> status becomes 'completed' (payment, review and everything
--                                                that already reads 'completed' work as before)
--      or says "Not finished yet" with a note -> worker_done_at is cleared, the Ustad is told
--   3. no answer for 48 hours (setting `completion_auto_confirm_hours`) -> confirmed automatically
-- The customer may also confirm at any time without waiting for the Ustad. An Ustad can no longer complete a job.

alter table public.jobs
  add column if not exists worker_done_at timestamptz,
  add column if not exists completion_note text;

-- A small notification helper for the new messages (the shared text function lists fixed kinds).
create or replace function public._notify_text (
  p_user uuid, p_kind text, p_job uuid,
  p_title_en text, p_title_ur text, p_body_en text, p_body_ur text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lang text;
  ttl text;
  bdy text;
  payload jsonb;
begin
  if p_user is null then
    return;
  end if;
  select preferred_language into lang from public.profiles where id = p_user;
  if coalesce (lang, 'ur') = 'en' then
    ttl := p_title_en; bdy := p_body_en;
  else
    ttl := p_title_ur; bdy := p_body_ur;
  end if;
  payload := jsonb_build_object ('kind', p_kind, 'job_id', p_job);
  insert into public.notifications (user_id, kind, job_id, title, body, data)
  values (p_user, p_kind, p_job, ttl, bdy, payload);
  perform public._push_to_user (p_user, ttl, bdy, payload);
exception when others then
  raise warning 'notification failed: %', sqlerrm;
end;
$$;

revoke all on function public._notify_text (uuid, text, uuid, text, text, text, text) from public, anon, authenticated;

-- 1) The Ustad says the work is done.
create or replace function public.worker_mark_work_done (p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs where id = p_job_id for update;
  if j.worker_id is distinct from auth.uid () then
    raise exception 'worker only';
  end if;
  if j.status <> 'assigned' then
    raise exception 'job must be assigned';
  end if;
  if j.worker_done_at is not null then
    return;
  end if;
  update public.jobs set worker_done_at = now (), completion_note = null, updated_at = now () where id = p_job_id;
  perform public._notify_text (
    j.customer_id, 'work_done', j.id,
    'Work is done', 'کام مکمل ہو گیا',
    'The Ustad says the work is done. Please check and confirm: ' || j.title,
    'استاد کہتا ہے کام مکمل ہو گیا ہے۔ دیکھ کر تصدیق کریں: ' || j.title
  );
end;
$$;

revoke all on function public.worker_mark_work_done (uuid) from public, anon;
grant execute on function public.worker_mark_work_done (uuid) to authenticated;

-- 2) The customer confirms. (Same name as before, so the app and older tests keep working; only the customer may.)
create or replace function public.mark_job_completed (job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs where id = job_id for update;
  if j.customer_id is distinct from auth.uid () and j.worker_id is distinct from auth.uid () then
    raise exception 'not a participant';
  end if;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'only the customer can confirm the work is done';
  end if;
  if j.status <> 'assigned' then
    raise exception 'job must be assigned';
  end if;
  update public.jobs set status = 'completed', updated_at = now () where id = job_id;
  perform public._notify_text (
    j.worker_id, 'work_confirmed', j.id,
    'Customer confirmed', 'کسٹمر نے تصدیق کر دی',
    'The customer confirmed the work is done: ' || j.title,
    'کسٹمر نے تصدیق کر دی کہ کام مکمل ہے: ' || j.title
  );
end;
$$;

grant execute on function public.mark_job_completed (uuid) to authenticated;

-- 2b) The customer says it is not finished yet, with a short note for the Ustad.
create or replace function public.customer_reject_completion (p_job_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  note text := nullif (left (trim (coalesce (p_note, '')), 300), '');
begin
  select * into strict j from public.jobs where id = p_job_id for update;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.status <> 'assigned' or j.worker_done_at is null then
    raise exception 'nothing to reject';
  end if;
  if note is not null and public._contains_contact (note) then
    raise exception 'remove phone numbers and links from the note';
  end if;
  update public.jobs set worker_done_at = null, completion_note = note, updated_at = now () where id = p_job_id;
  perform public._notify_text (
    j.worker_id, 'completion_rejected', j.id,
    'Not finished yet', 'ابھی کام مکمل نہیں',
    coalesce ('The customer says it is not finished: ' || note, 'The customer says the work is not finished yet: ' || j.title),
    coalesce ('کسٹمر کہتا ہے کام مکمل نہیں: ' || note, 'کسٹمر کہتا ہے کام ابھی مکمل نہیں: ' || j.title)
  );
end;
$$;

revoke all on function public.customer_reject_completion (uuid, text) from public, anon;
grant execute on function public.customer_reject_completion (uuid, text) to authenticated;

-- 3) No answer in time: the work is taken as confirmed.
create or replace function public.auto_confirm_completions ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hours int := greatest (public._direct_request_setting_int ('completion_auto_confirm_hours', 48), 1);
  r record;
  n int := 0;
begin
  for r in
    select id, customer_id, worker_id, title from public.jobs
    where status = 'assigned' and worker_done_at is not null
      and worker_done_at < now () - make_interval (hours => hours)
    for update skip locked
  loop
    update public.jobs set status = 'completed', updated_at = now () where id = r.id;
    perform public._notify_text (
      r.customer_id, 'auto_completed', r.id,
      'Job marked complete', 'کام مکمل شمار ہوا',
      'No reply for ' || hours || ' hours, so the work is counted as done: ' || r.title,
      to_char (hours, 'FM999') || ' گھنٹے تک جواب نہیں آیا، اس لیے کام مکمل شمار ہوا: ' || r.title
    );
    perform public._notify_text (
      r.worker_id, 'auto_completed', r.id,
      'Job marked complete', 'کام مکمل شمار ہوا',
      'The customer did not reply, so the work is counted as done: ' || r.title,
      'کسٹمر نے جواب نہیں دیا، اس لیے کام مکمل شمار ہوا: ' || r.title
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.auto_confirm_completions () from public, anon, authenticated;
grant execute on function public.auto_confirm_completions () to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule ('auto-confirm-completions', '*/30 * * * *', 'select public.auto_confirm_completions ()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end
$$;
