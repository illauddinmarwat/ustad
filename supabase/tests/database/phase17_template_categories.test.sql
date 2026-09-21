-- Phase 17: a starter service template exists for every skill category (pgTAP).

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select ok(exists (select 1 from public.service_templates where category = 'carpentry' and active), 'carpentry template exists');
select ok(exists (select 1 from public.service_templates where category = 'painting' and active), 'painting template exists');
select ok(exists (select 1 from public.service_templates where category = 'welding' and active), 'welding template exists');
select ok(
  (select count(distinct category) from public.service_templates
   where category in ('electrical', 'plumbing', 'carpentry', 'painting', 'hvac', 'welding')) = 6,
  'all six skill categories have a template category'
);

select * from finish();
rollback;
