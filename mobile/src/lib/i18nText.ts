/**
 * Posts and listings keep the author's original text and an English and an Urdu version, which the author
 * approved. Readers see their own language, with a way back to the original.
 */

export type Lang = 'en' | 'ur';

export type I18n = { source?: Lang; en?: string; ur?: string; ai?: boolean } | null | undefined;

const URDU = /[؀-ۿ]/;

/** Urdu script means Urdu. Roman Urdu looks like English; the author can still correct it. */
export function detectLang(text: string): Lang {
  return URDU.test(text) ? 'ur' : 'en';
}

export function buildI18n(source: Lang, en: string, ur: string, ai: boolean): { source: Lang; en: string; ur: string; ai: boolean } {
  return { source, en: en.trim(), ur: ur.trim(), ai };
}

export type Localized = { text: string; translated: boolean; original: string };

/** The text to show a reader of `lang`: their language when there is a version of it, else the original. */
export function localized(original: string | null | undefined, i18n: I18n, lang: Lang): Localized {
  const orig = (original ?? '').trim();
  const version = i18n?.[lang]?.trim();
  if (!version) return { text: orig, translated: false, original: orig };
  const translated = i18n?.source ? i18n.source !== lang : version !== orig;
  return { text: version, translated: translated && version !== orig, original: orig };
}

// Everyday Roman Urdu words. Two or more of them in Latin letters means the person is writing Urdu.
const ROMAN_URDU = new Set([
  'hun', 'hoon', 'hai', 'hain', 'ho', 'ka', 'ke', 'ki', 'ko', 'se', 'say', 'mein', 'main', 'me', 'kaam', 'kam', 'karta', 'krta',
  'karte', 'krte', 'karna', 'krna', 'nahi', 'nahin', 'aur', 'ek', 'wala', 'wali', 'lagata', 'lagana', 'leta', 'lete', 'ghar',
  'dukan', 'din', 'saal', 'rate', 'pani', 'nal', 'bijli', 'mera', 'meri', 'apna', 'apni', 'hum', 'tak', 'bhi', 'b', 'sab', 'kuch',
  'kitna', 'kab', 'kal', 'aaj', 'abhi', 'theek', 'thik', 'kharab', 'chahiye', 'chahye', 'raha', 'rahi', 'tapak',
]);

/** Roman Urdu: Urdu written in Latin letters, which people type a lot. */
export function isRomanUrdu(text: string): boolean {
  if (URDU.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = new Set(words.filter((w) => ROMAN_URDU.has(w)));
  return hits.size >= 2;
}

/** The language to talk to a person in: what they wrote in (Urdu script or Roman Urdu means Urdu), else their setting. */
export function chooseLang(text: string, setting: Lang): Lang {
  return URDU.test(text) || isRomanUrdu(text) ? 'ur' : setting;
}
