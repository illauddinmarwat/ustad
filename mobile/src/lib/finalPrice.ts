import { supabase } from './supabase';

/**
 * Estimates and final price (docs/job-quotes-plan.md, Phase 2). After the customer accepts an estimate quote,
 * the Ustad proposes a final price; the customer confirms it before paying. The server keeps the Ustad's own
 * price and the commission private and returns each side only its own number.
 */

export type FinalPriceStatus = 'none' | 'proposed' | 'confirmed' | 'declined';

export type FinalPriceInfo = {
  isEstimate: boolean;
  status: FinalPriceStatus;
  /** The viewer's own number: the customer price for a customer, the Ustad's own price for the Ustad. */
  amount: number | null;
  /** What is paid in cash; both sides need it for the payment step. */
  customerPrice: number | null;
  attempts: number;
  viewer: 'customer' | 'worker' | 'admin';
};

type Row = {
  is_estimate?: boolean;
  status?: string;
  amount_pkr?: number | null;
  customer_price_pkr?: number | null;
  attempts?: number;
  viewer?: string;
};

const STATUSES: FinalPriceStatus[] = ['none', 'proposed', 'confirmed', 'declined'];

/** Turns the RPC's row into the info the screen needs, or null when the caller may not see this job. */
export function parseFinalPrice(data: unknown): FinalPriceInfo | null {
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  if (!row) return null;
  const status = STATUSES.includes(row.status as FinalPriceStatus) ? (row.status as FinalPriceStatus) : 'none';
  const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    isEstimate: row.is_estimate === true,
    status,
    amount: num(row.amount_pkr),
    customerPrice: num(row.customer_price_pkr),
    attempts: Number(row.attempts ?? 0) || 0,
    viewer: row.viewer === 'worker' || row.viewer === 'admin' ? row.viewer : 'customer',
  };
}

export async function fetchFinalPrice(jobId: string): Promise<FinalPriceInfo | null> {
  try {
    const { data, error } = await supabase.rpc('job_final_price', { p_job_id: jobId });
    if (error) return null;
    return parseFinalPrice(data);
  } catch {
    return null;
  }
}

/** The Ustad proposes their own price; returns an error message, or null on success. */
export async function proposeFinalPrice(jobId: string, amount: number): Promise<string | null> {
  const { error } = await supabase.rpc('worker_set_final_price', { p_job_id: jobId, p_amount_pkr: amount });
  return error ? error.message : null;
}

/** The customer accepts or declines the proposed price; returns an error message, or null on success. */
export async function respondFinalPrice(jobId: string, accept: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('customer_respond_final_price', { p_job_id: jobId, p_accept: accept });
  return error ? error.message : null;
}
