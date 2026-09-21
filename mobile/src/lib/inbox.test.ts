import {
  applicationItem,
  bucketFor,
  buildInbox,
  countByBucket,
  filterInbox,
  quoteItem,
  statusLabel,
  type ApplicationRaw,
  type JobRaw,
  type MyQuoteRaw,
} from './inbox';

const app = (over: Partial<ApplicationRaw> = {}): ApplicationRaw => ({
  id: 'a1',
  listing_id: 'l1',
  customer_id: 'c1',
  note: 'Please come Monday',
  status: 'pending',
  created_at: '2026-09-21T10:00:00Z',
  ...over,
});

const job = (over: Partial<JobRaw> = {}): JobRaw => ({
  id: 'j1',
  title: 'Fix tap',
  description: 'Leaking',
  status: 'open',
  origin: 'customer_job',
  customer_id: 'c1',
  worker_id: null,
  target_worker_id: null,
  created_at: '2026-09-21T09:00:00Z',
  ...over,
});

const quote = (over: Partial<MyQuoteRaw> = {}): MyQuoteRaw => ({
  quote_id: 'q1',
  job_id: 'j9',
  job_title: 'Wire rooms',
  job_status: 'quoted',
  amount_pkr: 9000,
  status: 'pending',
  created_at: '2026-09-21T08:00:00Z',
  ...over,
});

describe('bucketFor', () => {
  it('maps applications', () => {
    expect(bucketFor('application', 'pending')).toBe('pending');
    for (const s of ['accepted', 'declined', 'cancelled']) expect(bucketFor('application', s)).toBe('done');
  });

  it('maps quotes', () => {
    expect(bucketFor('quote', 'pending')).toBe('pending');
    for (const s of ['accepted', 'rejected']) expect(bucketFor('quote', s)).toBe('done');
  });

  it('maps the job lifecycle for requests and jobs', () => {
    for (const s of ['open', 'quoted', 'pending_customer_confirm']) expect(bucketFor('request', s)).toBe('pending');
    for (const s of ['assigned', 'completed', 'payment_pending', 'disputed']) expect(bucketFor('job', s)).toBe('active');
    for (const s of ['closed', 'cancelled']) expect(bucketFor('job', s)).toBe('done');
  });

  it('keeps unknown statuses visible as pending', () => {
    expect(bucketFor('job', 'something_new')).toBe('pending');
  });
});

describe('statusLabel', () => {
  it('uses friendly wording and falls back gracefully', () => {
    expect(statusLabel('payment_pending')).toBe('Payment pending');
    expect(statusLabel('open')).toBe('Waiting');
    expect(statusLabel('brand_new_status')).toBe('brand new status');
  });
});

describe('item builders', () => {
  it('builds a service application item', () => {
    expect(applicationItem(app(), 'AC service')).toMatchObject({
      kind: 'application',
      flow: 'service',
      title: 'AC service',
      subtitle: 'Please come Monday',
      bucket: 'pending',
      jobId: null,
    });
    expect(applicationItem(app(), undefined).title).toBe('Service');
  });

  it('marks a quote on a job that moved on as not chosen', () => {
    const q = quoteItem(quote({ job_status: 'assigned' }));
    expect(q.status).toBe('rejected');
    expect(q.bucket).toBe('done');
    expect(quoteItem(quote()).bucket).toBe('pending');
    expect(quoteItem(quote()).subtitle).toBe('Your quote: Rs 9000');
  });
});

describe('buildInbox', () => {
  it('tells the three flows apart', () => {
    const items = buildInbox({
      applications: [{ row: app(), listingTitle: 'AC service' }],
      jobs: [job({ id: 'jr', target_worker_id: 'w1' }), job({ id: 'jp' })],
    });
    const flows = Object.fromEntries(items.map((i) => [i.key, i.flow]));
    expect(flows['app:a1']).toBe('service');
    expect(flows['job:jr']).toBe('request');
    expect(flows['job:jp']).toBe('posted');
  });

  it('shows waiting jobs as actionable requests and assigned ones as plain jobs', () => {
    const items = buildInbox({
      jobs: [job({ id: 'j1', status: 'quoted' }), job({ id: 'j2', status: 'assigned', worker_id: 'w1' }), job({ id: 'j3', origin: 'service_listing', status: 'pending_customer_confirm' })],
    });
    const kinds = Object.fromEntries(items.map((i) => [i.key, i.kind]));
    expect(kinds).toEqual({ 'job:j1': 'request', 'job:j2': 'job', 'job:j3': 'job' });
  });

  it('lists a worker quote once: the job replaces it after assignment, and duplicates collapse', () => {
    const items = buildInbox({
      jobs: [job({ id: 'j9', status: 'assigned', worker_id: 'w1' }), job({ id: 'j9', status: 'assigned', worker_id: 'w1', target_worker_id: 'w1' })],
      quotes: [quote({ job_id: 'j9', status: 'accepted' }), quote({ quote_id: 'q2', job_id: 'j10' })],
    });
    expect(items.map((i) => i.key).sort()).toEqual(['job:j9', 'quote:q2']);
  });

  it('sorts newest first', () => {
    const items = buildInbox({
      applications: [{ row: app({ created_at: '2026-09-21T10:00:00Z' }) }],
      jobs: [job({ created_at: '2026-09-21T12:00:00Z' })],
      quotes: [quote({ created_at: '2026-09-21T11:00:00Z' })],
    });
    expect(items.map((i) => i.kind)).toEqual(['request', 'quote', 'application']);
  });
});

describe('filters', () => {
  const items = buildInbox({
    applications: [{ row: app() }, { row: app({ id: 'a2', status: 'declined' }) }],
    jobs: [job({ id: 'j2', status: 'assigned', worker_id: 'w1' }), job({ id: 'j3', status: 'closed', worker_id: 'w1' })],
  });

  it('counts and filters by bucket', () => {
    expect(countByBucket(items)).toEqual({ all: 4, pending: 1, active: 1, done: 2 });
    expect(filterInbox(items, 'all')).toHaveLength(4);
    expect(filterInbox(items, 'pending').map((i) => i.key)).toEqual(['app:a1']);
    expect(filterInbox(items, 'active').map((i) => i.key)).toEqual(['job:j2']);
    expect(filterInbox(items, 'done')).toHaveLength(2);
  });
});
