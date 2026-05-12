import { normalizeCommunityTips, shouldShowCommunitySurface } from './communityLite';

describe('community-lite helpers', () => {
  it('shows surface only when enabled', () => {
    expect(shouldShowCommunitySurface(true)).toBe(true);
    expect(shouldShowCommunitySurface(false)).toBe(false);
  });

  it('normalizes valid rows and drops invalid rows', () => {
    const out = normalizeCommunityTips([
      {
        id: '1',
        title: 'Stay safe',
        body: 'Verify worker reviews.',
        lang: 'bilingual',
        city_code: 'Lahore',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      },
      { id: '2', title: '', body: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].city_code).toBe('lahore');
    expect(out[0].lang).toBe('bilingual');
  });
});
