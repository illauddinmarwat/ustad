// Pure helpers (no native modules) so screens and tests can import them cheaply.

export type NotificationRow = {
  id: string;
  kind: string;
  job_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type NotificationTarget =
  | { screen: 'JobDetail'; params: { jobId: string } }
  | { screen: 'Applications' }
  | { screen: 'Account' };

/** Where tapping a notification (in-app or push) should go. */
export function notificationTarget(kind: string, jobId: string | null | undefined): NotificationTarget {
  if (kind.startsWith('commission_') || kind.startsWith('account_')) return { screen: 'Account' };
  if (jobId) return { screen: 'JobDetail', params: { jobId } };
  // Listing applications have no job yet; the inbox for them is Applications.
  return { screen: 'Applications' };
}

/** Badge text: nothing for 0, "9+" style cap for large counts. */
export function badgeValue(count: number): number | undefined {
  return count > 0 ? Math.min(count, 99) : undefined;
}

