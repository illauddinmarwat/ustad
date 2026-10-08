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
  | { screen: 'JobDetail' | 'JobChat' | 'BoardJob'; params: { jobId: string } }
  | { screen: 'Applications' }
  | { screen: 'Account' };

/** Where tapping a notification (in-app or push) should go. */
export function notificationTarget(kind: string, jobId: string | null | undefined): NotificationTarget {
  if (kind.startsWith('commission_') || kind.startsWith('account_')) return { screen: 'Account' };
  // A message before the job is assigned lives in the chat screen (which hands over to the job once assigned).
  if (jobId && kind === 'thread_message') return { screen: 'JobChat', params: { jobId } };
  // A direct request is answered with a quote, which is done on the board page.
  if (jobId && kind === 'request_received') return { screen: 'BoardJob', params: { jobId } };
  if (jobId) return { screen: 'JobDetail', params: { jobId } };
  // Listing applications have no job yet; the inbox for them is Applications.
  return { screen: 'Applications' };
}

export type NotificationGroup = { key: string; latest: NotificationRow; earlier: NotificationRow[] };

/** One group per job (newest first), so a busy job is one row with its earlier updates behind a tap. */
export function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups: NotificationGroup[] = [];
  const byJob = new Map<string, NotificationGroup>();
  for (const r of sorted) {
    const existing = r.job_id ? byJob.get(r.job_id) : undefined;
    if (existing) {
      existing.earlier.push(r);
      continue;
    }
    const g: NotificationGroup = { key: r.job_id ?? r.id, latest: r, earlier: [] };
    if (r.job_id) byJob.set(r.job_id, g);
    groups.push(g);
  }
  return groups;
}

/** "just now", "5 min ago", "2 h ago", "3 days ago"; in Urdu when asked. */
export function timeAgo(iso: string, lang: 'en' | 'ur', now: number = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const ur = lang === 'ur';
  if (mins < 1) return ur ? 'ابھی' : 'just now';
  if (mins < 60) return ur ? `${mins} منٹ پہلے` : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ur ? `${hours} گھنٹے پہلے` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return ur ? `${days} دن پہلے` : `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Badge text: nothing for 0, "9+" style cap for large counts. */
export function badgeValue(count: number): number | undefined {
  return count > 0 ? Math.min(count, 99) : undefined;
}

