import { fetchPhase5Flags } from './phase5Flags';
import { supabase } from './supabase';
import { normalizeCommunityTips, type CommunityTip } from './communityLite';

export async function fetchCommunityTips(cityCode?: string | null): Promise<CommunityTip[]> {
  const flags = await fetchPhase5Flags();
  if (!flags.cityCommunityEnabled) return [];
  try {
    const res = await supabase.rpc('phase5_get_community_tips', {
      p_city_code: cityCode ?? null,
      p_limit: 20,
    });
    if (res.error) return [];
    return normalizeCommunityTips(res.data);
  } catch {
    return [];
  }
}
