import { supabase } from './supabase';

/**
 * "Typical price" for a kind of job: the middle and the usual range of what customers paid for similar jobs in
 * the last 90 days. The server returns nothing when there are too few jobs, so it never reveals a single job.
 */
export type TypicalPrice = {
  scope: 'city' | 'category';
  sampleSize: number;
  low: number;
  median: number;
  high: number;
};

type Row = { scope?: string; sample_size?: number; low_pkr?: unknown; median_pkr?: unknown; high_pkr?: unknown };

export function parseTypicalPrice(data: unknown): TypicalPrice | null {
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  if (!row) return null;
  if (row.low_pkr == null || row.median_pkr == null || row.high_pkr == null) return null;
  const low = Number(row.low_pkr);
  const median = Number(row.median_pkr);
  const high = Number(row.high_pkr);
  if (![low, median, high].every(Number.isFinite)) return null;
  return {
    scope: row.scope === 'city' ? 'city' : 'category',
    sampleSize: Number(row.sample_size ?? 0) || 0,
    low,
    median,
    high,
  };
}

/** "Rs 1,000 - 2,000" (or a single figure when the range is one number). */
export function formatRange(low: number, high: number): string {
  const f = (n: number) => n.toLocaleString('en-US');
  return low === high ? `Rs ${f(low)}` : `Rs ${f(low)} - ${f(high)}`;
}

export async function fetchTypicalPrice(category: string, city: string | null | undefined): Promise<TypicalPrice | null> {
  try {
    const { data, error } = await supabase.rpc('typical_price', { p_category: category, p_city: city ?? null });
    if (error) return null;
    return parseTypicalPrice(data);
  } catch {
    return null;
  }
}
