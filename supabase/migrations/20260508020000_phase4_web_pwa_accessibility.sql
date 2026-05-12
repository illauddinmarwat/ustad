-- Phase 4 slice 5: web/pwa foundation + shared UI/accessibility support.
-- Additive only; existing booking state machine remains unchanged.

insert into public.app_settings (key, value)
values ('phase4_web_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.web_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.worker_service_listings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'created' check (status in ('created', 'confirmed', 'paid', 'expired')),
  checkout_path text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists idx_web_checkout_sessions_customer on public.web_checkout_sessions (customer_id, created_at desc);
create index if not exists idx_web_checkout_sessions_status on public.web_checkout_sessions (status, created_at desc);

alter table public.web_checkout_sessions enable row level security;

drop policy if exists "web_checkout_sessions_select_own_or_admin" on public.web_checkout_sessions;
create policy "web_checkout_sessions_select_own_or_admin"
  on public.web_checkout_sessions for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "web_checkout_sessions_insert_customer" on public.web_checkout_sessions;
create policy "web_checkout_sessions_insert_customer"
  on public.web_checkout_sessions for insert
  to authenticated
  with check (customer_id = auth.uid ());

create or replace function public.create_web_checkout_session (
  p_listing_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  session_id uuid,
  checkout_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_row public.worker_service_listings%rowtype;
  new_id uuid;
  new_path text;
  exp timestamptz := now() + interval '30 minutes';
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'customer') then
    raise exception 'customer only';
  end if;

  select * into strict listing_row from public.worker_service_listings where id = p_listing_id;
  if listing_row.status <> 'active' then
    raise exception 'listing must be active';
  end if;

  new_id := gen_random_uuid();
  new_path := '/web/checkout/' || new_id::text;

  insert into public.web_checkout_sessions (
    id, listing_id, customer_id, checkout_path, metadata, expires_at
  )
  values (
    new_id, p_listing_id, auth.uid (), new_path, coalesce(p_metadata, '{}'::jsonb), exp
  );

  return query select new_id, new_path, exp;
end;
$$;

grant execute on function public.create_web_checkout_session (uuid, jsonb) to authenticated;
