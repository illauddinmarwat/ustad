-- Stop people editing what only an admin may decide.
--
-- Both `profiles` and `worker_profiles` let a signed-in person update their own row (they must, to change their
-- name, language, photo or location). Nothing limited which columns, so a worker could approve themselves, mark
-- themselves verified, give themselves a rating, and anyone could make themselves an admin.
--
-- These triggers refuse those changes when they come straight from the app (the `authenticated` or `anon` role).
-- Admin and system functions (approve, reject, reviews, signals, resubmit, trades, availability, Hisab) run with
-- their owner's rights, so they are not affected, and an admin may change anything.

-- ─── profiles: role and status ───────────────────────────────────────────

create or replace function public._profiles_guard ()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') or public._is_admin () then
    return new;
  end if;
  -- The app lets people switch between customer and worker, never to or from admin.
  if new.role is distinct from old.role and (old.role = 'admin' or new.role not in ('customer', 'worker')) then
    raise exception 'you cannot change your role to that';
  end if;
  if new.status is distinct from old.status then
    raise exception 'only an admin can change the account status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public._profiles_guard ();

-- ─── worker_profiles: approval, verification, ratings, identity, trades ──

create or replace function public._worker_profiles_guard ()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') or public._is_admin () then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status is distinct from 'pending'
       or coalesce (new.is_verified, false)
       or coalesce (new.commission_suspended, false)
       or new.avg_rating is not null
       or coalesce (new.review_count, 0) <> 0 then
      raise exception 'a new worker profile starts as pending';
    end if;
    return new;
  end if;

  if new.approval_status is distinct from old.approval_status
     or new.rejection_reason is distinct from old.rejection_reason
     or new.approval_reviewed_at is distinct from old.approval_reviewed_at
     or new.approval_reviewed_by is distinct from old.approval_reviewed_by
     or new.is_verified is distinct from old.is_verified
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.avg_rating is distinct from old.avg_rating
     or new.review_count is distinct from old.review_count
     or new.response_rate is distinct from old.response_rate
     or new.completion_rate is distinct from old.completion_rate
     or new.commission_suspended is distinct from old.commission_suspended
     or new.cnic_number is distinct from old.cnic_number
     or new.categories is distinct from old.categories then
    -- Trades are set with worker_set_trades, the CNIC with the resubmit form; both run with their own rights.
    raise exception 'only an admin can change that';
  end if;
  return new;
end;
$$;

drop trigger if exists worker_profiles_guard on public.worker_profiles;
create trigger worker_profiles_guard
  before insert or update on public.worker_profiles
  for each row execute function public._worker_profiles_guard ();
