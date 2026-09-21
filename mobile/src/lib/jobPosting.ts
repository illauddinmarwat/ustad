import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/**
 * Job posting (flow C): a customer, or a guest with no account, posts a job;
 * approved workers quote; the customer accepts one. Server flag:
 * `app_settings.job_posting_enabled` (default false).
 */

let flagCache: { value: boolean; at: number } | null = null;

export async function fetchJobPostingEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 60_000) return flagCache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'job_posting_enabled')
      .maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = !error && (raw === true || (typeof raw === 'string' && raw.toLowerCase() === 'true'));
    flagCache = { value, at: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/** Same rule as the server's `_contains_contact`: 7+ digits, or a link/handle. */
export function looksLikeContact(text: string): boolean {
  const digits = text.replace(/[\s().+-]/g, '');
  if (/[0-9]{7,}/.test(digits)) return true;
  return /(https?:\/\/|www\.|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|wa\.me|whats ?app)/i.test(text);
}

export type PostJobForm = {
  category: string;
  title: string;
  description: string;
  city: string;
  area: string;
  budgetMin: string;
  budgetMax: string;
  preferredTime: string;
};

export type PostJobErrors = Partial<Record<'category' | 'title' | 'description' | 'budget' | 'contact', string>>;

export type PostJobResult =
  | {
      ok: true;
      value: {
        category: string;
        title: string;
        description: string;
        city: string | null;
        area: string | null;
        budgetMin: number | null;
        budgetMax: number | null;
        preferredTime: string | null;
      };
    }
  | { ok: false; errors: PostJobErrors };

function parseBudget(text: string): number | null | 'bad' {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'bad';
}

export function validatePostJob(form: PostJobForm): PostJobResult {
  const errors: PostJobErrors = {};
  const title = form.title.trim();
  const description = form.description.trim();

  if (!form.category) errors.category = 'Choose a category.';
  if (title.length < 3 || title.length > 120) errors.title = 'Enter a short title (3 to 120 characters).';
  if (description.length < 10) errors.description = 'Describe the job (at least 10 characters).';

  const min = parseBudget(form.budgetMin);
  const max = parseBudget(form.budgetMax);
  if (min === 'bad' || max === 'bad') errors.budget = 'Enter valid amounts, or leave the budget empty.';
  else if (min != null && max != null && min > max) errors.budget = 'Minimum cannot be above maximum.';

  if ([title, description, form.area, form.preferredTime].some(looksLikeContact)) {
    errors.contact = 'Do not include phone numbers or links. They are shared after a worker accepts.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      category: form.category,
      title,
      description,
      city: form.city.trim() || null,
      area: form.area.trim() || null,
      budgetMin: min as number | null,
      budgetMax: max as number | null,
      preferredTime: form.preferredTime.trim() || null,
    },
  };
}

export function formatBudget(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min != null && max != null) return min === max ? `Rs ${min}` : `Rs ${min} - ${max}`;
  if (min != null) return `From Rs ${min}`;
  if (max != null) return `Up to Rs ${max}`;
  return null;
}

/** "Expires in 3 days" style text; null when already past. */
export function expiresIn(expiresAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Expires in under an hour';
  if (hours < 48) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `Expires in ${Math.floor(hours / 24)} days`;
}

// ─── Guest jobs remembered on this device ────────────────────────────────

const GUEST_KEY = 'ustad.guestJobs';

export type GuestJobRef = { jobId: string; token: string; title: string; createdAt: string };

export async function listGuestJobs(): Promise<GuestJobRef[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_KEY);
    const parsed = raw ? (JSON.parse(raw) as GuestJobRef[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addGuestJob(ref: GuestJobRef): Promise<void> {
  try {
    const rest = (await listGuestJobs()).filter((r) => r.token !== ref.token);
    await AsyncStorage.setItem(GUEST_KEY, JSON.stringify([ref, ...rest].slice(0, 20)));
  } catch {
    // Storage can fail (private mode); the job still exists server-side.
  }
}

export async function removeGuestJob(token: string): Promise<void> {
  try {
    const rest = (await listGuestJobs()).filter((r) => r.token !== token);
    await AsyncStorage.setItem(GUEST_KEY, JSON.stringify(rest));
  } catch {
    // ignore
  }
}

export type PostedJob = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  city: string | null;
  location_text: string | null;
  budget_min_pkr: number | null;
  budget_max_pkr: number | null;
  preferred_time: string | null;
  expires_at: string | null;
  worker_id: string | null;
};

export type JobQuote = {
  quote_id: string;
  worker_id: string;
  worker_name: string | null;
  amount_pkr: number;
  message: string | null;
  status: string;
  created_at: string;
  avg_rating: number | null;
  review_count: number | null;
  is_verified: boolean;
  years_experience: number | null;
};

export type ThreadMessage = { id: string; sender_role: 'worker' | 'customer'; body: string; created_at: string };
