-- Phase 4 slice 4: quality + trust foundations (additive, flag-gated).
-- No booking state machine rewrites.

insert into public.app_settings (key, value)
values ('phase4_quality_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists public.job_completion_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_completion_photos_job on public.job_completion_photos (job_id, created_at desc);

create table if not exists public.job_quality_surveys (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  satisfaction smallint not null check (satisfaction between 1 and 5),
  would_rehire boolean not null,
  comment text,
  created_at timestamptz not null default now(),
  unique (job_id, customer_id)
);

create table if not exists public.guarantee_claim_intakes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  claimant_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('quality_issue', 'damage', 'no_show', 'other')),
  description text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_guarantee_claim_intakes_updated_at before update on public.guarantee_claim_intakes
  for each row execute function public.set_updated_at ();

create index if not exists idx_guarantee_claim_intakes_status on public.guarantee_claim_intakes (status, created_at desc);

alter table public.job_completion_photos enable row level security;
alter table public.job_quality_surveys enable row level security;
alter table public.guarantee_claim_intakes enable row level security;

drop policy if exists "job_completion_photos_select_participants" on public.job_completion_photos;
create policy "job_completion_photos_select_participants"
  on public.job_completion_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_completion_photos.job_id
        and (j.customer_id = auth.uid () or j.worker_id = auth.uid ())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "job_completion_photos_insert_participants_completed" on public.job_completion_photos;
create policy "job_completion_photos_insert_participants_completed"
  on public.job_completion_photos for insert
  to authenticated
  with check (
    uploader_id = auth.uid ()
    and exists (
      select 1 from public.jobs j
      where j.id = job_completion_photos.job_id
        and j.status = 'completed'
        and (j.customer_id = auth.uid () or j.worker_id = auth.uid ())
    )
  );

drop policy if exists "job_quality_surveys_select_participants" on public.job_quality_surveys;
create policy "job_quality_surveys_select_participants"
  on public.job_quality_surveys for select
  to authenticated
  using (
    customer_id = auth.uid ()
    or exists (
      select 1 from public.jobs j
      where j.id = job_quality_surveys.job_id and j.worker_id = auth.uid ()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "job_quality_surveys_insert_customer" on public.job_quality_surveys;
create policy "job_quality_surveys_insert_customer"
  on public.job_quality_surveys for insert
  to authenticated
  with check (customer_id = auth.uid ());

drop policy if exists "guarantee_claim_intakes_select_claimant_or_admin" on public.guarantee_claim_intakes;
create policy "guarantee_claim_intakes_select_claimant_or_admin"
  on public.guarantee_claim_intakes for select
  to authenticated
  using (
    claimant_id = auth.uid ()
    or exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin')
  );

drop policy if exists "guarantee_claim_intakes_insert_claimant" on public.guarantee_claim_intakes;
create policy "guarantee_claim_intakes_insert_claimant"
  on public.guarantee_claim_intakes for insert
  to authenticated
  with check (claimant_id = auth.uid ());

drop policy if exists "guarantee_claim_intakes_admin_update" on public.guarantee_claim_intakes;
create policy "guarantee_claim_intakes_admin_update"
  on public.guarantee_claim_intakes for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.submit_job_quality_survey (
  p_job_id uuid,
  p_satisfaction smallint,
  p_would_rehire boolean,
  p_comment text default null
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
  select * into strict j from public.jobs where id = p_job_id;
  if j.customer_id <> auth.uid () then
    raise exception 'customer only';
  end if;
  if j.status <> 'completed' then
    raise exception 'job must be completed';
  end if;

  insert into public.job_quality_surveys (job_id, customer_id, satisfaction, would_rehire, comment)
  values (p_job_id, auth.uid (), p_satisfaction, p_would_rehire, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (job_id, customer_id) do update
    set satisfaction = excluded.satisfaction,
        would_rehire = excluded.would_rehire,
        comment = excluded.comment,
        created_at = now()
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_job_quality_survey (uuid, smallint, boolean, text) to authenticated;

create or replace function public.submit_guarantee_claim_intake (
  p_job_id uuid,
  p_category text,
  p_description text,
  p_evidence jsonb default '{}'::jsonb
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
  select * into strict j from public.jobs where id = p_job_id;
  if j.status <> 'completed' then
    raise exception 'job must be completed';
  end if;
  if auth.uid () is distinct from j.customer_id and auth.uid () is distinct from j.worker_id then
    raise exception 'participants only';
  end if;

  insert into public.guarantee_claim_intakes (job_id, claimant_id, category, description, evidence)
  values (
    p_job_id,
    auth.uid (),
    p_category,
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_evidence, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_guarantee_claim_intake (uuid, text, text, jsonb) to authenticated;
