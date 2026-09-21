import { commissionState, daysUntil, dueText, type CommissionSummary } from './commission';
import { notificationTarget } from './notificationHelpers';

const summary = (over: Partial<CommissionSummary> = {}): CommissionSummary => ({
  outstanding_pkr: 0,
  overdue_pkr: 0,
  next_due_date: null,
  overdue_count: 0,
  account_deactivated: false,
  deactivate_after_days: 14,
  ...over,
});

describe('commissionState', () => {
  it('picks the most urgent state', () => {
    expect(commissionState(null, false)).toBe('none');
    expect(commissionState(summary({ account_deactivated: true, overdue_pkr: 500, outstanding_pkr: 500 }), true)).toBe('deactivated');
    expect(commissionState(summary({ overdue_pkr: 300, outstanding_pkr: 900 }), true)).toBe('overdue');
    expect(commissionState(summary({ outstanding_pkr: 900 }), true)).toBe('due');
  });

  it('shows "clear" only for a worker who has paid before, and nothing for a brand-new worker', () => {
    expect(commissionState(summary(), true)).toBe('clear');
    expect(commissionState(summary(), false)).toBe('none');
  });

  it('reads numeric strings from the database', () => {
    expect(commissionState(summary({ overdue_pkr: '250.00' as unknown as number }), true)).toBe('overdue');
  });
});

describe('dueText / daysUntil', () => {
  const today = new Date(2026, 8, 21); // 21 Sep 2026, local

  it('counts days to the due date', () => {
    expect(daysUntil('2026-09-28', today)).toBe(7);
    expect(daysUntil('2026-09-21', today)).toBe(0);
    expect(daysUntil('2026-09-19', today)).toBe(-2);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('words it for the worker', () => {
    expect(dueText('2026-09-28', today)).toBe('Due in 7 days');
    expect(dueText('2026-09-22', today)).toBe('Due in 1 day');
    expect(dueText('2026-09-21', today)).toBe('Due today');
    expect(dueText('2026-09-20', today)).toBe('1 day overdue');
    expect(dueText('2026-09-10', today)).toBe('11 days overdue');
    expect(dueText(undefined, today)).toBeNull();
  });
});

describe('notificationTarget for Hisab events', () => {
  it('opens the Account tab for commission and account notifications', () => {
    for (const k of ['commission_created', 'commission_overdue', 'commission_warning', 'account_deactivated', 'account_reactivated']) {
      expect(notificationTarget(k, null)).toEqual({ screen: 'Account' });
    }
  });

  it('still opens the job for job notifications', () => {
    expect(notificationTarget('commission_created', 'j1')).toEqual({ screen: 'Account' });
    expect(notificationTarget('job_closed', 'j1')).toEqual({ screen: 'JobDetail', params: { jobId: 'j1' } });
  });
});
