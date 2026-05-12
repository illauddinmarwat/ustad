export type BoostMeta = {
  is_boosted?: boolean | null;
  boost_weight?: number | null;
};

export function isFeaturedListing(meta: BoostMeta): boolean {
  return Boolean(meta.is_boosted) && Number(meta.boost_weight ?? 0) > 0;
}

export function boostChipLabel(meta: BoostMeta): string | null {
  if (!isFeaturedListing(meta)) return null;
  return 'Featured';
}
