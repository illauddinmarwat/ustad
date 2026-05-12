-- Phase 2 follow-ups: admin actions and template ops

create policy "payment_ledger_update_admin_only"
  on public.payment_ledger for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

create or replace function public.admin_update_payment_status (
  p_ledger_id uuid,
  p_status text,
  p_note text default null
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
  update public.payment_ledger
  set status = p_status,
      note = coalesce(p_note, note)
  where id = p_ledger_id;
end;
$$;

grant execute on function public.admin_update_payment_status (uuid, text, text) to authenticated;

create or replace function public.admin_set_template_active (
  p_template_id uuid,
  p_active boolean
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
  update public.service_templates set active = p_active where id = p_template_id;
end;
$$;

grant execute on function public.admin_set_template_active (uuid, boolean) to authenticated;
