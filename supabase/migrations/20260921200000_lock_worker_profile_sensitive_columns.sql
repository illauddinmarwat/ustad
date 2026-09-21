-- Worker national ID and exact location were readable by every signed-in user.
--
-- `worker_profiles` has a select policy of `using (true)` for authenticated users, so any
-- signed-in person could read every worker's `cnic_number` (national ID) and their last-known
-- coordinates (`lat`, `lng`, `location_updated_at`) straight from the table. Nothing in either
-- app reads these columns: workers only write them, Nearby gets distances from a
-- security-definer function, and the admin panel reads CNIC data through an admin function.
--
-- Same approach as `profiles.phone` / `profiles.address` (Phase 2): take table-level select
-- away and grant select on every other column. Writes are untouched, so a worker can still
-- save their own location and registration details. Columns added to `worker_profiles` in the
-- future must be granted explicitly with
--   grant select (col) on public.worker_profiles to authenticated;

do $$
declare
  cols text;
begin
  select string_agg (quote_ident (column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'worker_profiles'
    and column_name not in ('cnic_number', 'lat', 'lng', 'location_updated_at');

  execute 'revoke select on public.worker_profiles from anon, authenticated';
  execute format ('grant select (%s) on public.worker_profiles to authenticated', cols);
end
$$;
