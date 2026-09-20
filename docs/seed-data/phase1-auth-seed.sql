-- Local-only auth seeding for Phase 1 test accounts.
with accounts as (
  select 'admin@ustad.com'::text as email, 'Admin123!'::text as pwd
  union all
  select 'worker' || gs::text || '@ustad.com', 'Worker123!'
  from generate_series(1,10) as gs
  union all
  select 'customer' || gs::text || '@ustad.com', 'Customer123!'
  from generate_series(1,20) as gs
), inserted as (
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    a.email,
    crypt(a.pwd, gen_salt('bf')),
    now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  from accounts a
  where not exists (select 1 from auth.users u where u.email = a.email)
  returning id, email
)
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
select
  gen_random_uuid(),
  i.id::text,
  i.id,
  jsonb_build_object('sub', i.id::text, 'email', i.email),
  'email',
  now(), now()
from inserted i
on conflict do nothing;
