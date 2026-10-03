export type PaymentRow = {
  id: string;
  job_id: string;
  amount_pkr: number;
  fee_pkr: number;
  method: 'manual' | 'jazzcash' | 'easypaisa' | 'bank' | 'cash';
  status: 'pending' | 'paid' | 'refunded' | 'disputed';
  transaction_id: string | null;
  worker_confirmed: boolean;
  commission_pct: number | null;
  note: string | null;
  created_at: string;
  payer_id: string;
  payee_id: string;
};

export type ProfileLite = { id: string; display_name: string | null; city: string | null };

export type CommissionSummary = {
  total_earnings: number;
  total_commission: number;
  total_paid_to_workers: number;
  total_jobs_paid: number;
};

export type WorkerCommissionRow = {
  worker_id: string;
  display_name: string | null;
  city: string | null;
  total_jobs: number;
  total_commission: number;
  net_paid: number;
};

export type ReportsSummary = {
  total_earnings: number;
  prev_total_earnings: number;
  new_customers: number;
  prev_new_customers: number;
  avg_commission_pct: number;
  active_workers: number;
};

export type MonthlyEarningsRow = { month_start: string; total_pkr: number };

export type TopWorkerRow = {
  worker_id: string;
  display_name: string | null;
  avg_rating: number | null;
  review_count: number | null;
  total_jobs_paid: number;
  total_earnings: number;
};

export type PaymentMethods = { easypaisa: boolean; jazzcash: boolean; cash: boolean };

export type WorkerApprovalRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  /** True when the area is not in the managed list yet; it is added when the worker is approved. */
  area_is_new: boolean;
  lat: number | null;
  lng: number | null;
  cnic_number: string | null;
  categories: string[] | null;
  years_experience: number | null;
  rate_pkr: number | null;
  rate_unit: 'hour' | 'day' | null;
  working_hours: string | null;
  bio: string | null;
  photo_url: string | null;
  cnic_front_url: string | null;
  cnic_back_url: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
};

export type JobEventRow = {
  id: string;
  job_id: string;
  kind: 'accepted' | 'payment_pending' | 'closed' | 'disputed' | 'dispute_resolved' | 'moderated';
  detail: Record<string, unknown> | null;
  created_at: string;
  job_title: string;
  job_status: string;
  customer_name: string | null;
  worker_name: string | null;
};

export type CommissionBalanceRow = {
  worker_id: string;
  worker_name: string | null;
  city: string | null;
  outstanding_pkr: number;
  not_yet_due_pkr: number;
  overdue_1_7_pkr: number;
  overdue_8_30_pkr: number;
  overdue_30_plus_pkr: number;
  oldest_due_date: string | null;
  account_deactivated: boolean;
};

export type CommissionRow = {
  id: string;
  worker_id: string;
  worker_name: string | null;
  job_id: string;
  job_title: string;
  order_amount_pkr: number;
  commission_pct: number;
  commission_pkr: number;
  due_date: string;
  ledger_status: 'due' | 'paid' | 'overdue' | 'waived';
  settled_at: string | null;
  settlement_method: string | null;
  settlement_ref: string | null;
  note: string | null;
  created_at: string;
};

export type PostedJobRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  city: string | null;
  job_status: string;
  is_guest: boolean;
  quote_count: number;
  created_at: string;
  expires_at: string | null;
  customer_name: string | null;
};

export type AiUsageRow = {
  day: string;
  calls: number;
  failed: number;
  tokens_in: number;
  tokens_out: number;
  people: number;
};

export type FunnelRow = {
  flow: 'service' | 'direct' | 'posted';
  created: number;
  assigned_or_later: number;
  work_done: number;
  closed: number;
  cancelled: number;
};

export type SettingAuditRow = {
  id: string;
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by_name: string | null;
  changed_at: string;
};

export type DashboardCounts = {
  pending_workers: number;
  approved_workers: number;
  rejected_workers: number;
  customers: number;
  pending_payments: number;
  open_disputes: number;
  overdue_dues_pkr: number;
  overdue_30_plus_workers: number;
  suspended_workers: number;
  open_posted_jobs: number;
  new_areas_pending: number;
  approved_without_location: number;
  approved_without_photo: number;
  active_listings: number;
};

export type DashboardKpis = {
  earnings_pkr: number;
  prev_earnings_pkr: number;
  commission_pkr: number;
  prev_commission_pkr: number;
  jobs_completed: number;
  prev_jobs_completed: number;
  new_customers: number;
  prev_new_customers: number;
  new_workers: number;
  prev_new_workers: number;
  avg_rating: number | null;
  prev_avg_rating: number | null;
};

export type BreakdownRow = { dimension: 'city' | 'category'; label: string; workers: number; jobs: number };

export type MapWorker = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  categories: string[] | null;
  avg_rating: number | null;
  lat: number;
  lng: number;
};

/** How a job's accepted quote was priced; `ustad_price_pkr` is null when the commission was not added on top. */
export type JobPricingRow = {
  job_id: string;
  customer_price_pkr: number;
  ustad_price_pkr: number | null;
  commission_pkr: number | null;
  commission_pct: number | null;
  marked_up: boolean;
};
