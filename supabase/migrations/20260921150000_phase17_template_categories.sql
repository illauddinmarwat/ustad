-- Phase 17: service templates for every skill category.
--
-- Nearby, workers and posted jobs use six skill categories (electrician,
-- plumber, carpenter, painter, ac_technician, welder). The starter template
-- catalog only covered plumbing, electrical, hvac and cleaning, so a worker who
-- is a carpenter, painter or welder had nothing to publish a listing under, and
-- filtering Services by those categories could never show anything.
--
-- This adds one starter template for each missing skill. Templates can be
-- switched off later with `service_templates.active`. The app maps skill keys
-- to template categories in `mobile/src/lib/categoryMap.ts`.

insert into public.service_templates (slug, category, title, description_hint, active)
values
  ('carpentry_repair_basic', 'carpentry', 'Furniture and door repair', 'Say what needs fixing and the wood or fitting type if known.', true),
  ('interior_painting_room', 'painting', 'Room painting', 'Room size, number of rooms, and whether walls need preparation.', true),
  ('welding_gate_grill', 'welding', 'Gate, grill and metal work', 'Describe the item, size and whether it is a repair or new work.', true)
on conflict (slug) do nothing;
