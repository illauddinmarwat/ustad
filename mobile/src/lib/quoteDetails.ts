import { supabase } from './supabase';

/**
 * Richer quotes: a price type (fixed, or an estimate confirmed after inspection), the day the worker can
 * start, and comparison data for the customer. Server flag: `app_settings.quote_upgrades_enabled`
 * (default false). See docs/job-quotes-plan.md.
 */

export type PriceType = 'fixed' | 'estimate';
export type QuoteSort = 'price' | 'rating' | 'soonest';

let flagCache: { value: boolean; at: number } | null = null;

export async function fetchQuoteUpgradesEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'quote_upgrades_enabled')
      .maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = !error && (raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true'));
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

export const AVAILABILITY_OPTIONS = [
  { key: 'today', days: 0 },
  { key: 'tomorrow', days: 1 },
  { key: 'in2', days: 2 },
  { key: 'in3', days: 3 },
  { key: 'week', days: 7 },
] as const;

export type AvailabilityKey = (typeof AVAILABILITY_OPTIONS)[number]['key'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** A local calendar date as YYYY-MM-DD, `days` from now. */
export function dateFromNow(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function availabilityDate(key: AvailabilityKey, now: Date = new Date()): string {
  const opt = AVAILABILITY_OPTIONS.find((o) => o.key === key);
  return dateFromNow(opt ? opt.days : 0, now);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", or "5 Oct"; null when the quote has no date (older quotes). */
export function formatAvailability(date: string | null | undefined, now: Date = new Date()): string | null {
  if (!date) return null;
  if (date <= dateFromNow(0, now)) return 'Today';
  if (date === dateFromNow(1, now)) return 'Tomorrow';
  const [, m, d] = date.split('-').map(Number);
  if (!m || !d) return null;
  return `${d} ${MONTHS[m - 1]}`;
}

type Sortable = {
  amount_pkr: number;
  avg_rating: number | null;
  available_from?: string | null;
  created_at: string;
};

/** Returns a sorted copy. Missing ratings and dates sort last; ties keep the server's order. */
export function sortQuotes<T extends Sortable>(quotes: T[], mode: QuoteSort): T[] {
  const indexed = quotes.map((q, i) => ({ q, i }));
  indexed.sort((a, b) => {
    let diff = 0;
    if (mode === 'price') diff = a.q.amount_pkr - b.q.amount_pkr;
    else if (mode === 'rating') diff = (b.q.avg_rating ?? -1) - (a.q.avg_rating ?? -1);
    else {
      const ad = a.q.available_from ?? '9999-12-31';
      const bd = b.q.available_from ?? '9999-12-31';
      diff = ad < bd ? -1 : ad > bd ? 1 : 0;
    }
    return diff !== 0 ? diff : a.i - b.i;
  });
  return indexed.map((x) => x.q);
}
