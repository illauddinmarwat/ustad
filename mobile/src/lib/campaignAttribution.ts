import { supabase } from './supabase';
import { normalizeCampaignTouch } from './campaignAttributionNormalize';

export type CampaignTouchInput = {
  cityCode?: string | null;
  eventName?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referralCode?: string | null;
  props?: Record<string, unknown>;
};

export async function trackCampaignTouch(input: CampaignTouchInput) {
  const normalized = normalizeCampaignTouch(input);
  try {
    await supabase.rpc('track_campaign_touch', {
      p_session_key: null,
      p_city_code: normalized.cityCode,
      p_event_name: normalized.eventName,
      p_utm_source: normalized.utmSource,
      p_utm_medium: normalized.utmMedium,
      p_utm_campaign: normalized.utmCampaign,
      p_referral_code: normalized.referralCode,
      p_touch_props: normalized.props ?? {},
    });
  } catch {
    // Attribution is best-effort; never block product flows.
  }
}
