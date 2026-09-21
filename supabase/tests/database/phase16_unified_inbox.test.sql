-- Phase 16: unified inbox (pgTAP).

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_my_quotes' and p.prosecdef
  ),
  'list_my_quotes exists and is security definer'
);

select ok(not has_function_privilege ('anon', 'public.list_my_quotes(int)', 'execute'), 'anon cannot list quotes');
select ok(has_function_privilege ('authenticated', 'public.list_my_quotes(int)', 'execute'), 'signed-in users can list their quotes');

select throws_ok(
  $$select * from public.list_my_quotes()$$,
  'sign in required',
  'a session is required'
);

select set_config ('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config ('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is (
  (select count(*) from public.list_my_quotes ()),
  0::bigint,
  'a user with no quotes gets an empty list'
);

select * from finish ();
rollback;
