/**
 * The worker's side of the Hisab: what they owe Ustad from cash jobs, and when.
 * Server: `get_my_commission_summary`, `list_my_commissions`.
 */
export type CommissionSummary = {
  outstanding_pkr: number;
  overdue_pkr: number;
  next_due_date: string | null;
  overdue_count: number;
  account_deactivated: boolean;
  deactivate_after_days: number;
};

export type CommissionEntry = {
  id: string;
  job_id: string;
  job_title: string;
  order_amount_pkr: number;
  commission_pct: number;
  commission_pkr: number;
  due_date: string;
  ledger_status: 'due' | 'paid' | 'overdue' | 'waived';
  settled_at: string | null;
  created_at: string;
};

/** What the summary card should say, most urgent state first. */
export type CommissionState = 'none' | 'clear' | 'due' | 'overdue' | 'deactivated';

export function commissionState(s: CommissionSummary | null, hasHistory: boolean): CommissionState {
  if (!s) return 'none';
  if (s.account_deactivated) return 'deactivated';
  if (Number(s.overdue_pkr) > 0) return 'overdue';
  if (Number(s.outstanding_pkr) > 0) return 'due';
  return hasHistory ? 'clear' : 'none';
}

/** Whole days from `today` to `dueDate` (negative when late). Dates are YYYY-MM-DD. */
export function daysUntil(dueDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = Date.UTC(Number(dueDate.slice(0, 4)), Number(dueDate.slice(5, 7)) - 1, Number(dueDate.slice(8, 10)));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!Number.isFinite(due)) return null;
  return Math.round((due - now) / 86_400_000);
}

export function dueText(dueDate: string | null | undefined, today: Date = new Date()): string | null {
  const d = daysUntil(dueDate, today);
  if (d == null) return null;
  if (d === 0) return 'Due today';
  if (d > 0) return `Due in ${d} day${d === 1 ? '' : 's'}`;
  return `${-d} day${d === -1 ? '' : 's'} overdue`;
}

export const ENTRY_LABEL: Record<CommissionEntry['ledger_status'], string> = {
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  waived: 'Waived',
};
