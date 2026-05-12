import { normalizeCampaignTouch } from './campaignAttributionNormalize';

describe('campaign attribution helpers', () => {
  it('normalizes fields and defaults city/event', () => {
    const out = normalizeCampaignTouch({
      cityCode: ' Lahore ',
      utmSource: ' Meta ',
      utmMedium: ' Cpc ',
      utmCampaign: ' Eid-Lhr ',
      referralCode: ' REF123 ',
      props: { a: 1 },
    });
    expect(out.cityCode).toBe('lahore');
    expect(out.eventName).toBe('app_open');
    expect(out.utmSource).toBe('meta');
    expect(out.utmMedium).toBe('cpc');
    expect(out.utmCampaign).toBe('eid-lhr');
    expect(out.referralCode).toBe('ref123');
  });

  it('falls back deterministically when fields are missing', () => {
    const out = normalizeCampaignTouch({});
    expect(out.cityCode).toBe('karachi');
    expect(out.eventName).toBe('app_open');
    expect(out.utmCampaign).toBeNull();
  });
});
