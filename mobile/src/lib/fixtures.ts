/**
 * Sample data for fixture mode (EXPO_PUBLIC_USE_FIXTURES=1) so screens can be
 * designed and reviewed without a Supabase project. Only RPCs listed here are
 * answered; see `withFixtureRpc` in supabase.ts.
 */

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const WORKERS = [
  { id: 'w1', name: 'Ali Raza', skill: 'Plumber', template: 't-plumber', price: 1500, rating: 4.8, reviews: 42, verified: true },
  { id: 'w2', name: 'Ahmed Khan', skill: 'Electrician', template: 't-electrician', price: 1800, rating: 4.6, reviews: 31, verified: true },
  { id: 'w3', name: 'Bilal Tariq', skill: 'AC Technician', template: 't-ac', price: 2500, rating: 4.9, reviews: 57, verified: true },
  { id: 'w4', name: 'Usman Javed', skill: 'Painter', template: 't-painter', price: 2200, rating: 4.3, reviews: 12, verified: false },
  { id: 'w5', name: 'Kashif Malik', skill: 'Carpenter', template: 't-carpenter', price: 2000, rating: 4.5, reviews: 19, verified: true },
  { id: 'w6', name: 'Danish Noor', skill: 'Welder', template: 't-welder', price: 2800, rating: 4.7, reviews: 23, verified: false },
];

const rankedListings = WORKERS.map((w, i) => ({
  id: `l${i + 1}`,
  headline: `${w.skill} services by ${w.name}`,
  price_pkr: w.price,
  status: 'active',
  worker_id: w.id,
  template_id: w.template,
  created_at: daysAgo(i + 1),
  rating: w.rating,
  review_count: w.reviews,
  response_rate: 0.9,
  completion_rate: 0.95,
  recency_days: i + 1,
  score: w.rating * 20 - i,
  is_verified: w.verified,
  worker_display_name: w.name,
  is_boosted: i === 2,
  boost_weight: i === 2 ? 1 : 0,
  city_code: 'karachi',
  city_filtered: true,
}));

const nearbyWorkers = WORKERS.map((w, i) => ({
  user_id: w.id,
  display_name: w.name,
  phone: `+92 300 000 00${i}${i}`,
  city: 'Karachi',
  bio: `Experienced ${w.skill.toLowerCase()} serving Karachi.`,
  categories: [w.skill.toLowerCase().replace(' ', '_')],
  avg_rating: w.rating,
  review_count: w.reviews,
  is_verified: w.verified,
  rate_pkr: w.price,
  rate_unit: 'day' as const,
  years_experience: 3 + i * 2,
  photo_url: null,
  distance_km: Math.round((0.8 + i * 1.3) * 10) / 10,
}));

export const FIXTURE_RPC: Record<string, unknown[]> = {
  rank_listings_v2: rankedListings,
  rank_listings: rankedListings,
  rank_listings_with_boosts: rankedListings,
  phase5_discover_listings: rankedListings,
  nearby_workers: nearbyWorkers,
};
