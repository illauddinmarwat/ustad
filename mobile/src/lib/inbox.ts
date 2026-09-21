/**
 * Unified inbox model. Every row in the Inbox, whichever flow it came from, is
 * normalised to an InboxItem so it can share one list, filters and status chips.
 *
 * Flows: `service` (a customer applied to a worker's listing), `request` (a
 * customer asked one worker directly), `posted` (a posted job with quotes).
 * A job that has been assigned shows once, as a `job` item, whatever its origin.
 */

export type InboxKind = 'application' | 'request' | 'quote' | 'job';
export type InboxFlow = 'service' | 'request' | 'posted';
export type InboxBucket = 'pending' | 'active' | 'done';
export type InboxFilter = 'all' | InboxBucket;

export type InboxItem = {
  key: string;
  kind: InboxKind;
  flow: InboxFlow;
  jobId: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  bucket: InboxBucket;
  createdAt: string;
};

// ─── Raw rows, as returned by the queries ───────────────────────────────

export type ApplicationRaw = {
  id: string;
  listing_id: string;
  customer_id: string;
  note: string | null;
  status: string;
  created_at: string;
};

export type JobRaw = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  origin: string;
  customer_id: string | null;
  worker_id: string | null;
  target_worker_id: string | null;
  created_at: string;
};

export type MyQuoteRaw = {
  quote_id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  amount_pkr: number;
  status: string;
  created_at: string;
};

// ─── Status -> bucket ────────────────────────────────────────────────────

const JOB_ACTIVE = ['assigned', 'completed', 'payment_pending', 'disputed'];
const JOB_DONE = ['closed', 'cancelled'];

/** Which filter a status belongs to. Unknown statuses count as pending so nothing is hidden by mistake. */
export function bucketFor(kind: InboxKind, status: string): InboxBucket {
  if (kind === 'application') {
    if (status === 'pending') return 'pending';
    return 'done'; // accepted (its job has its own item), declined, cancelled
  }
  if (kind === 'quote') {
    if (status === 'pending') return 'pending';
    return 'done'; // accepted (the job has its own item), rejected, or the job ended
  }
  // request and job share the jobs lifecycle
  if (JOB_DONE.includes(status)) return 'done';
  if (JOB_ACTIVE.includes(status)) return 'active';
  return 'pending'; // open, quoted, pending_customer_confirm
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  rejected: 'Not chosen',
  open: 'Waiting',
  quoted: 'Quotes received',
  pending_customer_confirm: 'Confirm booking',
  assigned: 'In progress',
  completed: 'Work done',
  payment_pending: 'Payment pending',
  disputed: 'Payment problem',
  closed: 'Closed',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

export const FLOW_LABEL: Record<InboxFlow, string> = {
  service: 'Service',
  request: 'Direct request',
  posted: 'Posted job',
};

// ─── Builders ────────────────────────────────────────────────────────────

const flowOfJob = (j: Pick<JobRaw, 'origin' | 'target_worker_id'>): InboxFlow =>
  j.origin === 'service_listing' ? 'service' : j.target_worker_id ? 'request' : 'posted';

export function applicationItem(a: ApplicationRaw, listingTitle: string | undefined): InboxItem {
  return {
    key: `app:${a.id}`,
    kind: 'application',
    flow: 'service',
    jobId: null,
    title: listingTitle || 'Service',
    subtitle: a.note,
    status: a.status,
    bucket: bucketFor('application', a.status),
    createdAt: a.created_at,
  };
}

export function jobItem(j: JobRaw, asKind: 'request' | 'job'): InboxItem {
  return {
    key: `job:${j.id}`,
    kind: asKind,
    flow: flowOfJob(j),
    jobId: j.id,
    title: j.title,
    subtitle: j.description,
    status: j.status,
    bucket: bucketFor(asKind, j.status),
    createdAt: j.created_at,
  };
}

export function quoteItem(q: MyQuoteRaw): InboxItem {
  // A quote on a job that has moved on without it is over, even if never marked rejected.
  const status =
    q.status === 'pending' && ['cancelled', 'closed', 'assigned', 'completed'].includes(q.job_status) ? 'rejected' : q.status;
  return {
    key: `quote:${q.quote_id}`,
    kind: 'quote',
    flow: 'posted',
    jobId: q.job_id,
    title: q.job_title,
    subtitle: `Your quote: Rs ${q.amount_pkr}`,
    status,
    bucket: bucketFor('quote', status),
    createdAt: q.created_at,
  };
}

/**
 * Jobs that still need the viewer to act on them as a request/posting (open,
 * quoted, or not yet confirmed) show as `request` rows with inline actions;
 * once assigned they become plain `job` rows.
 */
export function buildInbox(input: {
  applications?: Array<{ row: ApplicationRaw; listingTitle?: string }>;
  jobs?: JobRaw[];
  quotes?: MyQuoteRaw[];
}): InboxItem[] {
  const items: InboxItem[] = [];
  const jobIds = new Set<string>();

  for (const j of input.jobs ?? []) {
    if (jobIds.has(j.id)) continue; // e.g. a targeted request the worker has since been assigned
    jobIds.add(j.id);
    const waiting = ['open', 'quoted'].includes(j.status) && j.origin === 'customer_job';
    items.push(jobItem(j, waiting ? 'request' : 'job'));
  }

  for (const a of input.applications ?? []) items.push(applicationItem(a.row, a.listingTitle));

  for (const q of input.quotes ?? []) {
    if (jobIds.has(q.job_id)) continue; // the job itself is already listed
    items.push(quoteItem(q));
  }

  return sortInbox(items);
}

export function sortInbox(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  return filter === 'all' ? items : items.filter((i) => i.bucket === filter);
}

export function countByBucket(items: InboxItem[]): Record<InboxFilter, number> {
  const counts: Record<InboxFilter, number> = { all: items.length, pending: 0, active: 0, done: 0 };
  for (const i of items) counts[i.bucket] += 1;
  return counts;
}
