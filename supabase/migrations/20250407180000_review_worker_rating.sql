-- Recompute worker_profiles.avg_rating and review_count when a review is inserted.

create or replace function public.sync_worker_profile_from_reviews ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid := new.reviewee_id;
  cnt int;
  av numeric;
begin
  select count(*)::int, round(avg(rating)::numeric, 2)
  into cnt, av
  from public.reviews
  where reviewee_id = wid;

  insert into public.worker_profiles (user_id, review_count, avg_rating)
  values (wid, cnt, av)
  on conflict (user_id) do update
  set review_count = excluded.review_count,
      avg_rating = excluded.avg_rating,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_reviews_sync_worker_profile on public.reviews;
create trigger trg_reviews_sync_worker_profile
  after insert on public.reviews
  for each row
  execute function public.sync_worker_profile_from_reviews ();
