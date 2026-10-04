-- When the Ustad says the work is done they are no longer on the way: stop the "en route" state, so the customer's
-- tracking and the Ustad's phone stop sharing the position.
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
  update public.job_realtime_states set is_en_route = false where job_id = p_job_id and is_en_route;
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
