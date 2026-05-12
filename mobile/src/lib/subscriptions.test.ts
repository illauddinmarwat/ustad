import { isLiveSubscription, subscriptionBadge } from './subscriptions';

describe('phase4 subscriptions helpers', () => {
  it('treats active/trialing without end date as live', () => {
    expect(isLiveSubscription('active')).toBe(true);
    expect(isLiveSubscription('trialing')).toBe(true);
  });

  it('treats cancelled/past_due as not live', () => {
    expect(isLiveSubscription('cancelled')).toBe(false);
    expect(isLiveSubscription('past_due')).toBe(false);
  });

  it('respects ends_at cutoff', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isLiveSubscription('active', past)).toBe(false);
    expect(isLiveSubscription('active', future)).toBe(true);
  });

  it('returns user-facing badge label only for live plans', () => {
    expect(subscriptionBadge('worker_pro', true)).toBe('Worker Pro');
    expect(subscriptionBadge('customer_plus', true)).toBe('Customer Plus');
    expect(subscriptionBadge('worker_pro', false)).toBeNull();
  });
});
