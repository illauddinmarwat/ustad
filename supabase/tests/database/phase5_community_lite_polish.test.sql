begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'community_tips', 'community_tips table exists');
select has_column('public', 'community_tips', 'lang', 'community_tips.lang exists');

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'phase5_get_community_tips'
      and p.prosecdef
  ),
  'phase5_get_community_tips exists and is security definer'
);

select is(
  has_function_privilege('authenticated', 'public.phase5_get_community_tips(text,integer)', 'EXECUTE'),
  true,
  'phase5_get_community_tips execute granted to authenticated'
);

select is(
  public.get_app_setting('phase5_city_community_enabled'),
  'false'::jsonb,
  'phase5_city_community_enabled remains default false'
);

select is(
  (select count(*)::int from public.phase5_get_community_tips(null, 10)),
  0,
  'community tips function returns no rows when flag is off'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_community_tips_city_active'
  ),
  'community tips index exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'set_community_tips_updated_at'
  ),
  'community_tips updated_at trigger exists'
);

select has_column('public', 'community_tips', 'lang', 'community_tips.lang column exists');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_tips'
      and policyname = 'community_tips_admin_write'
  ),
  'community tips admin write policy exists'
);

select * from finish();
rollback;
