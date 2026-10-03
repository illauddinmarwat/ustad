-- What a service card shows besides the listing itself: the Ustad's name, rating, review count, whether they are
-- approved, and how many jobs they have finished. Public like the listing (guests see the Services list), and only
-- for active listings. The ranking functions return some of this, but only when ranking is switched on.

create or replace function public.listing_card_info (p_listing_ids uuid[])
returns table (
  listing_id uuid,
  worker_name text,
  rating numeric,
  review_count int,
  verified boolean,
  jobs_done int
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id,
         p.display_name,
         wp.avg_rating,
         coalesce (wp.review_count, 0),
         coalesce (wp.approval_status = 'approved', false),
         (select count (*)::int from public.jobs j
           where j.worker_id = l.worker_id and j.status in ('completed', 'payment_pending', 'closed'))
  from public.worker_service_listings l
  join public.profiles p on p.id = l.worker_id
  left join public.worker_profiles wp on wp.user_id = l.worker_id
  where l.id = any (coalesce (p_listing_ids, '{}'))
    and l.status = 'active';
$$;

revoke execute on function public.listing_card_info (uuid[]) from public;
grant execute on function public.listing_card_info (uuid[]) to anon, authenticated;
