-- Fix: `customer_cancel_job(job_id)` always failed with
--   ERROR 42702: column reference "job_id" is ambiguous
-- because the parameter is named `job_id` and the body filtered `quotes.job_id`
-- without qualifying it. The parameter name is kept (clients call it as
-- `customer_cancel_job({ job_id })`); the column references are now qualified.
--
-- Found by the seeded-user pgTAP tests (customer cancels their own request).

create or replace function public.customer_cancel_job (job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
begin
  select * into strict j from public.jobs jj where jj.id = customer_cancel_job.job_id for update;
  if j.customer_id is distinct from auth.uid () then
    raise exception 'not job owner';
  end if;
  if j.status not in ('open', 'quoted', 'pending_customer_confirm') then
    raise exception 'cannot cancel from this state';
  end if;
  update public.quotes q set status = 'rejected' where q.job_id = j.id and q.status = 'pending';
  update public.jobs jj set status = 'cancelled', updated_at = now () where jj.id = j.id;
end;
$$;

revoke execute on function public.customer_cancel_job (uuid) from public, anon;
grant execute on function public.customer_cancel_job (uuid) to authenticated;
