import { groupNotifications, notificationTarget, timeAgo, type NotificationRow } from './notificationHelpers';

const row = (id: string, job: string | null, at: string): NotificationRow => ({
  id, kind: 'x', job_id: job, title: id, body: id, read_at: null, created_at: at,
});

describe('groupNotifications', () => {
  it('makes one group per job with the newest first and the rest as earlier updates', () => {
    const groups = groupNotifications([
      row('a1', 'A', '2026-10-04T10:00:00Z'),
      row('b1', 'B', '2026-10-04T11:00:00Z'),
      row('a2', 'A', '2026-10-04T12:00:00Z'),
      row('a0', 'A', '2026-10-04T09:00:00Z'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['A', 'B']);
    expect(groups[0].latest.id).toBe('a2');
    expect(groups[0].earlier.map((r) => r.id)).toEqual(['a1', 'a0']);
  });

  it('keeps notifications that belong to no job as their own rows', () => {
    const groups = groupNotifications([row('n1', null, '2026-10-04T10:00:00Z'), row('n2', null, '2026-10-04T11:00:00Z')]);
    expect(groups).toHaveLength(2);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-04T12:00:00Z').getTime();
  it('says it in minutes, hours and days, in English or Urdu', () => {
    expect(timeAgo('2026-10-04T11:59:40Z', 'en', now)).toBe('just now');
    expect(timeAgo('2026-10-04T11:55:00Z', 'en', now)).toBe('5 min ago');
    expect(timeAgo('2026-10-04T09:00:00Z', 'en', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-02T12:00:00Z', 'en', now)).toBe('2 days ago');
    expect(timeAgo('2026-10-04T11:55:00Z', 'ur', now)).toBe('5 منٹ پہلے');
  });
});

describe('notificationTarget', () => {
  it('opens the chat for a message, the board page for a direct request, and the job otherwise', () => {
    expect(notificationTarget('thread_message', 'j1')).toEqual({ screen: 'JobChat', params: { jobId: 'j1' } });
    expect(notificationTarget('request_received', 'j1')).toEqual({ screen: 'BoardJob', params: { jobId: 'j1' } });
    expect(notificationTarget('job_assigned', 'j1')).toEqual({ screen: 'JobDetail', params: { jobId: 'j1' } });
  });
  it('sends account notices to Account and job-less ones to Applications', () => {
    expect(notificationTarget('commission_overdue', null)).toEqual({ screen: 'Account' });
    expect(notificationTarget('application_received', null)).toEqual({ screen: 'Applications' });
  });
});
