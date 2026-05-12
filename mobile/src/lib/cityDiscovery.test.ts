import { buildDiscoverySubtitle, FALLBACK_CITY_CODE, resolveDiscoveryCityCode, shouldUseCityAwareDiscovery } from './cityDiscovery';

const OFF_FLAGS = {
  multiCityEnabled: false,
  cityCampaignsEnabled: false,
  cityCommunityEnabled: false,
};

const ON_FLAGS = {
  ...OFF_FLAGS,
  multiCityEnabled: true,
};

describe('phase5 city discovery helpers', () => {
  it('uses city-aware discovery only when flag is enabled', () => {
    expect(shouldUseCityAwareDiscovery(OFF_FLAGS)).toBe(false);
    expect(shouldUseCityAwareDiscovery(ON_FLAGS)).toBe(true);
  });

  it('falls back to karachi when multi-city is disabled', () => {
    expect(resolveDiscoveryCityCode(OFF_FLAGS, 'lahore', 'islamabad')).toBe(FALLBACK_CITY_CODE);
  });

  it('prefers requested city when multi-city is enabled', () => {
    expect(resolveDiscoveryCityCode(ON_FLAGS, ' Lahore ', 'islamabad')).toBe('lahore');
  });

  it('falls back to server city then karachi when needed', () => {
    expect(resolveDiscoveryCityCode(ON_FLAGS, null, ' Islamabad ')).toBe('islamabad');
    expect(resolveDiscoveryCityCode(ON_FLAGS, null, null)).toBe(FALLBACK_CITY_CODE);
  });

  it('builds subtitle with ranking and city context', () => {
    expect(buildDiscoverySubtitle(true, true, 'lahore', true)).toContain('Lahore'.toUpperCase());
    expect(buildDiscoverySubtitle(false, false, 'karachi', false)).toContain('City fallback: Karachi');
  });
});
