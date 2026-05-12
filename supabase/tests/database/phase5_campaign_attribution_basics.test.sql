begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'growth_campaigns', 'growth_campaigns table exists');
select has_table('public', 'referral_codes', 'referral_codes table exists');
select has_table('public', 'attribution_touches', 'attribution_touches table exists');

select is(
  public.get_app_setting('phase5_attribution_enabled'),
  'false'::jsonb,
  'phase5_attribution_enabled defaults false'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'track_campaign_touch'
      and p.prosecdef
  ),
  'track_campaign_touch exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.track_campaign_touch(text,text,text,text,text,text,text,jsonb)', 'EXECUTE'),
  true,
  'track_campaign_touch execute granted to authenticated'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_attribution_touches_created_at'
  ),
  'attribution_touches created_at index exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'set_growth_campaigns_updated_at'
  ),
  'growth_campaigns updated_at trigger exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'set_referral_codes_updated_at'
  ),
  'referral_codes updated_at trigger exists'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attribution_touches'
      and policyname = 'attribution_touches_insert_own_or_anon'
  ),
  'attribution_touches insert policy exists'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'attribution_touches'
      and pg_get_constraintdef(c.oid) like '%touch_mode%'
  ),
  'touch_mode constraint includes fallback modes'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'growth_campaigns'
      and pg_get_constraintdef(c.oid) like '%channel%'
  ),
  'growth_campaigns channel constraint exists'
);

select * from finish();
rollback;
