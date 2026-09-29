-- Guests hit permission errors: service_templates policy queried profiles directly (anon has no SELECT on it), and faqs were authenticated-only.
grant execute on function public._is_admin () to anon, authenticated;

drop policy if exists "service_templates_read_active" on public.service_templates;
create policy "service_templates_read_active"
  on public.service_templates for select
  to anon, authenticated
  using (active = true or public._is_admin ());

-- FAQs are public help content: the Help & FAQ page was blank for guests.
grant select on public.faqs to anon;
drop policy if exists "faqs_read_active" on public.faqs;
create policy "faqs_read_active"
  on public.faqs for select
  to anon, authenticated
  using (is_active = true or public._is_admin ());
grant execute on function public.search_faqs (text, int) to anon;
