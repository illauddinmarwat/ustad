-- profiles has column-level SELECT grants (phone and address are hidden), so a new column must be granted on
-- purpose. Without this the app's profile lookup (role, active_view, preferred_language) failed for everyone.
grant select (active_view) on public.profiles to authenticated;
