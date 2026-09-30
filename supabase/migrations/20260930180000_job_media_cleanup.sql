-- Clean-up of job media (docs/job-media-plan.md). Files of cancelled or expired jobs are deleted a week
-- after the job ends, and files of closed jobs after 30 days.
--
-- The database cannot delete the stored file itself (deleting rows from storage.objects leaves the
-- blob behind), so the admin panel asks for the list, deletes the files through the Storage API and then
-- marks them purged. Purged files are treated as removed everywhere.

alter table public.job_media add column if not exists purged_at timestamptz;

create or replace function public.admin_job_media_to_purge (p_limit int default 200)
returns table (id uuid, path text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  return query
  select m.id, m.path
  from public.job_media m
  join public.jobs j on j.id = m.job_id
  where m.purged_at is null
    and (
      m.removed_at is not null
      or (j.status = 'cancelled' and j.updated_at < now () - interval '7 days')
      or (j.status in ('open', 'quoted') and j.expires_at < now () - interval '7 days')
      or (j.status = 'closed' and j.updated_at < now () - interval '30 days')
    )
  order by m.created_at
  limit greatest (1, least (p_limit, 1000));
end;
$$;

revoke execute on function public.admin_job_media_to_purge (int) from public, anon;
grant execute on function public.admin_job_media_to_purge (int) to authenticated;

-- Call after the files were deleted from storage.
create or replace function public.admin_mark_job_media_purged (p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public._is_admin () then
    raise exception 'admin only';
  end if;
  update public.job_media
  set purged_at = now (), removed_at = coalesce (removed_at, now ())
  where id = any (coalesce (p_ids, '{}')) and purged_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.admin_mark_job_media_purged (uuid[]) from public, anon;
grant execute on function public.admin_mark_job_media_purged (uuid[]) to authenticated;
