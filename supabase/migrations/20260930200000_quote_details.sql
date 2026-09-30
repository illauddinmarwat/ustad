-- Richer quotes (docs/job-quotes-plan.md, Phase 1): a price type (fixed, or an estimate to be confirmed
-- after inspection), the date the worker can start, and comparison data for the customer.
--
-- Deliberately independent of how the price is computed: `worker_send_quote` calls the existing
-- `worker_quote_job` (whatever its current definition is) and then records the new details on the quote
-- it returned. Everything sits behind `quote_upgrades_enabled` (seeded false); with it off, nothing changes
-- and old app builds keep working.

insert into public.app_settings (key, value) values
  ('quote_upgrades_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public._quote_upgrades_enabled ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce (
    (select (s.value #>> '{}') = 'true' from public.app_settings s where s.key = 'quote_upgrades_enabled'),
    false
  );
$$;

revoke all on function public._quote_upgrades_enabled () from public, anon, authenticated;

alter table public.quotes
  add column if not exists price_type text not null default 'fixed' check (price_type in ('fixed', 'estimate')),
  add column if not exists available_from date;

-- Send a quote with its details. Same rules and errors as `worker_quote_job`, plus:
--   * price type: 'fixed' or 'estimate' (final price confirmed after the worker inspects the job)
--   * available_from: the day the worker can start, from yesterday (time zones) up to 30 days ahead
create or replace function public.worker_send_quote (
  p_job_id uuid,
  p_amount_pkr numeric,
  p_message text,
  p_price_type text,
  p_available_from date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  qid uuid;
begin
  if not public._quote_upgrades_enabled () then
    raise exception 'quote details are not enabled';
  end if;
  if p_price_type is null or p_price_type not in ('fixed', 'estimate') then
    raise exception 'price type must be fixed or estimate';
  end if;
  if p_available_from is null then
    raise exception 'please say when you can start';
  end if;
  if p_available_from < current_date - 1 or p_available_from > current_date + 30 then
    raise exception 'start date must be within the next 30 days';
  end if;

  qid := public.worker_quote_job (p_job_id, p_amount_pkr, p_message);
  update public.quotes set price_type = p_price_type, available_from = p_available_from where id = qid;
  return qid;
end;
$$;

revoke execute on function public.worker_send_quote (uuid, numeric, text, text, date) from public, anon;
grant execute on function public.worker_send_quote (uuid, numeric, text, text, date) to authenticated;

-- Quotes on a job with what a customer needs to compare them. Same columns as before plus
-- price_type, available_from and completed_jobs; old app builds ignore the extras.
drop function if exists public.job_quotes (uuid, uuid);

create or replace function public.job_quotes (p_job_id uuid, p_token uuid default null)
returns table (
  quote_id uuid, worker_id uuid, worker_name text, amount_pkr numeric, message text,
  status text, created_at timestamptz, avg_rating numeric, review_count int,
  is_verified boolean, years_experience int, photo_url text,
  price_type text, available_from date, completed_jobs bigint
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
            where d.worker_id = q.worker_id and d.status in ('completed', 'payment_pending', 'disputed', 'closed'))
  from public.quotes q
  join public.profiles p on p.id = q.worker_id
  left join public.worker_profiles wp on wp.user_id = q.worker_id
  where q.job_id = p_job_id and q.status in ('pending', 'accepted')
  order by q.amount_pkr asc, q.created_at asc;
end;
$$;

grant execute on function public.job_quotes (uuid, uuid) to anon, authenticated;
