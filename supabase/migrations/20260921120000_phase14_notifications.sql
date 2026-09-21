-- Phase 14: notifications (in-app inbox + Expo push).
--
-- D5  Both push and in-app.
-- D15 Each notification is written in the recipient's chosen language
--     (`profiles.preferred_language`, 'ur' or 'en').
--
-- Everything runs inside the database so it deploys with migrations:
--   * triggers on jobs / quotes / listing_applications / job_contacts create
--     `notifications` rows (the in-app inbox),
--   * each row is also pushed to the recipient's devices through Expo's push API
--     using `pg_net` when that extension is installed. If it is not, or a push
--     fails, the in-app row is still created (push is best-effort).
-- Guest notifications (SMS / claim link) arrive with guest job posting.

-- ─── 1) Tables ───────────────────────────────────────────────────────────

create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'unknown',
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from anon, authenticated;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  job_id uuid references public.jobs (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_time on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid ());

-- Reads only; rows are created by triggers and marked read through the RPC below.
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;

-- ─── 2) Client RPCs ──────────────────────────────────────────────────────

create or replace function public.register_device_token (p_token text, p_platform text default 'unknown')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  if coalesce (btrim (p_token), '') = '' then
    raise exception 'token is required';
  end if;
  insert into public.device_tokens (token, user_id, platform)
  values (btrim (p_token), auth.uid (), coalesce (nullif (btrim (p_platform), ''), 'unknown'))
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now ();
end;
$$;

revoke execute on function public.register_device_token (text, text) from public, anon;
grant execute on function public.register_device_token (text, text) to authenticated;

