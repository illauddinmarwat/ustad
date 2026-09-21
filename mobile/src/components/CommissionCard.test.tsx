import React from 'react';
import { render } from '@testing-library/react-native';

import { CommissionCard } from './CommissionCard';

const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const setup = (summary: unknown, entries: unknown[]) =>
  mockRpc.mockImplementation((name: string) =>
    Promise.resolve({ data: name === 'get_my_commission_summary' ? [summary] : entries, error: null }),
  );

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  job_id: 'j1',
  job_title: 'Fix kitchen tap',
  order_amount_pkr: 2000,
  commission_pct: 15,
  commission_pkr: 300,
  due_date: '2030-01-01',
  ledger_status: 'due',
  settled_at: null,
  created_at: '2026-09-21T10:00:00Z',
  ...over,
});

const base = { outstanding_pkr: 0, overdue_pkr: 0, next_due_date: null, overdue_count: 0, account_deactivated: false, deactivate_after_days: 14 };

beforeEach(() => mockRpc.mockReset());

describe('CommissionCard', () => {
  it('shows what is owed with each job and its due date', async () => {
    setup({ ...base, outstanding_pkr: 300, next_due_date: '2030-01-01' }, [entry()]);
    const { findAllByText, getByText } = render(<CommissionCard />);
    expect((await findAllByText('Rs 300')).length).toBe(2); // the total, and the job row
    expect(getByText('Fix kitchen tap')).toBeTruthy();
    expect(getByText('Rs 2000 × 15% · due 2030-01-01')).toBeTruthy();
    expect(getByText('Due')).toBeTruthy();
  });

  it('warns about overdue commission', async () => {
    setup({ ...base, outstanding_pkr: 300, overdue_pkr: 300, overdue_count: 1, next_due_date: '2026-09-01' }, [entry({ ledger_status: 'overdue', due_date: '2026-09-01' })]);
    const { findByText, getByText } = render(<CommissionCard />);
    expect(await findByText(/You have overdue commission/)).toBeTruthy();
    expect(getByText('Overdue: Rs 300')).toBeTruthy();
  });

  it('tells a deactivated worker how to get back in', async () => {
    setup({ ...base, outstanding_pkr: 300, overdue_pkr: 300, account_deactivated: true }, [entry({ ledger_status: 'overdue' })]);
    const { findByText } = render(<CommissionCard />);
    expect(await findByText(/Your account is deactivated because of unpaid commission/)).toBeTruthy();
  });

  it('confirms when everything is paid, and shows the paid history', async () => {
    setup(base, [entry({ ledger_status: 'paid' })]);
    const { findByText, getByText } = render(<CommissionCard />);
    expect(await findByText('You have nothing to pay right now.')).toBeTruthy();
    expect(getByText('Paid')).toBeTruthy();
  });

  it('renders nothing for a worker with no commission history', async () => {
    setup(base, []);
    const { toJSON } = render(<CommissionCard />);
    await new Promise((r) => setTimeout(r, 20));
    expect(toJSON()).toBeNull();
  });
});
