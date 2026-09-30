import { supabase } from './supabase';

/**
 * Quote commission markup: the Ustad types the price they want to earn (X); the customer sees X plus
 * the platform commission, rounded up to a whole rupee. The server owns the maths
 * (`quote_price_preview`); this only reads it. With the server flag off the preview has no
 * commission and the UI shows nothing extra.
 */
export type QuotePreview = { customerPrice: number; commission: number; commissionPct: number };

type PreviewRow = { customer_price?: unknown; commission?: unknown; commission_pct?: unknown };

/** Turns the RPC's row into a preview, or null when the markup is off or the row is unusable. */
export function parsePreview(data: unknown): QuotePreview | null {
  const row = (Array.isArray(data) ? data[0] : data) as PreviewRow | null | undefined;
  if (!row) return null;
  const customerPrice = Number(row.customer_price);
  const commission = Number(row.commission);
  const commissionPct = Number(row.commission_pct);
  if (![customerPrice, commission, commissionPct].every(Number.isFinite)) return null;
  if (commission <= 0) return null;
  return { customerPrice, commission, commissionPct };
}

/** Parses what the Ustad typed; null unless it is a non-negative number. */
export function parsePreviewAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function fetchQuotePreview(amount: number): Promise<QuotePreview | null> {
  try {
    const { data, error } = await supabase.rpc('quote_price_preview', { p_amount_pkr: amount });
    if (error) return null;
    return parsePreview(data);
  } catch {
    return null;
  }
}
