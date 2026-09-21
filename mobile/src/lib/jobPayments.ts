import { supabase } from './supabase';

/**
 * Contact reveal and cash payment rules for a job.
 *
 * Lifecycle: assigned -> completed -> payment_pending -> closed
 *                                                    \-> disputed (admin resolves)
 * The server enforces all of this; these helpers only decide what to show.
 */

/** Statuses from which contact details may be shown (the worker has accepted). */
const CONTACT_STATUSES = ['assigned', 'completed', 'payment_pending', 'disputed', 'closed'];

export function contactVisible(status: string): boolean {
  return CONTACT_STATUSES.includes(status);
}

/** Same rule as `customer_set_job_contact` on the server. */
export function isValidPhone(value: string): boolean {
  return /^[+0-9][0-9 ()-]{6,19}$/.test(value.trim());
}

export type ContactForm = { phone: string; address: string };
export type ContactErrors = Partial<Record<keyof ContactForm, string>>;

export function validateContact(input: ContactForm): { ok: true; phone: string; address: string } | { ok: false; errors: ContactErrors } {
  const errors: ContactErrors = {};
  const phone = input.phone.trim();
  const address = input.address.trim();
  if (!isValidPhone(phone)) errors.phone = 'Enter a valid phone number.';
  if (address.length < 5) errors.address = 'Enter your full address.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, phone, address };
}

export type PaymentStep =
  | 'none' // not at a payment stage for this viewer
  | 'customer_pay' // work done: customer marks paid
  | 'customer_wait' // waiting for the worker to confirm
  | 'worker_wait' // work done: waiting for the customer to pay
  | 'worker_confirm' // customer says paid: worker confirms amount
  | 'disputed'
  | 'closed';

export function paymentStep(status: string, isCustomer: boolean, isWorker: boolean): PaymentStep {
  if (!isCustomer && !isWorker) return 'none';
  switch (status) {
    case 'completed':
      return isCustomer ? 'customer_pay' : 'worker_wait';
    case 'payment_pending':
      return isCustomer ? 'customer_wait' : 'worker_confirm';
    case 'disputed':
      return 'disputed';
    case 'closed':
      return 'closed';
    default:
      return 'none';
  }
}

export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Helpline is stored as free text; only offer a Call button if it looks dialable. */
export function dialableHelpline(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? digits : null;
}

let helplineCache: { value: string; at: number } | null = null;

export async function fetchHelpline(): Promise<string> {
  if (helplineCache && Date.now() - helplineCache.at < 60_000) return helplineCache.value;
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'helpline_number').maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    const value = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Coming soon';
    helplineCache = { value, at: Date.now() };
    return value;
  } catch {
    return 'Coming soon';
  }
}

export type JobContacts = {
  worker_phone: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  contact_shared: boolean;
};
