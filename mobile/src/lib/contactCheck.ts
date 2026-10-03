/**
 * Does this text contain a phone number, link or handle? Contact details are shared only after a quote is
 * accepted, so posts, listings and messages must not carry them. Same rule as the server's `_contains_contact`
 * (7+ digits, or a link/handle), plus Urdu and Arabic-Indic digits, which the server check does not yet cover.
 */

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Turns Arabic-Indic (٠-٩) and Persian/Urdu (۰-۹) digits into 0-9. */
export function normalizeDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function looksLikeContact(text: string): boolean {
  const normal = normalizeDigits(text);
  const digits = normal.replace(/[\s().+-]/g, '');
  if (/[0-9]{7,}/.test(digits)) return true;
  return /(https?:\/\/|www\.|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|wa\.me|whats ?app)/i.test(normal);
}
