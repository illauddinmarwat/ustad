-- Phase 2: ops hardening + payments pilot + moderation primitives

alter table public.profiles
  add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended'));

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  amount_pkr numeric(12,2) not null check (amount_pkr >= 0),
  fee_pkr numeric(12,2) not null default 0 check (fee_pkr >= 0),
  payer_id uuid not null references public.profiles (id) on delete restrict,
  payee_id uuid not null references public.profiles (id) on delete restrict,
  method text not null default 'manual' check (method in ('manual', 'jazzcash', 'easypaisa', 'bank')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'disputed')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_ledger_job on public.payment_ledger (job_id);
create index if not exists idx_payment_ledger_status on public.payment_ledger (status);

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_abuse_reports_status on public.abuse_reports (status, created_at desc);

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_name text not null,
  event_props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_events_name_time on public.app_events (event_name, created_at desc);

alter table public.payment_ledger enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.app_events enable row level security;

create policy "payment_ledger_select_participants_or_admin"
  on public.payment_ledger for select to authenticated
  using (
    payer_id = auth.uid ()
    or payee_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

create policy "payment_ledger_insert_participants_or_admin"
  on public.payment_ledger for insert to authenticated
  with check (
    payer_id = auth.uid ()
    or payee_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

create policy "abuse_reports_select_reporter_or_admin"
  on public.abuse_reports for select to authenticated
  using (
    reporter_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

create policy "abuse_reports_insert_reporter"
  on public.abuse_reports for insert to authenticated
  with check (reporter_id = auth.uid ());

create policy "abuse_reports_update_admin_only"
  on public.abuse_reports for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create policy "app_events_insert_own_or_anon"
  on public.app_events for insert to authenticated
  with check (user_id is null or user_id = auth.uid ());

create policy "app_events_select_admin_only"
  on public.app_events for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.mark_job_paid (
  p_job_id uuid,
  p_amount numeric,
  p_method text default 'manual',
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  new_id uuid;
begin
  select * into strict j from public.jobs where id = p_job_id for update;
  if j.customer_id is distinct from auth.uid ()
     and j.worker_id is distinct from auth.uid ()
     and not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'not allowed';
  end if;

  insert into public.payment_ledger (
    job_id, amount_pkr, payer_id, payee_id, method, status, note
  ) values (
    p_job_id, p_amount, j.customer_id, coalesce(j.worker_id, j.customer_id), p_method, 'paid', p_note
  ) returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.mark_job_paid (uuid, numeric, text, text) to authenticated;

create or replace function public.admin_set_user_status (
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  update public.profiles set status = p_status, updated_at = now() where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_status (uuid, text) to authenticated;

create or replace function public.admin_resolve_report (
  p_report_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin') then
    raise exception 'admin only';
  end if;
  update public.abuse_reports
  set status = p_status,
      admin_note = coalesce(p_admin_note, admin_note),
      resolved_at = now()
  where id = p_report_id;
end;
$$;

grant execute on function public.admin_resolve_report (uuid, text, text) to authenticated;
