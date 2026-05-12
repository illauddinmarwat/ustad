import { supabase } from './supabase';

/**
 * Feature flags fetched from `public.app_settings`.
 *
 * Phase 3 risk gates:
 *   - phase3_ranking_enabled: turns on ranking RPC + explainability UI.
 *   - phase3_ocr_enabled: turns on OCR scaffold calls.
 *
 * Flags default to `false` to preserve Phase 1/2 behavior even if Supabase
 * is unreachable. The fetch is best-effort and never throws.
 */
export type Phase3Flags = {
  rankingEnabled: boolean;
  ocrEnabled: boolean;
};

export const PHASE3_DEFAULT_FLAGS: Phase3Flags = {
  rankingEnabled: false,
  ocrEnabled: false,
};

const TTL_MS = 60_000;

let cache: { value: Phase3Flags; fetchedAt: number } | null = null;

const parseBool = (raw: unknown): boolean => {
  if (raw === true) return true;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  return false;
};

export async function fetchPhase3Flags(): Promise<Phase3Flags> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['phase3_ranking_enabled', 'phase3_ocr_enabled']);
    if (error || !data) {
      cache = { value: PHASE3_DEFAULT_FLAGS, fetchedAt: Date.now() };
      return PHASE3_DEFAULT_FLAGS;
    }
    const map = new Map<string, unknown>();
    for (const row of data as Array<{ key: string; value: unknown }>) {
      map.set(row.key, row.value);
    }
    const value: Phase3Flags = {
      rankingEnabled: parseBool(map.get('phase3_ranking_enabled')),
      ocrEnabled: parseBool(map.get('phase3_ocr_enabled')),
    };
    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    cache = { value: PHASE3_DEFAULT_FLAGS, fetchedAt: Date.now() };
    return PHASE3_DEFAULT_FLAGS;
  }
}

export function resetFeatureFlagCache() {
  cache = null;
}
