-- Sample data for the admin panel (Job Activity, Payments, Hisab, Approvals, Posted jobs).
-- TEST/STAGING data on the phase1 seed accounts. Every row has an id starting 'a5a5a5a5-'.
-- Skips itself (no error) if the seed accounts are missing. To remove, run the CLEANUP block below.

do $seed$
begin
  if (select count(*) from auth.users
      where email ~ '^(worker([1-9]|10)|customer[1-6])@ustad\.com$') < 16 then
    raise notice 'sample admin data skipped: seed accounts not found';
    return;
  end if;


-- ─── 0) Remove any previous run ──────────────────────────────────────────
delete from public.commission_events where note like 'sample%';
delete from public.commission_events where ledger_id in (
  select id from public.worker_commission_ledger where job_id::text like 'a5a5a5a5-%');
delete from public.worker_commission_ledger where job_id::text like 'a5a5a5a5-%';
delete from public.admin_job_events where job_id::text like 'a5a5a5a5-%';
delete from public.payment_ledger where job_id::text like 'a5a5a5a5-%';
delete from public.quotes where job_id::text like 'a5a5a5a5-%';
delete from public.jobs where id::text like 'a5a5a5a5-%';

-- ─── 2) Worker approvals: two pending, one rejected ──────────────────────
update public.profiles set city = 'Lahore', phone = '0300-1112223' where id = (select id from auth.users where email = 'worker8@ustad.com');
update public.profiles set city = 'Karachi', phone = '0311-2223334' where id = (select id from auth.users where email = 'worker9@ustad.com');
update public.profiles set city = 'Islamabad', phone = '0322-3334445' where id = (select id from auth.users where email = 'worker10@ustad.com');

update public.worker_profiles set
  approval_status = 'pending', rejection_reason = null,
  cnic_number = '35202-1234567-1', years_experience = 6, rate_pkr = 1500, rate_unit = 'day',
  working_hours = '9am - 6pm', bio = 'Tiling and floor work, 6 years on residential sites.',
  cnic_front_url = 'sample/cnic-front-1.jpg', cnic_back_url = 'sample/cnic-back-1.jpg', photo_url = null
where user_id = (select id from auth.users where email = 'worker8@ustad.com');

update public.worker_profiles set
  approval_status = 'pending', rejection_reason = null,
  cnic_number = '42101-7654321-9', years_experience = 3, rate_pkr = 900, rate_unit = 'hour',
  working_hours = '10am - 8pm', bio = 'Appliance repair: washing machines, fridges, microwaves.',
  cnic_front_url = 'sample/cnic-front-2.jpg', cnic_back_url = 'sample/cnic-back-2.jpg', photo_url = null
where user_id = (select id from auth.users where email = 'worker9@ustad.com');

update public.worker_profiles set
  approval_status = 'rejected', rejection_reason = 'CNIC photo is blurry. Please upload a clear photo of both sides.',
  cnic_number = '61101-1122334-5', years_experience = 10, rate_pkr = 2000, rate_unit = 'day',
  working_hours = '8am - 5pm', bio = 'Roofing and waterproofing.',
  cnic_front_url = 'sample/cnic-front-3.jpg', cnic_back_url = 'sample/cnic-back-3.jpg'
where user_id = (select id from auth.users where email = 'worker10@ustad.com');

