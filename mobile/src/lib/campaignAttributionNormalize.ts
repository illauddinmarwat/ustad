import type { CampaignTouchInput } from './campaignAttribution';

const clean = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return value.length > 0 ? value : null;
};

export function normalizeCampaignTouch(input: CampaignTouchInput): CampaignTouchInput {
  return {
    cityCode: clean(input.cityCode) ?? 'karachi',
    eventName: (input.eventName?.trim() || 'app_open').slice(0, 64),
    utmSource: clean(input.utmSource),
    utmMedium: clean(input.utmMedium),
    utmCampaign: clean(input.utmCampaign),
    referralCode: clean(input.referralCode),
    props: input.props ?? {},
  };
}
