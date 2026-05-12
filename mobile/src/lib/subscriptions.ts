export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';
export type PlanCode = 'worker_pro' | 'customer_plus';

export function isLiveSubscription(status: SubscriptionStatus | null | undefined, endsAt?: string | null): boolean {
  if (status !== 'trialing' && status !== 'active') return false;
  if (!endsAt) return true;
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return true;
  return end > Date.now();
}

export function subscriptionBadge(planCode: PlanCode | null, isLive: boolean): string | null {
  if (!isLive || !planCode) return null;
  if (planCode === 'worker_pro') return 'Worker Pro';
  if (planCode === 'customer_plus') return 'Customer Plus';
  return null;
}
