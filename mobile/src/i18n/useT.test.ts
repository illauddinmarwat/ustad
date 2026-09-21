import { useT } from './useT';

describe('useT', () => {
  it('returns the same object and functions on every call, so hook dependencies stay stable', () => {
    const a = useT();
    const b = useT();
    expect(a).toBe(b);
    expect(a.t).toBe(b.t);
  });

  it('looks up both languages', () => {
    const { t, en, ur } = useT();
    expect(t('nearby.filterAll')).toEqual({ en: 'All', ur: 'سب' });
    expect(en('nearby.filterAll')).toBe('All');
    expect(ur('nearby.filterAll')).toBe('سب');
  });
});
