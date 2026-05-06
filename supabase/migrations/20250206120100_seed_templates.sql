-- Starter catalog (Pilot city–agnostic names)
insert into public.service_templates (slug, category, title, description_hint, active)
values
  ('plumbing_leak_basic', 'plumbing', 'Leak inspection & minor fix', 'Describe where the leak shows and pipe type if known.', true),
  ('electrical_fan_install', 'electrical', 'Ceiling fan installation', 'Mention ceiling height / concrete slab.', true),
  ('split_ac_service', 'hvac', 'Split AC cleaning / service', 'Indoor units count, brand/model if known.', true),
  ('house_deep_clean', 'cleaning', 'Deep cleaning (hourly/package)', 'Approximate area (sq ft or marla).', true),
  ('geyser_install', 'plumbing', 'Geyser install / replacement', 'Electric or gas, capacity litres.', true)
on conflict (slug) do nothing;
