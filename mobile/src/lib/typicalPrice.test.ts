import { fetchTypicalPrice, formatRange, parseTypicalPrice } from './typicalPrice';

const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

beforeEach(() => mockRpc.mockReset());

describe('parseTypicalPrice', () => {
  it('reads a city range', () => {
    expect(parseTypicalPrice([{ scope: 'city', sample_size: 12, low_pkr: 1000, median_pkr: 1500, high_pkr: 2000 }])).toEqual({
      scope: 'city',
      sampleSize: 12,
      low: 1000,
      median: 1500,
      high: 2000,
    });
  });

  it('treats anything else as a category range', () => {
    expect(parseTypicalPrice({ scope: 'category', sample_size: 10, low_pkr: '800', median_pkr: '900', high_pkr: '1000' })?.scope).toBe('category');
  });

  it('is null when there is no row or the numbers are unusable', () => {
    expect(parseTypicalPrice([])).toBeNull();
    expect(parseTypicalPrice(null)).toBeNull();
    expect(parseTypicalPrice([{ scope: 'city', low_pkr: null, median_pkr: 1, high_pkr: 2 }])).toBeNull();
  });
});

describe('formatRange', () => {
  it('shows a range with thousands separators', () => {
    expect(formatRange(1000, 2500)).toBe('Rs 1,000 - 2,500');
  });
  it('shows a single figure when low and high match', () => {
    expect(formatRange(1500, 1500)).toBe('Rs 1,500');
  });
});

describe('fetchTypicalPrice', () => {
  it('asks the server for the category and city', async () => {
    mockRpc.mockResolvedValue({ data: [{ scope: 'city', sample_size: 10, low_pkr: 1, median_pkr: 2, high_pkr: 3 }], error: null });
    const price = await fetchTypicalPrice('plumber', 'Karachi');
    expect(mockRpc).toHaveBeenCalledWith('typical_price', { p_category: 'plumber', p_city: 'Karachi' });
    expect(price?.median).toBe(2);
  });

  it('sends no city as null', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchTypicalPrice('plumber', undefined)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('typical_price', { p_category: 'plumber', p_city: null });
  });

  it('is null when the call fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await fetchTypicalPrice('plumber', null)).toBeNull();
    mockRpc.mockRejectedValue(new Error('offline'));
    expect(await fetchTypicalPrice('plumber', null)).toBeNull();
  });
});
