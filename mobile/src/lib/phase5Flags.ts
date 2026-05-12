import { supabase } from './supabase';

export type Phase5Flags = {
  multiCityEnabled: boolean;
  cityCampaignsEnabled: boolean;
  cityCommunityEnabled: boolean;
};

export const PHASE5_DEFAULT_FLAGS: Phase5Flags = {
  multiCityEnabled: false,
  cityCampaignsEnabled: false,
  cityCommunityEnabled: false,
};

const TTL_MS = 60_000;
let cache: { value: Phase5Flags; fetchedAt: number } | null = null;

const parseBool = (raw: unknown): boolean => {
  if (raw === true) return true;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  return false;
};

export async function fetchPhase5Flags(): Promise<Phase5Flags> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', [
        'phase5_multi_city_enabled',
        'phase5_city_campaigns_enabled',
        'phase5_city_community_enabled',
      ]);

    if (error || !data) {
      cache = { value: PHASE5_DEFAULT_FLAGS, fetchedAt: Date.now() };
      return PHASE5_DEFAULT_FLAGS;
    }

    const rows = data as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const value: Phase5Flags = {
      multiCityEnabled: parseBool(map.get('phase5_multi_city_enabled')),
      cityCampaignsEnabled: parseBool(map.get('phase5_city_campaigns_enabled')),
      cityCommunityEnabled: parseBool(map.get('phase5_city_community_enabled')),
    };
    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    cache = { value: PHASE5_DEFAULT_FLAGS, fetchedAt: Date.now() };
    return PHASE5_DEFAULT_FLAGS;
  }
}

export function resetPhase5FlagCache() {
  cache = null;
}
