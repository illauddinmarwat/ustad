/**
 * Lightweight i18n shim around our `strings.ts` catalog.
 *
 * Day-1 behavior: every user-facing label is rendered via `BiText` which
 * always shows EN line 1 + UR line 2. The hook below is the single place
 * we read translations from, so a future "Urdu only" toggle can be added
 * without touching screens.
 */
import { strings, type StringId, type Strings } from './strings';

export type Lang = 'en' | 'ur';

export function getString(id: StringId): Strings {
  return strings[id];
}

export function tr(id: StringId, lang: Lang): string {
  const entry = strings[id];
  return entry ? entry[lang] : (id as string);
}

export { strings };
export type { StringId, Strings };
