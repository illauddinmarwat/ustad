-- Suspended workers' listings must not show in ranked discovery.
--
-- `rank_listings` and `rank_listings_v2` read the listings table directly (as security
-- definer, so row-level security does not apply). `rank_listings_with_boosts` and
-- `phase5_discover_listings` only wrap them, so filtering these two is enough.
--
-- Rather than copy two long functions, this rewrites the one condition in each from
-- their current definitions. It fails loudly if the expected text is not found, and does
-- nothing if a function is already patched.

do $$
declare
  f text;
  def text;
  newdef text;
begin
  foreach f in array array['rank_listings', 'rank_listings_v2'] loop
    select pg_get_functiondef (p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f;

    if def is null then
      raise exception 'function public.% not found', f;
    end if;
    if position ('_worker_active' in def) > 0 then
      continue; -- already patched
    end if;

    newdef := replace (def, 'where l.status = ''active''', 'where l.status = ''active'' and public._worker_active (l.worker_id)');
    if newdef = def then
      raise exception 'expected condition not found in public.%', f;
    end if;
    execute newdef;
  end loop;
end
$$;
