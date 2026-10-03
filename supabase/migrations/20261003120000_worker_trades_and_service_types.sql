-- A worker can work in more than one trade (an electrician who is also a plumber), and there are more service
-- types to choose from when publishing a service.
--
-- * worker_profiles.categories is already a list; registration only filled it with one trade. This function lets a
--   worker set the whole list. Jobs, requests, the job board and Nearby already match on that list.
-- * service_templates are the "which service do you offer?" choices. Each belongs to a trade (its category).
--   Several more are added per trade, plus an "Other ... work" choice so nobody is stuck.

create or replace function public.worker_set_trades (p_categories text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text[];
  asked int;
begin
  if auth.uid () is null then
    raise exception 'sign in required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'worker') then
    raise exception 'only workers can set their trades';
  end if;

  -- In the order given, without repeats.
  select coalesce (array_agg (s.k order by s.first_pos), '{}')
    into cleaned
  from (select t.k, min (t.ord) as first_pos from unnest (coalesce (p_categories, '{}')) with ordinality as t (k, ord) group by t.k) s;

  asked := coalesce (array_length (cleaned, 1), 0);
  if asked = 0 then
    raise exception 'choose at least one trade';
  end if;
  if asked > 6 then
    raise exception 'choose up to 6 trades';
  end if;
  if exists (
    select 1 from unnest (cleaned) k
    where not exists (select 1 from public.skill_categories sc where sc.key = k and sc.is_active)
  ) then
    raise exception 'unknown trade';
  end if;

  update public.worker_profiles set categories = cleaned where user_id = auth.uid ();
  if not found then
    raise exception 'no worker profile';
  end if;
  return cleaned;
end;
$$;

revoke execute on function public.worker_set_trades (text[]) from public, anon;
grant execute on function public.worker_set_trades (text[]) to authenticated;

insert into public.service_templates (slug, category, title, description_hint, active) values
  ('drain_cleaning', 'plumbing', 'Drain cleaning and blockage', 'Say what kind of drains you clear and with what tools.', true),
  ('plumbing_fittings', 'plumbing', 'Bathroom and kitchen fittings', 'Taps, mixers, basins, commodes, pipes.', true),
  ('water_tank_cleaning', 'plumbing', 'Water tank cleaning and repair', 'Overhead and underground tanks, motors, pumps.', true),
  ('plumbing_other', 'plumbing', 'Other plumbing work', 'Describe the plumbing work you do.', true),
  ('wiring_rewiring', 'electrical', 'House wiring and rewiring', 'New wiring, rewiring, boards, earthing.', true),
  ('switches_lights', 'electrical', 'Switches, sockets and lights', 'Fitting and repair of switches, sockets and lighting.', true),
  ('electrical_fault', 'electrical', 'Fault finding and repair', 'Short circuits, tripping, power not working.', true),
  ('ups_inverter', 'electrical', 'UPS and inverter fitting', 'Fitting and repair of UPS, inverters, batteries.', true),
  ('electrical_other', 'electrical', 'Other electrical work', 'Describe the electrical work you do.', true),
  ('ac_install', 'hvac', 'AC installation', 'Split and window AC fitting, piping, stands.', true),
  ('ac_repair_gas', 'hvac', 'AC repair and gas refill', 'Faults, gas leaks, gas refill, compressor.', true),
  ('hvac_other', 'hvac', 'Other AC work', 'Describe the AC and cooling work you do.', true),
  ('doors_windows', 'carpentry', 'Doors and windows', 'Making, fitting and repairing doors and windows.', true),
  ('furniture_making', 'carpentry', 'Furniture making', 'Beds, tables, sofas, shelves made to order.', true),
  ('kitchen_cabinets', 'carpentry', 'Kitchen cabinets and wardrobes', 'Made to size and fitted at home.', true),
  ('carpentry_other', 'carpentry', 'Other carpentry work', 'Describe the carpentry work you do.', true),
  ('whole_house_painting', 'painting', 'Whole house painting', 'Inside and outside, new and repaint.', true),
  ('wood_polish', 'painting', 'Wood polish and varnish', 'Doors, furniture, floors.', true),
  ('wall_putty', 'painting', 'Wall putty and plaster', 'Wall preparation before painting, crack and damp repair.', true),
  ('painting_other', 'painting', 'Other painting work', 'Describe the painting work you do.', true),
  ('window_grills', 'welding', 'Window and balcony grills', 'Made and fitted to size.', true),
  ('roof_sheds', 'welding', 'Roof sheds and steel structures', 'Sheds, stairs, frames.', true),
  ('welding_other', 'welding', 'Other welding work', 'Describe the welding and metal work you do.', true)
on conflict (slug) do nothing;
