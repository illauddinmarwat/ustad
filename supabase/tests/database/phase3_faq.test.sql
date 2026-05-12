-- Phase 3 slice 3f — bilingual FAQ knowledge base.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_table('public', 'faqs', 'faqs table exists');
select has_column('public', 'faqs', 'question_ur', 'faqs has question_ur');
select has_column('public', 'faqs', 'answer_ur', 'faqs has answer_ur');
select has_column('public', 'faqs', 'search_terms', 'faqs has search_terms');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_faqs'
  ),
  'search_faqs exists'
);

-- Seed FAQs are present (idempotent insert)
select cmp_ok(
  (select count(*)::int from public.faqs where is_active = true),
  '>=',
  6,
  'at least 6 active FAQ rows seeded'
);

-- Search returns scored results matching the query
select cmp_ok(
  (select count(*)::int from public.search_faqs('payment', 10) where score > 0),
  '>=',
  1,
  'search_faqs returns at least one match for "payment"'
);

select * from finish();
rollback;