-- ─── 3) Posted jobs (Posted jobs page): 3 customers + 1 guest ────────────
insert into public.jobs (id, customer_id, title, description, category, status, origin, city, location_text,
                         budget_min_pkr, budget_max_pkr, created_at) values
 ('a5a5a5a5-0000-0000-0000-000000000001', (select id from auth.users where email = 'customer1@ustad.com'), 'Need electrician for full house wiring',
  'Ground floor rewiring, 6 rooms. Materials provided.', 'Electrical', 'open', 'customer_job', 'Lahore', 'DHA Phase 5', 30000, 45000, now() - interval '3 hours'),
 ('a5a5a5a5-0000-0000-0000-000000000002', (select id from auth.users where email = 'customer2@ustad.com'), 'Bathroom tiles replacement',
  'About 40 sq ft. Need a quote and timeline.', 'Tiling', 'quoted', 'customer_job', 'Karachi', 'Gulshan-e-Iqbal', 15000, 25000, now() - interval '1 day'),
 ('a5a5a5a5-0000-0000-0000-000000000003', (select id from auth.users where email = 'customer3@ustad.com'), 'Kitchen sink leaking',
  'Under-sink pipe leaking since morning.', 'Plumbing', 'open', 'customer_job', 'Islamabad', 'F-10', 2000, 5000, now() - interval '5 hours');

insert into public.jobs (id, customer_id, posted_by_anon, anon_post_token, title, description, category, status, origin, city, created_at) values
 ('a5a5a5a5-0000-0000-0000-000000000004', null, true, gen_random_uuid(), 'EARN 5000/DAY WORK FROM HOME',
  'Message this number for details 0300-0000000', 'Handyman', 'open', 'customer_job', 'Lahore', now() - interval '30 minutes');

insert into public.quotes (job_id, worker_id, amount_pkr, message, status) values
 ('a5a5a5a5-0000-0000-0000-000000000001', (select id from auth.users where email = 'worker2@ustad.com'), 38000, 'Can start Monday.', 'pending'),
 ('a5a5a5a5-0000-0000-0000-000000000001', (select id from auth.users where email = 'worker5@ustad.com'), 41000, 'Includes fittings.', 'pending'),
 ('a5a5a5a5-0000-0000-0000-000000000002', (select id from auth.users where email = 'worker8@ustad.com'), 19000, 'Two-day job.', 'pending');

-- ─── 4) Direct / assigned / finished jobs for Job Activity + Payments ────
-- id suffix: 11 disputed, 12 payment pending, 13-16 closed (paid), 17 refunded, 18 assigned
insert into public.jobs (id, customer_id, worker_id, title, description, category, status, origin, city, target_worker_id, created_at) values
 ('a5a5a5a5-0000-0000-0000-000000000011', (select id from auth.users where email = 'customer1@ustad.com'), (select id from auth.users where email = 'worker2@ustad.com'), 'Fix kitchen wiring', 'Short circuit in kitchen.', 'Electrical', 'disputed', 'customer_job', 'Lahore', (select id from auth.users where email = 'worker2@ustad.com'), now() - interval '2 days'),
 ('a5a5a5a5-0000-0000-0000-000000000012', (select id from auth.users where email = 'customer2@ustad.com'), (select id from auth.users where email = 'worker3@ustad.com'), 'AC service x2', 'Two split ACs.', 'AC Service', 'payment_pending', 'customer_job', 'Karachi', null, now() - interval '1 day'),
 ('a5a5a5a5-0000-0000-0000-000000000013', (select id from auth.users where email = 'customer3@ustad.com'), (select id from auth.users where email = 'worker1@ustad.com'), 'Geyser installation', 'Install 50L geyser.', 'Plumbing', 'closed', 'customer_job', 'Islamabad', (select id from auth.users where email = 'worker1@ustad.com'), now() - interval '20 days'),
 ('a5a5a5a5-0000-0000-0000-000000000014', (select id from auth.users where email = 'customer4@ustad.com'), (select id from auth.users where email = 'worker1@ustad.com'), 'Pipe leak repair', 'Bathroom pipe.', 'Plumbing', 'closed', 'customer_job', 'Lahore', null, now() - interval '12 days'),
 ('a5a5a5a5-0000-0000-0000-000000000015', (select id from auth.users where email = 'customer5@ustad.com'), (select id from auth.users where email = 'worker6@ustad.com'), 'Wall painting', '2 rooms.', 'Painting', 'closed', 'customer_job', 'Lahore', (select id from auth.users where email = 'worker6@ustad.com'), now() - interval '9 days'),
 ('a5a5a5a5-0000-0000-0000-000000000016', (select id from auth.users where email = 'customer6@ustad.com'), (select id from auth.users where email = 'worker7@ustad.com'), 'Door frame carpentry', 'Replace 2 frames.', 'Carpentry', 'closed', 'customer_job', 'Karachi', null, now() - interval '35 days'),
 ('a5a5a5a5-0000-0000-0000-000000000017', (select id from auth.users where email = 'customer1@ustad.com'), (select id from auth.users where email = 'worker4@ustad.com'), 'Deep cleaning', 'Whole flat.', 'Cleaning', 'closed', 'customer_job', 'Lahore', null, now() - interval '6 days'),
 ('a5a5a5a5-0000-0000-0000-000000000018', (select id from auth.users where email = 'customer2@ustad.com'), (select id from auth.users where email = 'worker5@ustad.com'), 'Shelf mounting', '4 shelves.', 'Handyman', 'assigned', 'customer_job', 'Karachi', (select id from auth.users where email = 'worker5@ustad.com'), now() - interval '4 hours');

