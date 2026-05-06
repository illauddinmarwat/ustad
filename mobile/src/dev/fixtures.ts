/** Stable UUIDs for fixture users (string form). */
export const FIXTURE_CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';
export const FIXTURE_WORKER_ID = '22222222-2222-2222-2222-222222222222';

export const fixtureTemplates = [
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'plumbing_leak_basic', category: 'plumbing', title: 'Leak inspection & minor fix', active: true },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', slug: 'split_ac_service', category: 'hvac', title: 'Split AC cleaning / service', active: true },
] as const;

export const fixtureListings = [
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    worker_id: FIXTURE_WORKER_ID,
    template_id: fixtureTemplates[1].id,
    headline: 'AC service — DHA Phase 4',
    price_pkr: 3500,
    status: 'active' as const,
  },
];

export const fixtureProfileByRole = {
  customer: { role: 'customer' as const, display_name: 'Fixture Customer' },
  worker: { role: 'worker' as const, display_name: 'Fixture Worker' },
};
