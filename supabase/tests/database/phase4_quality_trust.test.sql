begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_table('public', 'job_completion_photos', 'job_completion_photos table exists');
select has_table('public', 'job_quality_surveys', 'job_quality_surveys table exists');
select has_table('public', 'guarantee_claim_intakes', 'guarantee_claim_intakes table exists');
select has_column('public', 'job_quality_surveys', 'satisfaction', 'job_quality_surveys.satisfaction exists');
select has_column('public', 'guarantee_claim_intakes', 'category', 'guarantee_claim_intakes.category exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_job_quality_survey' and p.prosecdef
  ),
  'submit_job_quality_survey is security definer'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_guarantee_claim_intake' and p.prosecdef
  ),
  'submit_guarantee_claim_intake is security definer'
);

select is(
  public.get_app_setting('phase4_quality_enabled'),
  'false'::jsonb,
  'phase4_quality_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'job_quality_surveys'
      and c.contype = 'u'
  ),
  'job_quality_surveys has uniqueness constraint'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_guarantee_claim_intakes_status'
  ),
  'guarantee_claim_intakes status index exists'
);

select cmp_ok(
  (select count(*)::int from public.app_settings where key like 'phase4_%_enabled'),
  '>=',
  4,
  'phase4 feature flags include quality gate'
);

select * from finish();
rollback;