create or replace function public.unregister_device_token (p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  delete from public.device_tokens where token = btrim (p_token) and user_id = auth.uid ();
end;
$$;

revoke execute on function public.unregister_device_token (text) from public, anon;
grant execute on function public.unregister_device_token (text) to authenticated;

-- Marks the given notifications (or all of the caller's, when null) as read.
create or replace function public.mark_notifications_read (p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  update public.notifications
    set read_at = now ()
    where user_id = auth.uid ()
      and read_at is null
      and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.mark_notifications_read (uuid[]) from public, anon;
grant execute on function public.mark_notifications_read (uuid[]) to authenticated;

-- ─── 3) Text in the recipient's language ─────────────────────────────────

create or replace function public._notification_text (p_kind text, p_lang text, p jsonb)
returns table (title text, body text)
language plpgsql
immutable
as $$
declare
  ur boolean := coalesce (p_lang, 'ur') <> 'en';
  job text := coalesce (p ->> 'job_title', '');
  amt text := coalesce (p ->> 'amount', '');
begin
  case p_kind
    when 'request_received' then
      title := case when ur then 'نئی درخواست' else 'New request' end;
      body  := case when ur then 'آپ کو ایک کام کی درخواست ملی: ' else 'You received a request: ' end || job;
    when 'quote_received' then
      title := case when ur then 'نئی قیمت' else 'New quote' end;
      body  := case when ur then 'کارکن نے قیمت بھیجی: روپے ' else 'A worker sent a quote: Rs ' end || amt || ' — ' || job;
    when 'job_assigned' then
      title := case when ur then 'کارکن نے قبول کر لیا' else 'A worker accepted' end;
      body  := case when ur then 'اپنا فون نمبر اور پتہ شامل کریں: ' else 'Add your phone number and address: ' end || job;
    when 'job_assigned_worker' then
      title := case when ur then 'کام آپ کو مل گیا' else 'You got the job' end;
      body  := case when ur then 'کسٹمر کی تفصیلات کا انتظار کریں: ' else 'Waiting for the customer''s details: ' end || job;
    when 'request_declined' then
      title := case when ur then 'درخواست مسترد' else 'Request declined' end;
      body  := case when ur then 'کارکن نے درخواست قبول نہیں کی: ' else 'The worker could not take: ' end || job;
    when 'request_cancelled' then
      title := case when ur then 'درخواست منسوخ' else 'Request cancelled' end;
      body  := case when ur then 'کسٹمر نے درخواست منسوخ کر دی: ' else 'The customer cancelled: ' end || job;
    when 'contact_shared' then
      title := case when ur then 'کسٹمر کی تفصیلات' else 'Customer details shared' end;
      body  := case when ur then 'اب آپ فون نمبر اور پتہ دیکھ سکتے ہیں: ' else 'You can now see the phone number and address: ' end || job;
    when 'job_completed' then
      title := case when ur then 'کام مکمل' else 'Work completed' end;
      body  := case when ur then 'نقد ادائیگی کریں اور ادا شدہ نشان زد کریں: ' else 'Pay in cash and mark as paid: ' end || job;
    when 'payment_marked' then
      title := case when ur then 'ادائیگی کی تصدیق کریں' else 'Confirm payment' end;
      body  := case when ur then 'کسٹمر نے ادا کرنے کا کہا ہے۔ رقم کی تصدیق کریں: ' else 'The customer says they paid. Confirm the amount: ' end || job;
    when 'job_closed' then
      title := case when ur then 'کام بند' else 'Job closed' end;
      body  := case when ur then 'ادائیگی کی تصدیق ہو گئی: ' else 'Payment confirmed: ' end || job;
    when 'job_disputed' then
      title := case when ur then 'ادائیگی میں مسئلہ' else 'Payment problem' end;
      body  := case when ur then 'براہ کرم استاد ہیلپ لائن پر کال کریں: ' else 'Please call the Ustad helpline: ' end || job;
    when 'application_received' then
      title := case when ur then 'نئی درخواست' else 'New application' end;
      body  := case when ur then 'آپ کی سروس کے لیے درخواست آئی: ' else 'Someone applied to your service: ' end || job;
    when 'application_accepted' then
      title := case when ur then 'درخواست قبول' else 'Application accepted' end;
      body  := case when ur then 'اپنی بکنگ کی تصدیق کریں: ' else 'Confirm your booking: ' end || job;
    when 'application_declined' then
      title := case when ur then 'درخواست مسترد' else 'Application declined' end;
      body  := case when ur then 'کارکن نے درخواست قبول نہیں کی: ' else 'The worker declined: ' end || job;
    else
      title := case when ur then 'استاد' else 'Ustad' end;
      body  := job;
  end case;
  return next;
end;
$$;

revoke all on function public._notification_text (text, text, jsonb) from public, anon, authenticated;

-- ─── 4) Push (best effort) ───────────────────────────────────────────────

create or replace function public._push_to_user (p_user uuid, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  for t in select token from public.device_tokens where user_id = p_user loop
    begin
      perform net.http_post (
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        body := jsonb_build_object (
          'to', t.token, 'title', p_title, 'body', p_body, 'data', p_data, 'sound', 'default'
        )
      );
    exception when others then
      null; -- push must never break the action that triggered it
    end;
  end loop;
end;
$$;

revoke all on function public._push_to_user (uuid, text, text, jsonb) from public, anon, authenticated;

-- Creates the in-app row (in the recipient's language) and pushes it.
create or replace function public._notify (p_user uuid, p_kind text, p_job uuid, p jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lang text;
  txt record;
  payload jsonb;
begin
  if p_user is null then
    return;
  end if;
  select preferred_language into lang from public.profiles where id = p_user;
  select * into txt from public._notification_text (p_kind, lang, p);
  payload := jsonb_build_object ('kind', p_kind, 'job_id', p_job) || coalesce (p, '{}'::jsonb);

  insert into public.notifications (user_id, kind, job_id, title, body, data)
  values (p_user, p_kind, p_job, txt.title, txt.body, payload);

  perform public._push_to_user (p_user, txt.title, txt.body, payload);
exception when others then
  raise warning 'notification failed: %', sqlerrm;
end;
$$;

revoke all on function public._notify (uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ─── 5) Triggers ─────────────────────────────────────────────────────────

create or replace function public._notify_job_change ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb := jsonb_build_object ('job_title', new.title);
  by_customer boolean;
begin
  if tg_op = 'INSERT' then
    if new.target_worker_id is not null and new.origin = 'customer_job' then
      perform public._notify (new.target_worker_id, 'request_received', new.id, p);
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  case new.status
    when 'assigned' then
      perform public._notify (new.customer_id, 'job_assigned', new.id, p);
      perform public._notify (new.worker_id, 'job_assigned_worker', new.id, p);
    when 'cancelled' then
      -- Tell the other side. A cancel by the customer notifies the worker; a
      -- decline (or system cancel) notifies the customer.
      by_customer := auth.uid () is not distinct from new.customer_id;
      if by_customer then
        perform public._notify (coalesce (new.worker_id, new.target_worker_id), 'request_cancelled', new.id, p);
      elsif new.target_worker_id is not null then
        perform public._notify (new.customer_id, 'request_declined', new.id, p);
      end if;
    when 'completed' then
      perform public._notify (new.customer_id, 'job_completed', new.id, p);
    when 'payment_pending' then
      perform public._notify (new.worker_id, 'payment_marked', new.id, p);
    when 'closed' then
      perform public._notify (new.customer_id, 'job_closed', new.id, p);
      perform public._notify (new.worker_id, 'job_closed', new.id, p);
    when 'disputed' then
      perform public._notify (new.customer_id, 'job_disputed', new.id, p);
      perform public._notify (new.worker_id, 'job_disputed', new.id, p);
    else
      null;
  end case;
  return new;
end;
$$;

drop trigger if exists trg_notify_job_change on public.jobs;
create trigger trg_notify_job_change
  after insert or update of status on public.jobs
  for each row execute function public._notify_job_change ();

create or replace function public._notify_quote ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select * into j from public.jobs where id = new.job_id;
  perform public._notify (
    j.customer_id, 'quote_received', j.id,
    jsonb_build_object ('job_title', j.title, 'amount', new.amount_pkr)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_quote on public.quotes;
create trigger trg_notify_quote
  after insert on public.quotes
  for each row execute function public._notify_quote ();

create or replace function public._notify_application ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.worker_service_listings%rowtype;
  p jsonb;
begin
  select * into l from public.worker_service_listings where id = new.listing_id;
  p := jsonb_build_object ('job_title', coalesce (l.headline, ''));
  if tg_op = 'INSERT' then
    perform public._notify (l.worker_id, 'application_received', null, p);
  elsif new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public._notify (new.customer_id, 'application_accepted', null, p);
    elsif new.status = 'declined' then
      perform public._notify (new.customer_id, 'application_declined', null, p);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_application on public.listing_applications;
create trigger trg_notify_application
  after insert or update of status on public.listing_applications
  for each row execute function public._notify_application ();

create or replace function public._notify_contact_shared ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into j from public.jobs where id = new.job_id;
  perform public._notify (j.worker_id, 'contact_shared', j.id, jsonb_build_object ('job_title', j.title));
  return new;
end;
$$;

drop trigger if exists trg_notify_contact_shared on public.job_contacts;
create trigger trg_notify_contact_shared
  after insert on public.job_contacts
  for each row execute function public._notify_contact_shared ();

-- ─── 6) In-app help ──────────────────────────────────────────────────────

insert into public.faqs (slug, category, question_en, question_ur, answer_en, answer_ur, search_terms) values
  (
    'notifications',
    'getting-started',
    'How will I know when something happens?',
    'مجھے کیسے پتہ چلے گا کہ کچھ ہوا ہے؟',
    'You get a notification when a worker accepts, quotes, or declines, when you are asked to share your details, and when payment is marked or confirmed. Allow notifications on your phone, and open the bell on the home screen to see them all.',
    'جب کارکن قبول کرے، قیمت بھیجے یا مسترد کرے، جب آپ سے تفصیلات مانگی جائیں، اور جب ادائیگی نشان زد یا تصدیق ہو تو آپ کو اطلاع ملتی ہے۔ اپنے فون پر اطلاعات کی اجازت دیں، اور سب دیکھنے کے لیے ہوم اسکرین پر گھنٹی کھولیں۔',
    array['notification', 'alert', 'push', 'bell']
  )
on conflict (slug) do nothing;