-- Payments. Paid rows fire the commission trigger (15% fee, due in 7 days).
insert into public.payment_ledger (id, job_id, amount_pkr, fee_pkr, payer_id, payee_id, method, status, transaction_id, worker_confirmed, commission_pct, note, created_at) values
 ('a5a5a5a5-1000-0000-0000-000000000011', 'a5a5a5a5-0000-0000-0000-000000000011', 4500, 675, (select id from auth.users where email = 'customer1@ustad.com'), (select id from auth.users where email = 'worker2@ustad.com'), 'jazzcash', 'disputed', 'JC88213409', false, 15, 'Customer says paid, worker says not received.', now() - interval '1 day'),
 ('a5a5a5a5-1000-0000-0000-000000000012', 'a5a5a5a5-0000-0000-0000-000000000012', 3200, 480, (select id from auth.users where email = 'customer2@ustad.com'), (select id from auth.users where email = 'worker3@ustad.com'), 'cash', 'pending', null, false, 15, null, now() - interval '20 hours'),
 ('a5a5a5a5-1000-0000-0000-000000000013', 'a5a5a5a5-0000-0000-0000-000000000013', 6000, 900, (select id from auth.users where email = 'customer3@ustad.com'), (select id from auth.users where email = 'worker1@ustad.com'), 'easypaisa', 'paid', 'EP12984411', true, 15, null, now() - interval '19 days'),
 ('a5a5a5a5-1000-0000-0000-000000000014', 'a5a5a5a5-0000-0000-0000-000000000014', 1800, 270, (select id from auth.users where email = 'customer4@ustad.com'), (select id from auth.users where email = 'worker1@ustad.com'), 'cash', 'paid', null, true, 15, null, now() - interval '11 days'),
 ('a5a5a5a5-1000-0000-0000-000000000015', 'a5a5a5a5-0000-0000-0000-000000000015', 12000, 1800, (select id from auth.users where email = 'customer5@ustad.com'), (select id from auth.users where email = 'worker6@ustad.com'), 'bank', 'paid', 'BK5540091', true, 15, null, now() - interval '8 days'),
 ('a5a5a5a5-1000-0000-0000-000000000016', 'a5a5a5a5-0000-0000-0000-000000000016', 9500, 1425, (select id from auth.users where email = 'customer6@ustad.com'), (select id from auth.users where email = 'worker7@ustad.com'), 'cash', 'paid', null, true, 15, null, now() - interval '34 days'),
 ('a5a5a5a5-1000-0000-0000-000000000017', 'a5a5a5a5-0000-0000-0000-000000000017', 5000, 750, (select id from auth.users where email = 'customer1@ustad.com'), (select id from auth.users where email = 'worker4@ustad.com'), 'cash', 'refunded', null, true, 15, 'Refunded after helpline call.', now() - interval '5 days');

