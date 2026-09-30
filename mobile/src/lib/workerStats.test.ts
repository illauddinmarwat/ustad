jest.mock('./supabase', () => ({ supabase: {} }));

import type { CommissionEntry } from './commission';
import { formatPkr, summarizeEarnings } from './workerStats';

const entry = (created_at: string, amount: number, commission: number, status: CommissionEntry['ledger_status'] = 'due'): CommissionEntry => ({
  id: created_at,
  job_id: 'j',
  job_title: 't',
  order_amount_pkr: amount,
  commission_pct: 15,
  commission_pkr: commission,
  due_date: '2026-10-10',
  ledger_status: status,
  settled_at: null,
  created_at,
});

describe('summarizeEarnings', () => {
  const now = new Date(2026, 8, 30, 12); // 30 Sep 2026

  it('totals this month only and counts the last 7 days', () => {
    const s = summarizeEarnings(
      [
        entry(new Date(2026, 8, 29).toISOString(), 1000, 150),
        entry(new Date(2026, 8, 5).toISOString(), 2000, 300),
        entry(new Date(2026, 7, 20).toISOString(), 5000, 750),
      ],
      now
    );
    expect(s).toEqual({ monthGross: 3000, monthCommission: 450, monthNet: 2550, monthJobs: 2, weekJobs: 1 });
  });

  it('does not charge waived commission', () => {
    const s = summarizeEarnings([entry(new Date(2026, 8, 29).toISOString(), 1000, 150, 'waived')], now);
    expect(s.monthNet).toBe(1000);
  });

  it('is zero with no entries', () => {
    expect(summarizeEarnings([], now).monthGross).toBe(0);
  });
});

describe('formatPkr', () => {
  it('groups thousands', () => expect(formatPkr(12500)).toBe('Rs 12,500'));
});
