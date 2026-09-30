-- Admin dashboard aggregates (pgTAP): the functions exist, are security definer, are closed to anon,
-- and refuse non-admin callers.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('admin_dashboard_counts', 'admin_kpis', 'admin_breakdown', 'admin_worker_map')
     and p.prosecdef) = 4,
  'all four dashboard functions exist and are security definer'
);

select ok(
  not has_function_privilege('anon', 'public.admin_dashboard_counts()', 'execute')
  and not has_function_privilege('anon', 'public.admin_kpis(int)', 'execute')
  and not has_function_privilege('anon', 'public.admin_breakdown(int)', 'execute')
  and not has_function_privilege('anon', 'public.admin_worker_map()', 'execute'),
  'anon cannot execute any dashboard function'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_dashboard_counts()', 'execute')
  and has_function_privilege('authenticated', 'public.admin_kpis(int)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_breakdown(int)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_worker_map()', 'execute'),
  'authenticated can execute the dashboard functions (admin check happens inside)'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_list_worker_approvals'
     and pg_get_function_result(p.oid) like '%area_is_new%') = 1,
  'the approvals list exposes area_is_new'
);

-- Denied cases: a signed-in user who is not an admin.
select set_config ('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true), set_config ('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select throws_ok($$select * from public.admin_dashboard_counts()$$, 'admin only', 'non-admin cannot read dashboard counts');
select throws_ok($$select * from public.admin_kpis(30)$$, 'admin only', 'non-admin cannot read KPIs');
select throws_ok($$select * from public.admin_breakdown(30)$$, 'admin only', 'non-admin cannot read the breakdown');
select throws_ok($$select * from public.admin_worker_map()$$, 'admin only', 'non-admin cannot read the worker map');
select throws_ok($$select * from public.admin_list_worker_approvals(null)$$, 'admin only', 'non-admin cannot list approvals');
select throws_ok(
  $$select public.admin_set_worker_approval('00000000-0000-0000-0000-0000000000c1', 'approved')$$,
  'admin only',
  'non-admin cannot approve a worker'
);

select * from finish ();
