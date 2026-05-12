-- Phase 3 slice 3c: ranking signal backfill helpers.
-- Computes response_rate, completion_rate, last_active_at on worker_profiles
-- from existing quotes / messages / jobs history. Additive, idempotent.
--
-- Definitions:
--   response_rate    = quotes status='accepted' / quotes total           (last 30 days)
--                      → null when total < 1 (insufficient data)
--   completion_rate  = jobs status='completed' / jobs assigned+completed (last 30 days)
--                      → null when total < 1
--   last_active_at   = max(message.created_at, quote.created_at, job.updated_at)

create or replace function public.compute_worker_signals (p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q_total int;
  q_accept int;
  j_total int;
  j_done int;
  resp numeric;
  comp numeric;
  last_at timestamptz;
begin
  -- Response rate from worker quotes within last 30 days.
  select count(*)::int,
         count(*) filter (where status = 'accepted')::int
    into q_total, q_accept
  from public.quotes
  where worker_id = p_user_id
    and created_at >= now() - interval '30 days';

  if q_total > 0 then
    resp := round((q_accept::numeric / q_total::numeric)::numeric, 3);
  else
    resp := null;
  end if;

  -- Completion rate from jobs assigned to this worker within last 30 days.
  select count(*) filter (where status in ('assigned', 'completed'))::int,
         count(*) filter (where status = 'completed')::int
    into j_total, j_done
  from public.jobs
  where worker_id = p_user_id
    and updated_at >= now() - interval '30 days';

  if j_total > 0 then
    comp := round((j_done::numeric / j_total::numeric)::numeric, 3);
  else
    comp := null;
  end if;

  -- Last active = freshest signal across messages/quotes/jobs.
  select greatest(
    coalesce((select max(created_at) from public.messages where sender_id = p_user_id), '-infinity'::timestamptz),
    coalesce((select max(created_at) from public.quotes   where worker_id = p_user_id), '-infinity'::timestamptz),
    coalesce((select max(updated_at) from public.jobs     where worker_id = p_user_id), '-infinity'::timestamptz)
  ) into last_at;

  if last_at = '-infinity'::timestamptz then last_at := null; end if;

  insert into public.worker_profiles (user_id, response_rate, completion_rate, last_active_at)
  values (p_user_id, resp, comp, last_at)
  on conflict (user_id) do update
    set response_rate   = excluded.response_rate,
        completion_rate = excluded.completion_rate,
        last_active_at  = excluded.last_active_at,
        updated_at      = now();
end;
$$;

grant execute on function public.compute_worker_signals (uuid) to authenticated;

-- Admin-only batch backfill. Skips workers with no recent activity to keep
-- the batch tight. Returns count of workers updated.
create or replace function public.admin_backfill_worker_signals ()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  cnt int := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  for uid in
    select distinct worker_id from public.quotes where worker_id is not null
    union
    select distinct worker_id from public.jobs   where worker_id is not null
  loop
    perform public.compute_worker_signals(uid);
    cnt := cnt + 1;
  end loop;
  return cnt;
end;
$$;

grant execute on function public.admin_backfill_worker_signals () to authenticated;

-- Workers can refresh their own signals on demand (e.g. after submitting work).
create or replace function public.refresh_my_worker_signals ()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.compute_worker_signals(auth.uid ());
end;
$$;

grant execute on function public.refresh_my_worker_signals () to authenticated;
