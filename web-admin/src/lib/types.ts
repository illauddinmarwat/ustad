export type PaymentRow = {
  id: string;
  job_id: string;
  amount_pkr: number;
  fee_pkr: number;
  method: 'manual' | 'jazzcash' | 'easypaisa' | 'bank';
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
