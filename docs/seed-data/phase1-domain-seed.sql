-- Domain seed using existing auth users created from docs/seed-data/phase1-seed-accounts.md
-- Run in Supabase SQL editor after accounts exist.

-- Set roles and names
update public.profiles set role = 'admin', display_name = 'Super Admin' where id in (select id from auth.users where email = 'admin@ustad.com');

-- Workers
update public.profiles p
set role = 'worker', display_name = s.display_name
from (
  values
    ('worker1@ustad.com','Ali Raza'),
    ('worker2@ustad.com','Ahmed Khan'),
    ('worker3@ustad.com','Bilal Tariq'),
    ('worker4@ustad.com','Usman Javed'),
    ('worker5@ustad.com','Hamza Iqbal'),
    ('worker6@ustad.com','Danish Noor'),
    ('worker7@ustad.com','Kashif Malik'),
    ('worker8@ustad.com','Saad Hassan'),
    ('worker9@ustad.com','Faisal Shah'),
    ('worker10@ustad.com','Imran Latif')
) as s(email, display_name)
where p.id in (select id from auth.users where email = s.email);

-- Customers
update public.profiles p
set role = 'customer', display_name = s.display_name
from (
  values
    ('customer1@ustad.com','Customer 01'),('customer2@ustad.com','Customer 02'),('customer3@ustad.com','Customer 03'),('customer4@ustad.com','Customer 04'),('customer5@ustad.com','Customer 05'),
    ('customer6@ustad.com','Customer 06'),('customer7@ustad.com','Customer 07'),('customer8@ustad.com','Customer 08'),('customer9@ustad.com','Customer 09'),('customer10@ustad.com','Customer 10'),
    ('customer11@ustad.com','Customer 11'),('customer12@ustad.com','Customer 12'),('customer13@ustad.com','Customer 13'),('customer14@ustad.com','Customer 14'),('customer15@ustad.com','Customer 15'),
    ('customer16@ustad.com','Customer 16'),('customer17@ustad.com','Customer 17'),('customer18@ustad.com','Customer 18'),('customer19@ustad.com','Customer 19'),('customer20@ustad.com','Customer 20')
) as s(email, display_name)
where p.id in (select id from auth.users where email = s.email);

-- Worker profiles (upsert)
insert into public.worker_profiles (user_id, bio, categories, service_areas)
select u.id,
       'Verified local worker',
       array[s.skill],
       '["Lahore","Karachi","Islamabad"]'::jsonb
from (
  values
    ('worker1@ustad.com','plumbing'),('worker2@ustad.com','electrical'),('worker3@ustad.com','hvac'),('worker4@ustad.com','cleaning'),('worker5@ustad.com','handyman'),
    ('worker6@ustad.com','painting'),('worker7@ustad.com','carpentry'),('worker8@ustad.com','tiling'),('worker9@ustad.com','appliance-repair'),('worker10@ustad.com','roofing')
) as s(email, skill)
join auth.users u on u.email = s.email
on conflict (user_id) do update set categories = excluded.categories, bio = excluded.bio, service_areas = excluded.service_areas;

-- Publish one listing for each worker from available templates
insert into public.worker_service_listings (worker_id, template_id, headline, detail_text, price_pkr, status)
select u.id,
       t.id,
       p.display_name || ' - ' || t.title,
       'Service by ' || p.display_name,
       (2500 + (row_number() over ()) * 250)::numeric,
       'active'
from auth.users u
join public.profiles p on p.id = u.id and p.role = 'worker'
join lateral (
  select id, title from public.service_templates where active = true order by title limit 1
) t on true
on conflict do nothing;

-- Seed a few open jobs by first five customers
insert into public.jobs (customer_id, title, description, category, status, origin, worker_id)
select u.id,
       'Need quick home service #' || row_number() over (),
       'Seeded customer request',
       'general',
       'open',
       'customer_job',
       null
from auth.users u
join public.profiles p on p.id = u.id and p.role = 'customer'
order by u.email
limit 5;
