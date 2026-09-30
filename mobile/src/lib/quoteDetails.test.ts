import { availabilityDate, dateFromNow, formatAvailability, sortQuotes } from './quoteDetails';

jest.mock('./supabase', () => ({ supabase: {} }));

const now = new Date(2026, 9, 30, 15, 0); // 30 Oct 2026, local time

describe('dates', () => {
  it('builds local calendar dates', () => {
    expect(dateFromNow(0, now)).toBe('2026-10-30');
    expect(dateFromNow(1, now)).toBe('2026-10-31');
    expect(dateFromNow(3, now)).toBe('2026-11-02');
  });

  it('maps availability choices to dates', () => {
    expect(availabilityDate('today', now)).toBe('2026-10-30');
    expect(availabilityDate('tomorrow', now)).toBe('2026-10-31');
    expect(availabilityDate('week', now)).toBe('2026-11-06');
  });

  it('describes a start date', () => {
    expect(formatAvailability('2026-10-30', now)).toBe('Today');
    expect(formatAvailability('2026-10-29', now)).toBe('Today');
    expect(formatAvailability('2026-10-31', now)).toBe('Tomorrow');
    expect(formatAvailability('2026-11-06', now)).toBe('6 Nov');
    expect(formatAvailability(null, now)).toBeNull();
  });
});

describe('sortQuotes', () => {
  const q = (id: string, amount: number, rating: number | null, from: string | null) => ({
    id,
    amount_pkr: amount,
    avg_rating: rating,
    available_from: from,
    created_at: '2026-10-30T00:00:00Z',
  });
  const list = [q('a', 2000, 4.8, '2026-11-02'), q('b', 1500, null, null), q('c', 1800, 4.1, '2026-10-30')];

  it('sorts by price', () => {
    expect(sortQuotes(list, 'price').map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('sorts by rating with unrated last', () => {
    expect(sortQuotes(list, 'rating').map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('sorts by start date with undated last', () => {
    expect(sortQuotes(list, 'soonest').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('does not change the input and keeps ties in server order', () => {
    const tied = [q('x', 100, 4, null), q('y', 100, 4, null)];
    expect(sortQuotes(tied, 'price').map((x) => x.id)).toEqual(['x', 'y']);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
