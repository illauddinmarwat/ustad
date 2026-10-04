-- Who a person is (role) is no longer the same thing as which screen they are looking at (active_view).
--
-- Before, "Switch to Customer" rewrote profiles.role to 'customer'. Every database rule that asks "is this a
-- worker?" then said no: an Ustad who was just looking around as a customer could not be sent a request or
-- quote a job, and did not show up for customers. Now role stays 'worker' for an Ustad, and the app only
-- stores which view they last chose in active_view ('customer' or 'worker'; null means their own role).

alter table public.profiles
  add column if not exists active_view text check (active_view in ('customer', 'worker'));

-- Ustads whose role was flipped by the old switch: give them back their role and remember the view they chose.
update public.profiles p
   set role = 'worker', active_view = 'customer'
 where p.role = 'customer'
   and exists (select 1 from public.worker_profiles wp where wp.user_id = p.id);

-- A worker looking at the app as a customer must still be allowed to act as a customer (post a job, ask for a
-- quote, claim a guest job), now that their role stays 'worker'. Every function that asks for role = 'customer'
-- is rewritten to accept a customer or a worker; the rewrite reuses the function as it currently is.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.prosrc like '%p.role = ''customer''%'
  loop
    def := replace (pg_get_functiondef (r.oid), 'p.role = ''customer''', 'p.role in (''customer'', ''worker'')');
    execute def;
  end loop;
end
$$;

-- The same for the one table rule that asked for a customer (applying to a listing).
drop policy if exists "applications_insert_customer" on public.listing_applications;
create policy "applications_insert_customer"
  on public.listing_applications for insert
  to authenticated
  with check (
    customer_id = auth.uid ()
    and exists (select 1 from public.profiles p where p.id = auth.uid () and p.role in ('customer', 'worker'))
  );
