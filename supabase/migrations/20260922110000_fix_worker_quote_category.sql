-- Follow-up to 20260922100000_sample_worker_inbox_data.sql: that migration put customer1's
-- (now hvac-only) sample quote on "Kitchen sink leaking" (category plumbing), which
-- get_board_job() correctly hides from a hvac worker (category mismatch), so the quote
-- screen showed "This job is no longer available." Move the quote to a new hvac posted job
-- instead. TEST/STAGING data. Ids prefixed b6b6b6b6-7; cleanup block at the bottom.

do $seed$
declare
  v_worker uuid;
  v_c5 uuid;
begin
  select id into v_worker from auth.users where email = 'customer1@ustad.com';
  select id into v_c5 from auth.users where email = 'customer5@ustad.com';

  if v_worker is null or v_c5 is null then
    raise notice 'fix skipped: accounts not found';
    return;
  end if;

  -- Remove the mismatched quote from the previous migration, if present.
  delete from public.quotes where id = 'b6b6b6b6-5000-0000-0000-000000000001';

  delete from public.quotes where id::text like 'b6b6b6b6-7%';
  delete from public.jobs where id::text like 'b6b6b6b6-7%';

  insert into public.jobs (
    id, customer_id, title, description, category, status, origin, city,
    budget_min_pkr, budget_max_pkr, created_at
  ) values (
    'b6b6b6b6-7000-0000-0000-000000000001', v_c5, 'AC gas refill and cleaning',
    'Split AC losing cooling, might need gas top-up.', 'hvac', 'open', 'customer_job', 'Karachi',
    2000, 3500, now() - interval '3 hours'
  );

  insert into public.quotes (id, job_id, worker_id, amount_pkr, message, status)
  values ('b6b6b6b6-7500-0000-0000-000000000001', 'b6b6b6b6-7000-0000-0000-000000000001', v_worker,
    2800, 'Can do gas top-up and full clean today.', 'pending');
end
$seed$;

-- ─── CLEANUP (run to remove everything above) ─────────────────────────────
-- begin;
--   delete from public.quotes where id::text like 'b6b6b6b6-7%';
--   delete from public.jobs where id::text like 'b6b6b6b6-7%';
-- commit;
