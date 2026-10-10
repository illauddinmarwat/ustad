import type { StringId } from '../i18n/strings';

/**
 * The steps of a job as both people see them, and what happens next for the person looking.
 * Pure: the screen passes in what it already loaded.
 */
export type StepId = 'posted' | 'requested' | 'quoted' | 'accepted' | 'enRoute' | 'done' | 'confirmed' | 'paid' | 'closed';
export type Viewer = 'customer' | 'worker';

export type TimelineInput = {
  status: string;
  /** `customer_job` is a job posted to everyone; anything else is a request sent to one Ustad. */
  origin: string;
  /** The Ustad has said the work is done (not yet confirmed by the customer). */
  workerDone: boolean;
  /** At least one quote has been sent. */
  hasQuote: boolean;
  /** The Ustad is, or was, on the way (only known while live tracking is on). */
  enRoute: boolean;
  /** Show the "on the way" step: only while live tracking is switched on. */
  showEnRoute: boolean;
};

export type TimelineStep = { id: StepId; labelId: StringId; done: boolean; current: boolean };

export type Timeline = {
  steps: TimelineStep[];
  /** A job that stopped early or went wrong, shown after the steps that happened. */
  terminal: 'cancelled' | 'disputed' | null;
  /** What happens next, for this person. */
  nextId: StringId | null;
};

const RANK: Record<string, number> = {
  open: 0,
  quoted: 1,
  pending_customer_confirm: 1,
  assigned: 2,
  completed: 3,
  payment_pending: 4,
  disputed: 4,
  closed: 5,
};

const LABEL: Record<StepId, StringId> = {
  posted: 'timeline.step.posted',
  requested: 'timeline.step.requested',
  quoted: 'timeline.step.quoted',
  accepted: 'timeline.step.accepted',
  enRoute: 'timeline.step.enRoute',
  done: 'timeline.step.done',
  confirmed: 'timeline.step.confirmed',
  paid: 'timeline.step.paid',
  closed: 'timeline.step.closed',
};

function nextFor(i: TimelineInput, viewer: Viewer, rank: number): StringId | null {
  if (i.status === 'cancelled') return 'timeline.next.cancelled';
  if (i.status === 'disputed') return 'timeline.next.disputed';
  if (rank <= 1) return viewer === 'customer' ? 'timeline.next.customer.waitQuotes' : null;
  if (rank === 2) {
    if (i.workerDone) return viewer === 'customer' ? 'timeline.next.customer.confirm' : 'timeline.next.worker.waitConfirm';
    return viewer === 'customer' ? 'timeline.next.customer.working' : 'timeline.next.worker.work';
  }
  if (rank === 3) return viewer === 'customer' ? 'timeline.next.customer.pay' : 'timeline.next.worker.waitPay';
  if (rank === 4) return viewer === 'customer' ? 'timeline.next.customer.waitReceipt' : 'timeline.next.worker.confirmReceipt';
  return viewer === 'customer' ? 'timeline.next.customer.rate' : 'timeline.next.worker.finished';
}

/** The "what happens next" line for a job row, from just its status. */
export function nextHintFor(status: string, workerDone: boolean, viewer: Viewer): StringId | null {
  const rank = RANK[status] ?? 0;
  return nextFor({ status, origin: 'customer_job', workerDone, hasQuote: false, enRoute: false, showEnRoute: false }, viewer, rank);
}

export function buildTimeline(i: TimelineInput, viewer: Viewer): Timeline {
  const cancelled = i.status === 'cancelled';
  const rank = RANK[i.status] ?? 0;
  const first: StepId = i.origin === 'customer_job' ? 'posted' : 'requested';

  const all: Array<[StepId, boolean]> = [
    [first, true],
    ['quoted', rank >= 1 || i.hasQuote],
    ['accepted', rank >= 2],
  ];
  if (i.showEnRoute) all.push(['enRoute', rank >= 3 || i.enRoute || i.workerDone]);
  all.push(['done', rank >= 3 || i.workerDone], ['confirmed', rank >= 3], ['paid', rank >= 4], ['closed', i.status === 'closed']);

  // A cancelled job shows only what really happened: it was posted.
  const kept = cancelled ? all.slice(0, 1) : all;
  let currentSet = false;
  const steps = kept.map(([id, done]) => {
    const current = !done && !currentSet && !cancelled;
    if (current) currentSet = true;
    return { id, labelId: LABEL[id], done, current };
  });

  return {
    steps,
    terminal: cancelled ? 'cancelled' : i.status === 'disputed' ? 'disputed' : null,
    nextId: nextFor(i, viewer, rank),
  };
}
