import { nextStep } from './jobNextStep';

const base = { viewer: 'worker', status: 'assigned', origin: 'customer_job', workerDone: false, realtime: true, enRoute: false, startedWork: false, tracked: false } as const;

describe('nextStep', () => {
  it('walks the Ustad from on the way, to arrived, to work done', () => {
    expect(nextStep(base)?.action).toBe('startEnRoute');
    expect(nextStep({ ...base, enRoute: true, tracked: true })?.action).toBe('arrived');
    // After Arrived (a status row exists, no longer en route) the next step is Work done.
    expect(nextStep({ ...base, tracked: true })?.action).toBe('workDone');
    expect(nextStep({ ...base, startedWork: true, tracked: true })?.action).toBe('workDone');
  });
  it('keeps Work done reachable under Start en-route and Arrived', () => {
    expect(nextStep(base)?.also?.action).toBe('workDone');
    expect(nextStep({ ...base, enRoute: true, tracked: true })?.also?.action).toBe('workDone');
  });
  it('goes straight to work done when live tracking is off', () => {
    expect(nextStep({ ...base, realtime: false })?.action).toBe('workDone');
  });
  it('has nothing for the Ustad once the work is marked done or the job is past assigned', () => {
    expect(nextStep({ ...base, workerDone: true })).toBeNull();
    expect(nextStep({ ...base, status: 'completed' })).toBeNull();
  });
  it('asks the customer to confirm a booking, then to confirm the work', () => {
    const c = { ...base, viewer: 'customer' } as const;
    expect(nextStep({ ...c, status: 'pending_customer_confirm', origin: 'service_listing' })?.action).toBe('confirmBooking');
    expect(nextStep(c)?.labelId).toBe('jobDetail.complete.cta');
    expect(nextStep({ ...c, workerDone: true })?.labelId).toBe('jobDetail.confirmDone.yes');
    expect(nextStep({ ...c, status: 'closed' })).toBeNull();
  });
});
