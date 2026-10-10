-- Live job updates: both people's job pages update the moment the other person acts, and
-- the steps people cannot see on screen (a message, on the way, arrived) now raise a notification.

-- 1) Tell Supabase Realtime about the tables the job page listens to. Row-level security still decides
--    which rows each person receives.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['jobs', 'messages', 'job_realtime_states', 'quotes', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2) A message on an assigned job tells the other person.
create or replace function public._notify_job_message ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  target uuid;
  snippet text := left (new.body, 80);
begin
  select * into j from public.jobs where id = new.job_id;
  if not found or j.worker_id is null then
    return new;
  end if;
  target := case when new.sender_id = j.customer_id then j.worker_id else j.customer_id end;
  if target is null or target = new.sender_id then
    return new;
  end if;
  perform public._notify_text (
    target, 'job_message', j.id,
    'New message', 'نیا پیغام',
    snippet, snippet
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_job_message on public.messages;
create trigger trg_notify_job_message
  after insert on public.messages
  for each row execute function public._notify_job_message ();

-- 3) On the way / arrived tells the customer (Work is done sends its own notification, so no extra "arrived" then).
create or replace function public._notify_en_route ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  was boolean := case when tg_op = 'INSERT' then false else old.is_en_route end;
begin
  if new.is_en_route is not distinct from was then
    return new;
  end if;
  select * into j from public.jobs where id = new.job_id;
  if not found then
    return new;
  end if;
  if new.is_en_route then
    perform public._notify_text (
      j.customer_id, 'worker_en_route', j.id,
      'The Ustad is on the way', 'استاد راستے میں ہے',
      'You can follow them on the map: ' || j.title,
      'آپ نقشے پر انہیں دیکھ سکتے ہیں: ' || j.title
    );
  elsif j.worker_done_at is null then
    perform public._notify_text (
      j.customer_id, 'worker_arrived', j.id,
      'The Ustad has arrived', 'استاد پہنچ گیا ہے',
      'Your Ustad has arrived: ' || j.title,
      'آپ کا استاد پہنچ گیا ہے: ' || j.title
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_en_route on public.job_realtime_states;
create trigger trg_notify_en_route
  after insert or update of is_en_route on public.job_realtime_states
  for each row execute function public._notify_en_route ();

-- 4) Push on Android: use the high-importance channel the app creates, so the phone plays a sound.
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
          'to', t.token, 'title', p_title, 'body', p_body, 'data', p_data,
          'sound', 'default', 'priority', 'high', 'channelId', 'ustad-alerts'
        )
      );
    exception when others then
      null; -- push must never break the action that triggered it
    end;
  end loop;
end;
$$;

revoke all on function public._push_to_user (uuid, text, text, jsonb) from public, anon, authenticated;
