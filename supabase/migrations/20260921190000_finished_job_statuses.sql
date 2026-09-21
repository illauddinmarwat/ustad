-- A finished job now keeps moving: completed -> payment_pending -> closed (or disputed).
--
-- Older code only accepted `completed`, which silently broke things once the cash-payment
-- flow existed: a customer could not leave a review, add completion photos, or submit a
-- quality survey or guarantee claim after paying, and worker completion-rate signals
-- stopped counting jobs that had been paid. "Finished" now means any of:
--   completed, payment_pending, disputed, closed
--
-- Found by the seeded-user tests.

-- ─── Reviews and completion photos (row-level security) ──────────────────

drop policy if exists "reviews_insert_customer_completed" on public.reviews;
create policy "reviews_insert_customer_completed"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = reviews.job_id
        and j.customer_id = auth.uid ()
        and j.status in ('completed', 'payment_pending', 'disputed', 'closed')
    )
    and reviewee_id = (select worker_id from public.jobs where id = reviews.job_id)
  );

drop policy if exists "job_completion_photos_insert_participants_completed" on public.job_completion_photos;
create policy "job_completion_photos_insert_participants_completed"
  on public.job_completion_photos for insert
  to authenticated
  with check (
    uploader_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = job_completion_photos.job_id
        and j.status in ('completed', 'payment_pending', 'disputed', 'closed')
        and (j.customer_id = auth.uid () or j.worker_id = auth.uid ())
    )
  );

-- ─── Functions: patch the status test in place ───────────────────────────
-- Each function is rewritten from its current definition, so nothing else in it changes.
-- Fails loudly if the expected text is missing, and skips a function that is already patched.

create or replace function pg_temp.patch_fn (p_name text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  def text;
  newdef text;
begin
  select pg_get_functiondef (p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name;

  if def is null then
    raise exception 'function public.% not found', p_name;
  end if;
  if position (p_to in def) > 0 then
    return; -- already patched
  end if;
  newdef := replace (def, p_from, p_to);
  if newdef = def then
    raise exception 'expected text not found in public.%', p_name;
  end if;
  execute newdef;
end
$$;

select pg_temp.patch_fn (
  'submit_job_quality_survey',
  'j.status <> ''completed''',
  'j.status not in (''completed'', ''payment_pending'', ''disputed'', ''closed'')');

select pg_temp.patch_fn (
  'submit_guarantee_claim_intake',
  'j.status <> ''completed''',
  'j.status not in (''completed'', ''payment_pending'', ''disputed'', ''closed'')');

-- Completion rate: of jobs given to the worker (assigned or later), how many were finished.
select pg_temp.patch_fn (
  'compute_worker_signals',
  'count(*) filter (where status in (''assigned'', ''completed''))::int',
  'count(*) filter (where status in (''assigned'', ''completed'', ''payment_pending'', ''disputed'', ''closed''))::int');

select pg_temp.patch_fn (
  'compute_worker_signals',
  'count(*) filter (where status = ''completed'')::int',
  'count(*) filter (where status in (''completed'', ''payment_pending'', ''disputed'', ''closed''))::int');
