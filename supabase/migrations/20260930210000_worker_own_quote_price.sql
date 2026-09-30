-- Quote commission markup (docs/quote-commission-plan.md, Phase 2): worker-facing views show the
-- worker's OWN price (what they typed and earn), never the customer price, so re-sending a quote
-- cannot compound the markup and the Ustad is never confused by a number they did not enter.
--   * my_quote_pkr / amount_pkr = the price the Ustad typed (X); for quotes with no pricing row
--     (old quotes, flag off) it is the stored amount, as before.
--   * get_board_job also returns my_customer_price_pkr, so the form can say "customer sees Rs 115".
-- Customer-facing functions are untouched and keep returning the customer price.

create or replace function public.list_open_jobs (
  p_category text default null,
  p_city text default null,
  p_limit int default 30
)
returns table (
  id uuid, title text, description text, category text, city text, location_text text,
  budget_min_pkr numeric, budget_max_pkr numeric, preferred_time text,
  created_at timestamptz, expires_at timestamptz, quote_count bigint, my_quote_pkr numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cats text[];
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  select wp.categories into cats from public.worker_profiles wp where wp.user_id = auth.uid ();

  return query
  select j.id, j.title, j.description, j.category, j.city, j.location_text,
         j.budget_min_pkr, j.budget_max_pkr, j.preferred_time, j.created_at, j.expires_at,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status = 'pending'),
         (select coalesce (qp.base_amount_pkr, q.amount_pkr) from public.quotes q
            left join public.quote_pricing qp on qp.quote_id = q.id
            where q.job_id = j.id and q.worker_id = auth.uid () and q.status = 'pending'
            order by q.created_at desc limit 1)
  from public.jobs j
  where j.origin = 'customer_job'
    and j.status in ('open', 'quoted')
    and j.worker_id is null
    and (j.target_worker_id is null or j.target_worker_id = auth.uid ())
    and j.expires_at > now ()
    and j.category = any (coalesce (cats, '{}'))
    and (p_category is null or j.category = p_category)
    and (p_city is null or lower (j.city) = lower (p_city))
    and (j.customer_id is null or j.customer_id <> auth.uid ())
  order by j.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke execute on function public.list_open_jobs (text, text, int) from public, anon;
grant execute on function public.list_open_jobs (text, text, int) to authenticated;

-- New column, so the old definition is dropped first.
drop function if exists public.get_board_job (uuid);

create function public.get_board_job (p_job_id uuid)
returns table (
  id uuid, title text, description text, category text, city text, location_text text,
  budget_min_pkr numeric, budget_max_pkr numeric, preferred_time text,
  created_at timestamptz, expires_at timestamptz, status text, quote_count bigint, my_quote_pkr numeric,
  my_customer_price_pkr numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cats text[];
begin
  if not public._is_approved_worker (auth.uid ()) then
    raise exception 'approved workers only';
  end if;
  select wp.categories into cats from public.worker_profiles wp where wp.user_id = auth.uid ();

  return query
  select j.id, j.title, j.description, j.category, j.city, j.location_text,
         j.budget_min_pkr, j.budget_max_pkr, j.preferred_time, j.created_at, j.expires_at, j.status,
         (select count (*) from public.quotes q where q.job_id = j.id and q.status = 'pending'),
         (select coalesce (qp.base_amount_pkr, q.amount_pkr) from public.quotes q
            left join public.quote_pricing qp on qp.quote_id = q.id
            where q.job_id = j.id and q.worker_id = auth.uid () and q.status = 'pending'
            order by q.created_at desc limit 1),
         (select q.amount_pkr from public.quotes q
            where q.job_id = j.id and q.worker_id = auth.uid () and q.status = 'pending'
            order by q.created_at desc limit 1)
  from public.jobs j
  where j.id = p_job_id
    and j.origin = 'customer_job'
    and j.status in ('open', 'quoted')
    and (j.target_worker_id is null or j.target_worker_id = auth.uid ())
    and j.category = any (coalesce (cats, '{}'));
end;
$$;

revoke execute on function public.get_board_job (uuid) from public, anon;
grant execute on function public.get_board_job (uuid) to authenticated;

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
         coalesce (qp.base_amount_pkr, q.amount_pkr), q.message, q.status, q.created_at
  from public.quotes q
  join public.jobs j on j.id = q.job_id
  left join public.quote_pricing qp on qp.quote_id = q.id
  where q.worker_id = auth.uid ()
    -- Direct-request quotes already show as the request itself.
    and j.target_worker_id is distinct from auth.uid ()
  order by q.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke execute on function public.list_my_quotes (int) from public, anon;
grant execute on function public.list_my_quotes (int) to authenticated;
