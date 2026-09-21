import { supabase } from './supabase';

/**
 * Direct requests: a customer asks one chosen worker (from Nearby) to do a job.
 * Server flag: `app_settings.direct_requests_enabled` (default false).
 */
export type DirectRequestFlags = { enabled: boolean };

export const DIRECT_REQUEST_DEFAULT_FLAGS: DirectRequestFlags = { enabled: false };

const TTL_MS = 60_000;
let cache: { value: DirectRequestFlags; fetchedAt: number } | null = null;

export async function fetchDirectRequestFlags(): Promise<DirectRequestFlags> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key,value')
      .eq('key', 'direct_requests_enabled');
    if (error || !data) {
      cache = { value: DIRECT_REQUEST_DEFAULT_FLAGS, fetchedAt: Date.now() };
      return DIRECT_REQUEST_DEFAULT_FLAGS;
    }
    const raw = (data as Array<{ value: unknown }>)[0]?.value;
    const enabled = raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true');
    cache = { value: { enabled }, fetchedAt: Date.now() };
    return cache.value;
  } catch {
    return DIRECT_REQUEST_DEFAULT_FLAGS;
  }
}

export type RequestFormInput = {
  title: string;
  description: string;
  budget: string;
  preferredTime: string;
};

export type RequestFormErrors = Partial<Record<'title' | 'description' | 'budget', string>>;

export type RequestFormResult =
  | { ok: true; title: string; description: string; budgetPkr: number | null; preferredTime: string | null }
  | { ok: false; errors: RequestFormErrors };

/** Pure validation for the request form; the server re-checks everything. */
export function validateRequestForm(input: RequestFormInput): RequestFormResult {
  const errors: RequestFormErrors = {};
  const title = input.title.trim();
  const description = input.description.trim();
  const budgetText = input.budget.trim();

  if (title.length < 3) errors.title = 'Enter a short title (at least 3 characters).';
  if (description.length < 10) errors.description = 'Describe the job (at least 10 characters).';

  let budgetPkr: number | null = null;
  if (budgetText !== '') {
    const n = Number(budgetText.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) errors.budget = 'Enter a valid amount, or leave it empty.';
    else budgetPkr = n;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    title,
    description,
    budgetPkr,
    preferredTime: input.preferredTime.trim() || null,
  };
}

export type DirectRequestStatus = 'open' | 'quoted' | 'assigned' | 'cancelled' | 'completed' | string;

/** Customer-facing wording for a request's state. */
export function requestStatusLabel(status: DirectRequestStatus, targeted: boolean): string {
  switch (status) {
    case 'open':
      return targeted ? 'Waiting for the worker' : 'Open to other workers';
    case 'quoted':
      return 'Quote received';
    case 'assigned':
      return 'Accepted';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Declined or cancelled';
    default:
      return status;
  }
}

/** Worker can accept the stated budget as-is only if the customer gave one. */
export function canAcceptAsIs(budgetPkr: number | null | undefined): boolean {
  return budgetPkr != null && budgetPkr >= 0;
}
