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
