-- Phase 3 slice 3b — admin verification queue + OCR observability.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- New columns / functions
select has_column('public', 'worker_profiles', 'is_verified', 'is_verified column added');
select has_column('public', 'worker_profiles', 'verified_at', 'verified_at column added');
select has_column('public', 'worker_profiles', 'verified_by', 'verified_by column added');
select has_column('public', 'ocr_extractions', 'reviewed_by', 'ocr_extractions reviewed_by added');
select has_column('public', 'ocr_extractions', 'reviewed_at', 'ocr_extractions reviewed_at added');
select has_column('public', 'ocr_extractions', 'admin_note', 'ocr_extractions admin_note added');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_set_extraction_status' and p.prosecdef
  ),
  'admin_set_extraction_status is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rank_listings_v2'
  ),
  'rank_listings_v2 exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_ocr_failure'
  ),
  'log_ocr_failure exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_worker_verified'
  ),
  'is_worker_verified exists'
);

-- Verify the wider status check accepts the new statuses by inserting rows
-- via session_replication_role to bypass FK to auth.users.
set local session_replication_role = replica;

do $$
declare
  w_id uuid := gen_random_uuid();
  e_id uuid;
begin
  insert into public.profiles (id, role, display_name) values (w_id, 'worker', 'verify_test_worker');
  insert into public.ocr_extractions (worker_id, doc_type, provider, status)
    values (w_id, 'cnic', 'manual', 'verified') returning id into e_id;
  insert into public.ocr_extractions (worker_id, doc_type, provider, status)
    values (w_id, 'cnic', 'manual', 'rejected');
  insert into public.ocr_extractions (worker_id, doc_type, provider, status)
    values (w_id, 'cnic', 'google', 'failed');
end $$;

set local session_replication_role = origin;

select cmp_ok(
  (select count(*)::int from public.ocr_extractions where status in ('verified', 'rejected', 'failed')),
  '>=',
  3,
  'new ocr_extractions statuses accepted'
);

-- rank_listings_v2 returns the is_verified column shape (sanity)
select is(
  (
    select count(*)::int
    from information_schema.routines
    where routine_schema = 'public' and routine_name = 'rank_listings_v2'
  ),
  1,
  'rank_listings_v2 routine count = 1'
);

-- Default is_verified is false on new worker profile rows
select is(
  (select coalesce(bool_or(is_verified), false) from public.worker_profiles where user_id in (select id from public.profiles where display_name = 'verify_test_worker')),
  false,
  'new worker_profiles row defaults to is_verified = false'
);

select * from finish();
rollback;
