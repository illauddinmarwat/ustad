import { supabase } from './supabase';

export type Phase4Flags = {
  realtimeEnabled: boolean;
  subscriptionsEnabled: boolean;
  boostsEnabled: boolean;
  qualityEnabled: boolean;
  webEnabled: boolean;
};

export const PHASE4_DEFAULT_FLAGS: Phase4Flags = {
  realtimeEnabled: false,
  subscriptionsEnabled: false,
  boostsEnabled: false,
  qualityEnabled: false,
  webEnabled: false,
};

const TTL_MS = 60_000;
let cache: { value: Phase4Flags; fetchedAt: number } | null = null;

const parseBool = (raw: unknown): boolean => {
  if (raw === true) return true;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  return false;
};

export async function fetchPhase4Flags(): Promise<Phase4Flags> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['phase4_realtime_enabled', 'phase4_subscriptions_enabled', 'phase4_boosts_enabled', 'phase4_quality_enabled', 'phase4_web_enabled']);
    if (error || !data) {
      cache = { value: PHASE4_DEFAULT_FLAGS, fetchedAt: Date.now() };
      return PHASE4_DEFAULT_FLAGS;
    }
    const rows = data as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const value: Phase4Flags = {
      realtimeEnabled: parseBool(map.get('phase4_realtime_enabled')),
      subscriptionsEnabled: parseBool(map.get('phase4_subscriptions_enabled')),
      boostsEnabled: parseBool(map.get('phase4_boosts_enabled')),
      qualityEnabled: parseBool(map.get('phase4_quality_enabled')),
      webEnabled: parseBool(map.get('phase4_web_enabled')),
    };
    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    cache = { value: PHASE4_DEFAULT_FLAGS, fetchedAt: Date.now() };
    return PHASE4_DEFAULT_FLAGS;
  }
}
