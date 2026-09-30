-- Admin view of how each job was priced (docs/quote-commission-plan.md, Phase 3): the customer price, the
-- Ustad's own price and the commission, for the job's accepted quote. Admin only; customers and workers
-- never get this function. Jobs whose accepted quote has no `quote_pricing` row (old quotes, budget
-- accepted as-is, markup off) return no Ustad price and `marked_up = false`.

create or replace function public.admin_job_pricing (p_job_ids uuid[])
returns table (
  job_id uuid,
  customer_price_pkr numeric,
  ustad_price_pkr numeric,
  commission_pkr numeric,
  commission_pct numeric,
  marked_up boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  return query
  select q.job_id, q.amount_pkr, qp.base_amount_pkr,
         case when qp.quote_id is null then null else q.amount_pkr - qp.base_amount_pkr end,
         qp.commission_pct, qp.quote_id is not null
  from public.quotes q
  left join public.quote_pricing qp on qp.quote_id = q.id
  where q.job_id = any (coalesce (p_job_ids, '{}')) and q.status = 'accepted';
end;
$$;

revoke execute on function public.admin_job_pricing (uuid[]) from public, anon;
grant execute on function public.admin_job_pricing (uuid[]) to authenticated;
