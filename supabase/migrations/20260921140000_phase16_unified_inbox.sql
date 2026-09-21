-- Phase 16: unified inbox.
--
-- The Inbox lists, for both roles, service applications (flow A), direct
-- requests (flow B), and posted jobs / quotes (flow C) in one place. Almost all
-- of it reads tables the caller can already see. The one gap is a worker's own
-- quotes: they need the job's title and status, and a worker cannot read jobs
-- they have only quoted on (the job board is served by functions). This adds a
-- read-only function for exactly that.

create or replace function public.list_my_quotes (p_limit int default 50)
returns table (
  quote_id uuid,
  job_id uuid,
  job_title text,
  job_category text,
  job_status text,
  job_expires_at timestamptz,
  amount_pkr numeric,
  message text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  return query
  select q.id, j.id, j.title, j.category, j.status, j.expires_at,
         q.amount_pkr, q.message, q.status, q.created_at
  from public.quotes q
  join public.jobs j on j.id = q.job_id
  where q.worker_id = auth.uid ()
    -- Direct-request quotes already show as the request itself.
    and j.target_worker_id is distinct from auth.uid ()
  order by q.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke execute on function public.list_my_quotes (int) from public, anon;
grant execute on function public.list_my_quotes (int) to authenticated;
