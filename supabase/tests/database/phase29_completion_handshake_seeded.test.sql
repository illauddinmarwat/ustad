-- Completion handshake: the Ustad says the work is done, the customer confirms, rejects, or it confirms itself.
-- Seeded-user tests (same helpers as phase28).

begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

create function public._t_id (n text) returns uuid language sql immutable as $$
  select (case n
    when 'c1' then '10000000-0000-0000-0000-000000000001'
    when 'c2' then '10000000-0000-0000-0000-000000000002'
    when 'w1' then '20000000-0000-0000-0000-000000000001'
    when 'w2' then '20000000-0000-0000-0000-000000000002'
    else '99999999-9999-9999-9999-999999999999' end)::uuid;
$$;

create function public._t_mk_user (p_id uuid, p_role text, p_name text, p_skill text default null, p_lang text default 'en')
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (p_id, p_name || '@test.local', jsonb_build_object (
    'role', p_role, 'display_name', p_name, 'skill_category', p_skill, 'preferred_language', p_lang,
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

-- A job assigned to w1 for c1, straight in the table (the handshake does not care how it got assigned).
create function public._t_job (p_title text) returns uuid language plpgsql as $$
declare id uuid;
begin
  insert into public.jobs (customer_id, worker_id, title, description, category, status, origin)
  values (public._t_id ('c1'), public._t_id ('w1'), p_title, 'A job to finish', 'plumber', 'assigned', 'customer_job')
  returning jobs.id into id;
  return id;
end $$;

select public._t_mk_user (public._t_id ('c1'), 'customer', 'Ali', null, 'en');
select public._t_mk_user (public._t_id ('c2'), 'customer', 'Bilal', null, 'en');
select public._t_mk_user (public._t_id ('w1'), 'worker', 'Usman', 'plumber', 'en');
select public._t_mk_user (public._t_id ('w2'), 'worker', 'Zaid', 'plumber', 'ur');

select set_config ('t.a', public._t_job ('Fix tap')::text, true);
select set_config ('t.b', public._t_job ('Fix sink')::text, true);
select set_config ('t.c', public._t_job ('Fix pipe')::text, true);

-- ─── The Ustad says the work is done ───
select public._t_as ('w2');
select throws_ok($$select public.worker_mark_work_done(current_setting('t.a')::uuid)$$, 'worker only', 'another Ustad cannot say it is done');
select public._t_as ('c1');
select throws_ok($$select public.worker_mark_work_done(current_setting('t.a')::uuid)$$, 'worker only', 'the customer cannot say the Ustad finished');
select public._t_as ('w1');
select lives_ok($$select public.worker_mark_work_done(current_setting('t.a')::uuid)$$, 'the Ustad says the work is done');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.a')::uuid), 'assigned', 'it is still assigned: the customer has not confirmed');
select isnt ((select worker_done_at from public.jobs where id = current_setting ('t.a')::uuid), null, 'the time is kept');
select is ((select count(*)::int from public.notifications where user_id = public._t_id ('c1') and kind = 'work_done' and job_id = current_setting ('t.a')::uuid), 1, 'the customer is told');

-- ─── The Ustad cannot complete a job, whoever else is watching ───
select public._t_as ('w1');
select throws_ok($$select public.mark_job_completed(current_setting('t.a')::uuid)$$, 'only the customer can confirm the work is done', 'the Ustad cannot complete the job');
select public._t_as ('c2');
select throws_ok($$select public.mark_job_completed(current_setting('t.a')::uuid)$$, 'not a participant', 'a stranger cannot complete it');

-- ─── The customer says it is not finished ───
select public._t_as ('w1');
select throws_ok($$select public.customer_reject_completion(current_setting('t.a')::uuid, 'no')$$, 'not job owner', 'only the customer can reject');
select public._t_as ('c1');
select throws_ok($$select public.customer_reject_completion(current_setting('t.a')::uuid, 'call me on 0300 1234567')$$, 'remove phone numbers and links from the note', 'a phone number is kept out of the note');
select throws_ok($$select public.customer_reject_completion(current_setting('t.b')::uuid, null)$$, 'nothing to reject', 'nothing to reject before the Ustad says it is done');
select lives_ok($$select public.customer_reject_completion(current_setting('t.a')::uuid, 'Tap still drips')$$, 'the customer says it is not finished');
reset role;
select is ((select worker_done_at from public.jobs where id = current_setting ('t.a')::uuid), null, 'the done mark is cleared');
select is ((select completion_note from public.jobs where id = current_setting ('t.a')::uuid), 'Tap still drips', 'the note is kept');
select is ((select body from public.notifications where user_id = public._t_id ('w1') and kind = 'completion_rejected' limit 1), 'The customer says it is not finished: Tap still drips', 'the Ustad is told what is left');

-- ─── The customer confirms ───
select public._t_as ('w1');
select public.worker_mark_work_done (current_setting ('t.a')::uuid);
select public._t_as ('c1');
select lives_ok($$select public.mark_job_completed(current_setting('t.a')::uuid)$$, 'the customer confirms');
reset role;
select is ((select status from public.jobs where id = current_setting ('t.a')::uuid), 'completed', 'the job is completed');
select is ((select count(*)::int from public.notifications where user_id = public._t_id ('w1') and kind = 'work_confirmed'), 1, 'the Ustad is told it was confirmed');

-- ─── Confirming by itself after the waiting time ───
select public._t_as ('w1');
select public.worker_mark_work_done (current_setting ('t.c')::uuid);
reset role;
select is (public.auto_confirm_completions (), 0, 'nothing is confirmed before the time is up');
update public.jobs set worker_done_at = now () - interval '49 hours' where id = current_setting ('t.c')::uuid;
select is (public.auto_confirm_completions (), 1, 'one job is confirmed after 49 hours');
select is ((select status from public.jobs where id = current_setting ('t.c')::uuid), 'completed', 'and it is completed');

select * from finish();
rollback;
