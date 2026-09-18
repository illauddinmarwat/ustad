-- Remove the "customer/guest posts a job, workers browse & quote" feature.
--
-- The `jobs` table is shared spine for two origins: `customer_job` (this
-- feature, being removed) and `service_listing` (worker publishes a listing,
-- customer applies, worker accepts — kept). This migration revokes the
-- customer_job-specific write paths (anon guest posting, authenticated
-- customer posting, worker quoting, quote acceptance) and stops surfacing
-- open customer_job jobs to workers for browsing.
--
-- We intentionally do NOT drop the `jobs`/`quotes` tables, the `origin`
-- column/check constraint, or the anon-posting columns — they are either
-- still shared with the service_listing flow (`jobs`) or referenced by
-- historical ranking-signal functions (`quotes`, read-only from here on).
-- This keeps the change additive/reversible rather than a destructive drop
-- on a live database.

-- ─── 1) Anonymous guest job posting: fully revoked ───────────────────────

drop policy if exists "jobs_insert_anonymous_post" on public.jobs;
revoke insert on public.jobs from anon;

revoke execute on function public.get_anon_job (uuid) from anon, authenticated;
revoke execute on function public.claim_anon_job (uuid) from authenticated;
drop function if exists public.get_anon_job (uuid);
drop function if exists public.claim_anon_job (uuid);

-- ─── 2) Authenticated customer posting a job: revoked ────────────────────

drop policy if exists "jobs_insert_customer_post" on public.jobs;
drop policy if exists "jobs_customer_edit_draft_fields" on public.jobs;

-- Workers no longer browse an open jobs board; only their own participant
-- rows remain visible.
drop policy if exists "jobs_select_related" on public.jobs;
create policy "jobs_select_related"
  on public.jobs for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or worker_id = auth.uid ()
  );

-- ─── 3) Worker quoting on open customer_job jobs: revoked ────────────────

drop policy if exists "quotes_insert_worker_open_job" on public.quotes;
drop policy if exists "quotes_worker_update_own_pending" on public.quotes;
drop policy if exists "quotes_select_job_participants_or_open_quotees" on public.quotes;
create policy "quotes_select_job_participants"
  on public.quotes for select
  to authenticated
  using (
    worker_id = auth.uid ()
    or exists (select 1 from public.jobs j where j.id = quotes.job_id and j.customer_id = auth.uid ())
  );

revoke execute on function public.customer_accept_quote (uuid) from authenticated;
drop function if exists public.customer_accept_quote (uuid);
