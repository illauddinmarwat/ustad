/**
 * `useT` — convenience accessors for translation lookups.
 *
 * Returns:
 *  - `t(id)`  — both EN and UR (used by `BiText` and anywhere we need both)
 *  - `en(id)` — English only (used in tab labels, navigation titles where only
 *               one line is allowed by the platform)
 *  - `ur(id)` — Urdu only
 */
import { strings, type StringId } from './strings';

export function useT() {
  return {
    t: (id: StringId) => strings[id],
    en: (id: StringId) => strings[id].en,
    ur: (id: StringId) => strings[id].ur,
  } as const;
}

/** Non-hook variant for places we can't call a hook (e.g. navigator options). */
export const t = (id: StringId) => strings[id];
export const en = (id: StringId) => strings[id].en;
export const ur = (id: StringId) => strings[id].ur;