-- ─── 5) Hisab: age the commission rows the trigger just created ──────────
update public.worker_commission_ledger set due_date = current_date + 3
  where job_id = 'a5a5a5a5-0000-0000-0000-000000000014';                       -- not yet due
update public.worker_commission_ledger set due_date = current_date - 4, status = 'overdue'
  where job_id = 'a5a5a5a5-0000-0000-0000-000000000013';                       -- 1-7 late
update public.worker_commission_ledger set due_date = current_date - 15, status = 'overdue', warned_at = now() - interval '8 days'
  where job_id = 'a5a5a5a5-0000-0000-0000-000000000015';                       -- 8-30 late, warned
update public.worker_commission_ledger set due_date = current_date - 45, status = 'overdue', warned_at = now() - interval '35 days'
  where job_id = 'a5a5a5a5-0000-0000-0000-000000000016';                       -- 30+ late

update public.worker_profiles set commission_suspended = true where user_id = (select id from auth.users where email = 'worker7@ustad.com');
insert into public.commission_events (ledger_id, worker_id, kind, amount_pkr, note)
  select l.id, l.worker_id, 'overdue', l.commission_pkr, 'sample' from public.worker_commission_ledger l
  where l.job_id in ('a5a5a5a5-0000-0000-0000-000000000013','a5a5a5a5-0000-0000-0000-000000000015','a5a5a5a5-0000-0000-0000-000000000016');
insert into public.commission_events (ledger_id, worker_id, kind, note)
  select l.id, l.worker_id, 'deactivated', 'sample: 30+ days overdue' from public.worker_commission_ledger l
  where l.job_id = 'a5a5a5a5-0000-0000-0000-000000000016';

-- ─── 6) Job Activity feed (the status trigger only fires on UPDATE) ──────
insert into public.admin_job_events (job_id, kind, detail, created_at) values
 ('a5a5a5a5-0000-0000-0000-000000000011', 'accepted', '{}', now() - interval '2 days'),
 ('a5a5a5a5-0000-0000-0000-000000000011', 'payment_pending', '{}', now() - interval '30 hours'),
 ('a5a5a5a5-0000-0000-0000-000000000011', 'disputed', '{}', now() - interval '1 day'),
 ('a5a5a5a5-0000-0000-0000-000000000012', 'accepted', '{}', now() - interval '1 day'),
 ('a5a5a5a5-0000-0000-0000-000000000012', 'payment_pending', '{}', now() - interval '20 hours'),
 ('a5a5a5a5-0000-0000-0000-000000000013', 'closed', '{}', now() - interval '19 days'),
 ('a5a5a5a5-0000-0000-0000-000000000015', 'closed', '{}', now() - interval '8 days'),
 ('a5a5a5a5-0000-0000-0000-000000000017', 'dispute_resolved', '{"note":"Refunded after helpline call."}', now() - interval '5 days'),
 ('a5a5a5a5-0000-0000-0000-000000000018', 'accepted', '{}', now() - interval '4 hours');
end
$seed$;

-- ─── CLEANUP (run to remove everything above) ────────────────────────────
-- begin;
--   delete from public.commission_events where ledger_id in (select id from public.worker_commission_ledger where job_id::text like 'a5a5a5a5-%');
--   delete from public.commission_events where note like 'sample%';
--   delete from public.worker_commission_ledger where job_id::text like 'a5a5a5a5-%';
--   delete from public.admin_job_events where job_id::text like 'a5a5a5a5-%';
--   delete from public.payment_ledger where job_id::text like 'a5a5a5a5-%';
--   delete from public.quotes where job_id::text like 'a5a5a5a5-%';
--   delete from public.jobs where id::text like 'a5a5a5a5-%';
--   update public.worker_profiles set approval_status = 'approved', rejection_reason = null, commission_suspended = false
--     where user_id in (select id from auth.users where email in ('worker7@ustad.com','worker8@ustad.com','worker9@ustad.com','worker10@ustad.com'));
-- commit;
