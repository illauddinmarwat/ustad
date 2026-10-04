-- A worker who switches to the customer view stays a worker for the database, and can still act as a customer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

create function public._t_id (n text) returns uuid language sql immutable as $$
  select (case n
    when 'c1' then '10000000-0000-0000-0000-000000000001'
    when 'w1' then '20000000-0000-0000-0000-000000000001'
    when 'w2' then '20000000-0000-0000-0000-000000000002'
    else '99999999-9999-9999-9999-999999999999' end)::uuid;
$$;

create function public._t_mk_user (p_id uuid, p_role text, p_name text, p_skill text default null)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_name || '@test.local', jsonb_build_object (
    'role', p_role, 'display_name', p_name, 'skill_category', p_skill, 'preferred_language', 'en',
    'city', 'Karachi', 'cnic_number', '4210112345671', 'rate_pkr', 800, 'rate_unit', 'hour'));
  if p_role = 'worker' then
    update public.worker_profiles set approval_status = 'approved', lat = 24.86, lng = 67.00 where user_id = p_id;
  end if;
end $$;

create function public._t_as (n text) returns void language plpgsql as $$
begin
  perform set_config ('request.jwt.claim.sub', public._t_id (n)::text, true);
  perform set_config ('request.jwt.claims', json_build_object ('sub', public._t_id (n)::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select public._t_mk_user (public._t_id ('c1'), 'customer', 'Ali');
select public._t_mk_user (public._t_id ('w1'), 'worker', 'Usman', 'plumber');
select public._t_mk_user (public._t_id ('w2'), 'worker', 'Zaid', 'plumber');

-- w2 looks at the app as a customer.
select public._t_as ('w2');
select lives_ok ($$update public.profiles set active_view = 'customer' where id = public._t_id ('w2')$$, 'an Ustad can choose the customer view');
select throws_ok ($$update public.profiles set active_view = 'admin' where id = public._t_id ('w2')$$, '23514', null, 'only customer or worker are valid views');
reset role;
select is ((select role from public.profiles where id = public._t_id ('w2')), 'worker', 'the role is still worker');
select public._t_as ('w2');

select lives_ok ($$select role, active_view, preferred_language from public.profiles where id = public._t_id ('w2')$$, 'the app can read the view along with the role');
reset role;

-- In the customer view they can post a job and ask another Ustad for a quote.
select public._t_as ('w2');
select lives_ok ($$select public.post_job ('Fix my tap', 'The kitchen tap leaks all day', 'plumber', 'Karachi', 'Gulshan', null, null, null)$$, 'a worker in customer view can post a job');
select lives_ok ($$select public.create_direct_request (public._t_id ('w1'), 'Fix pipe', 'A pipe under the sink leaks', 'plumber', 700)$$, 'and can ask another Ustad for a quote');
reset role;

-- And the Ustad in the customer view can still be asked.
select public._t_as ('c1');
select lives_ok ($$select public.create_direct_request (public._t_id ('w2'), 'Fix sink', 'The sink is blocked', 'plumber', 700)$$, 'an Ustad in customer view can still be sent a request');

select * from finish();
rollback;
