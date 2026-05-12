import { boostChipLabel, isFeaturedListing } from './boosts';

describe('phase4 boosts helpers', () => {
  it('marks listing as featured only when boosted with positive weight', () => {
    expect(isFeaturedListing({ is_boosted: true, boost_weight: 10 })).toBe(true);
    expect(isFeaturedListing({ is_boosted: true, boost_weight: 0 })).toBe(false);
    expect(isFeaturedListing({ is_boosted: false, boost_weight: 10 })).toBe(false);
  });

  it('returns Featured chip label for boosted listings', () => {
    expect(boostChipLabel({ is_boosted: true, boost_weight: 7 })).toBe('Featured');
    expect(boostChipLabel({ is_boosted: false, boost_weight: 7 })).toBeNull();
  });
});
