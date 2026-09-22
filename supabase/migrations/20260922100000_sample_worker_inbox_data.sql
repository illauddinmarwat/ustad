-- Sample worker-side data so the Inbox, job detail and tracking screens have something to show
-- for customer1@ustad.com after they use "Switch role -> Worker" (the app's own self-service toggle).
-- TEST/STAGING data. Every row this creates has an id starting 'b6b6b6b6-'; a cleanup block is at
-- the bottom. Skips itself (no error) if the seed accounts are missing.

do $seed$
declare
  v_worker uuid;
  v_c2 uuid;
  v_c3 uuid;
  v_c4 uuid;
  v_template uuid;
  v_kitchen_job uuid := 'a5a5a5a5-0000-0000-0000-000000000003'; -- "Kitchen sink leaking", from the admin sample data
begin
  select id into v_worker from auth.users where email = 'customer1@ustad.com';
  select id into v_c2 from auth.users where email = 'customer2@ustad.com';
  select id into v_c3 from auth.users where email = 'customer3@ustad.com';
  select id into v_c4 from auth.users where email = 'customer4@ustad.com';
  select id into v_template from public.service_templates where slug = 'split_ac_service';

  if v_worker is null or v_c2 is null or v_c3 is null or v_c4 is null or v_template is null then
    raise notice 'sample worker inbox data skipped: accounts or template not found';
    return;
  end if;

  -- ─── 0) Remove any previous run ─────────────────────────────────────────
  delete from public.quotes where id::text like 'b6b6b6b6-%';
  delete from public.admin_job_events where job_id::text like 'b6b6b6b6-%';
  delete from public.jobs where id::text like 'b6b6b6b6-%';
  delete from public.listing_applications where id::text like 'b6b6b6b6-%';
  delete from public.worker_service_listings where id::text like 'b6b6b6b6-%';

  -- ─── 1) Approve this account as a worker, so Services/My listings unblock ─
  insert into public.worker_profiles (
    user_id, bio, categories, avg_rating, review_count, cnic_number, years_experience,
    rate_pkr, rate_unit, working_hours, approval_status, is_available
  ) values (
    v_worker, 'AC servicing and repair, split and window units.', array['hvac'], 4.6, 8,
    '35202-9988776-3', 5, 2200, 'day', '9am - 7pm', 'approved', true
  )
  on conflict (user_id) do update set
    approval_status = 'approved', categories = excluded.categories, bio = excluded.bio,
    rate_pkr = excluded.rate_pkr, rate_unit = excluded.rate_unit, working_hours = excluded.working_hours;

  -- ─── 2) A listing, with one pending application on it ───────────────────
  insert into public.worker_service_listings (id, worker_id, template_id, headline, detail_text, price_pkr, status)
  values ('b6b6b6b6-1000-0000-0000-000000000001', v_worker, v_template,
    'Split AC cleaning and service', 'Indoor + outdoor unit clean, gas check.', 2200, 'active');

  insert into public.listing_applications (id, listing_id, customer_id, note, location_text, preferred_time, status)
  values ('b6b6b6b6-2000-0000-0000-000000000001', 'b6b6b6b6-1000-0000-0000-000000000001', v_c2,
    'Two split units, one not cooling well.', 'Gulshan-e-Iqbal, Karachi', 'This weekend', 'pending');

  -- ─── 3) A pending direct request targeting this worker ──────────────────
  insert into public.jobs (
    id, customer_id, target_worker_id, target_expires_at, title, description, category,
    status, origin, city, budget_pkr, preferred_time, created_at
  ) values (
    'b6b6b6b6-3000-0000-0000-000000000001', v_c3, v_worker, now() + interval '20 hours',
    'AC not cooling, need urgent check', 'Living room split AC, water dripping too.', 'hvac',
    'open', 'customer_job', 'Karachi', 3000, 'Today evening', now() - interval '40 minutes'
  );

  -- ─── 4) An active (assigned) job for this worker ─────────────────────────
  insert into public.jobs (
    id, customer_id, worker_id, target_worker_id, title, description, category,
    status, origin, city, created_at
  ) values (
    'b6b6b6b6-4000-0000-0000-000000000001', v_c4, v_worker, v_worker,
    'Install new split AC unit', 'New 1.5 ton unit, bracket already fitted.', 'hvac',
    'assigned', 'customer_job', 'Karachi', now() - interval '1 day'
  );
  insert into public.admin_job_events (job_id, kind, detail, created_at)
  values ('b6b6b6b6-4000-0000-0000-000000000001', 'accepted', '{}', now() - interval '1 day');

  -- ─── 5) A pending quote this worker sent on a posted job ─────────────────
  if exists (select 1 from public.jobs where id = v_kitchen_job) then
    insert into public.quotes (id, job_id, worker_id, amount_pkr, message, status)
    values ('b6b6b6b6-5000-0000-0000-000000000001', v_kitchen_job, v_worker, 2500,
      'Can fix the same day, bringing parts.', 'pending')
    on conflict do nothing;
  end if;
end
$seed$;

-- ─── CLEANUP (run to remove everything above) ─────────────────────────────
-- begin;
--   delete from public.quotes where id::text like 'b6b6b6b6-%';
--   delete from public.admin_job_events where job_id::text like 'b6b6b6b6-%';
--   delete from public.jobs where id::text like 'b6b6b6b6-%';
--   delete from public.listing_applications where id::text like 'b6b6b6b6-%';
--   delete from public.worker_service_listings where id::text like 'b6b6b6b6-%';
--   -- To also undo the approval, set this account's role/approval back yourself in the app/admin panel.
-- commit;
