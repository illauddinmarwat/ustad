-- Phase 3 ranking + OCR scaffold tests (additive only).
-- Run locally with: `supabase test db`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- New tables/columns/functions exist
select has_table('public', 'app_settings', 'app_settings table exists');
select has_table('public', 'ocr_extractions', 'ocr_extractions table exists');

select has_column('public', 'worker_profiles', 'response_rate', 'response_rate column added');
select has_column('public', 'worker_profiles', 'completion_rate', 'completion_rate column added');
select has_column('public', 'worker_profiles', 'last_active_at', 'last_active_at column added');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rank_listings' and p.prosecdef
  ),
  'rank_listings is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_app_setting'
  ),
  'get_app_setting exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_set_app_setting' and p.prosecdef
  ),
  'admin_set_app_setting is security definer'
);

-- Default flags installed and disabled
select is(
  (select value from public.app_settings where key = 'phase3_ranking_enabled'),
  'false'::jsonb,
  'phase3_ranking_enabled defaults to false'
);

select is(
  (select value from public.app_settings where key = 'phase3_ocr_enabled'),
  'false'::jsonb,
  'phase3_ocr_enabled defaults to false'
);

-- Seed two listings with no ranking signals to exercise deterministic fallback.
-- session_replication_role = replica disables FK enforcement (auth.users) and
-- triggers (handle_new_user, set_updated_at) inside this rolled-back tx.
set local session_replication_role = replica;

do $$
declare
  w_id uuid := gen_random_uuid();
  tpl_id uuid;
begin
  insert into public.profiles (id, role, display_name) values (w_id, 'worker', 'phase3_test_worker');
  insert into public.service_templates (slug, category, title)
    values ('phase3-test-tpl', 'phase3_test_cat', 'Phase3 Test')
    returning id into tpl_id;

  insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status, created_at)
    values (w_id, tpl_id, 'older listing', 1000, 'active', now() - interval '5 days');
  insert into public.worker_service_listings (worker_id, template_id, headline, price_pkr, status, created_at)
    values (w_id, tpl_id, 'newer listing', 1000, 'active', now() - interval '1 day');
end $$;

set local session_replication_role = origin;

-- Newer listing should rank first when no other signals exist
select is(
  (
    select array_agg(headline order by ord)
    from (
      select headline, row_number() over (order by score desc, created_at desc) as ord
      from public.rank_listings('phase3_test_cat', 10)
    ) t
  ),
  array['newer listing', 'older listing']::text[],
  'fallback ordering = created_at desc when signals are zero'
);

-- Add signals; signals tied across both listings, so fallback still picks newer
set local session_replication_role = replica;
do $$
declare
  w_id uuid;
begin
  select id into w_id from public.profiles where display_name = 'phase3_test_worker';
  insert into public.worker_profiles (user_id, avg_rating, review_count, response_rate, completion_rate)
    values (w_id, 5.00, 10, 1.000, 1.000)
    on conflict (user_id) do update set avg_rating = 5.00, review_count = 10, response_rate = 1.000, completion_rate = 1.000;
end $$;
set local session_replication_role = origin;

select is(
  (
    select headline
    from public.rank_listings('phase3_test_cat', 1)
  ),
  'newer listing',
  'top ranked listing is deterministic when signals tie'
);

-- Score is strictly larger than zero when rating set
select cmp_ok(
  (select score from public.rank_listings('phase3_test_cat', 1)),
  '>',
  0::numeric,
  'score is positive once signals are present'
);

-- Filtering by category isolates rows
select is(
  (select count(*)::int from public.rank_listings('definitely_missing_category', 50)),
  0,
  'category filter returns empty when no match'
);

-- ocr_extractions schema sanity
select has_column('public', 'ocr_extractions', 'confidence', 'ocr_extractions has confidence');
select has_column('public', 'ocr_extractions', 'doc_type', 'ocr_extractions has doc_type');

select * from finish();
rollback;
