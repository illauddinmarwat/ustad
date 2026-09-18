-- ─── Phase 10: CNIC front/back document uploads ────────────────────────────
-- Adds storage for the CNIC images collected on the professional registration
-- form. Unlike worker-photos (public, profile display), CNIC images contain
-- PII, so the bucket is private: only the owning worker and admins can read.

alter table public.worker_profiles
  add column if not exists cnic_front_url text,
  add column if not exists cnic_back_url text;

insert into storage.buckets (id, name, public)
values ('worker-documents', 'worker-documents', false)
on conflict (id) do nothing;

create policy "worker_documents_owner_or_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
  );

create policy "worker_documents_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "worker_documents_owner_update"
  on storage.objects for update
  using (bucket_id = 'worker-documents' and (storage.foldername(name))[1] = auth.uid()::text);
