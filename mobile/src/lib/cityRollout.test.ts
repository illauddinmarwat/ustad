import { getEffectiveCities, DEFAULT_CITY } from './cityRollout';

const PHASE5_DEFAULT_FLAGS = {
  multiCityEnabled: false,
  cityCampaignsEnabled: false,
  cityCommunityEnabled: false,
};

describe('phase5 city rollout fallback', () => {
  it('returns default city when multi-city flag is disabled', () => {
    const result = getEffectiveCities(PHASE5_DEFAULT_FLAGS, [
      { code: 'lahore', name: 'Lahore', isActive: true },
    ]);
    expect(result).toEqual([DEFAULT_CITY]);
  });

  it('returns default city when multi-city is enabled but no cities are available', () => {
    const flags = { ...PHASE5_DEFAULT_FLAGS, multiCityEnabled: true };
    expect(getEffectiveCities(flags, null)).toEqual([DEFAULT_CITY]);
    expect(getEffectiveCities(flags, [])).toEqual([DEFAULT_CITY]);
  });

  it('returns active deduplicated city list when multi-city is enabled', () => {
    const flags = { ...PHASE5_DEFAULT_FLAGS, multiCityEnabled: true };
    const result = getEffectiveCities(flags, [
      { code: 'LAHORE', name: 'Lahore', isActive: true },
      { code: 'lahore', name: 'Lahore Duplicate', isActive: true },
      { code: 'islamabad', name: 'Islamabad', isActive: true },
      { code: 'rawalpindi', name: 'Rawalpindi', isActive: false },
    ]);
    expect(result).toEqual([
      { code: 'lahore', name: 'Lahore', isActive: true },
      { code: 'islamabad', name: 'Islamabad', isActive: true },
    ]);
  });
});
