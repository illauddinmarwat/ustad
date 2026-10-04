import { buildTimeline, type TimelineInput } from './jobTimeline';

const base: TimelineInput = { status: 'assigned', origin: 'customer_job', workerDone: false, hasQuote: true, enRoute: false, showEnRoute: false };
const ids = (i: Partial<TimelineInput>, v: 'customer' | 'worker' = 'customer') =>
  buildTimeline({ ...base, ...i }, v).steps.map((s) => `${s.id}:${s.done ? 'x' : s.current ? '>' : '.'}`).join(' ');

describe('buildTimeline', () => {
  it('shows a posted job waiting for prices, and tells the customer to wait', () => {
    const t = buildTimeline({ ...base, status: 'open', hasQuote: false }, 'customer');
    expect(t.steps.map((s) => s.id)).toEqual(['posted', 'quoted', 'accepted', 'done', 'confirmed', 'paid', 'closed']);
    expect(ids({ status: 'open', hasQuote: false })).toBe('posted:x quoted:> accepted:. done:. confirmed:. paid:. closed:.');
    expect(t.nextId).toBe('timeline.next.customer.waitQuotes');
  });

  it('calls a request to one Ustad a request, not a posted job', () => {
    expect(buildTimeline({ ...base, origin: 'direct_request', status: 'open' }, 'customer').steps[0].labelId).toBe('timeline.step.requested');
  });

  it('marks the first steps done once a price is accepted, and the work as the current step', () => {
    expect(ids({})).toBe('posted:x quoted:x accepted:x done:> confirmed:. paid:. closed:.');
    expect(buildTimeline(base, 'customer').nextId).toBe('timeline.next.customer.working');
    expect(buildTimeline(base, 'worker').nextId).toBe('timeline.next.worker.work');
  });

  it('shows the on-the-way step only while tracking is on', () => {
    expect(ids({ showEnRoute: true, enRoute: true })).toBe('posted:x quoted:x accepted:x enRoute:x done:> confirmed:. paid:. closed:.');
    expect(ids({ showEnRoute: false })).not.toContain('enRoute');
  });

  it('asks the customer to confirm once the Ustad says it is done, and the Ustad to wait', () => {
    expect(ids({ workerDone: true })).toBe('posted:x quoted:x accepted:x done:x confirmed:> paid:. closed:.');
    expect(buildTimeline({ ...base, workerDone: true }, 'customer').nextId).toBe('timeline.next.customer.confirm');
    expect(buildTimeline({ ...base, workerDone: true }, 'worker').nextId).toBe('timeline.next.worker.waitConfirm');
  });

  it('moves on through completed, payment pending and closed', () => {
    expect(ids({ status: 'completed' })).toBe('posted:x quoted:x accepted:x done:x confirmed:x paid:> closed:.');
    expect(buildTimeline({ ...base, status: 'completed' }, 'customer').nextId).toBe('timeline.next.customer.pay');
    expect(buildTimeline({ ...base, status: 'completed' }, 'worker').nextId).toBe('timeline.next.worker.waitPay');
    expect(buildTimeline({ ...base, status: 'payment_pending' }, 'worker').nextId).toBe('timeline.next.worker.confirmReceipt');
    expect(ids({ status: 'closed' })).toBe('posted:x quoted:x accepted:x done:x confirmed:x paid:x closed:x');
    expect(buildTimeline({ ...base, status: 'closed' }, 'customer').nextId).toBe('timeline.next.customer.rate');
  });

  it('shows a cancelled job as posted and cancelled only', () => {
    const t = buildTimeline({ ...base, status: 'cancelled' }, 'customer');
    expect(t.steps.map((s) => s.id)).toEqual(['posted']);
    expect(t.terminal).toBe('cancelled');
    expect(t.nextId).toBe('timeline.next.cancelled');
  });

  it('flags a payment problem after the steps that happened', () => {
    const t = buildTimeline({ ...base, status: 'disputed' }, 'worker');
    expect(t.terminal).toBe('disputed');
    expect(t.steps.find((s) => s.id === 'paid')?.done).toBe(true);
    expect(t.nextId).toBe('timeline.next.disputed');
  });
});
