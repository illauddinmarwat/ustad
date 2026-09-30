jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));

import { parsePreview, parsePreviewAmount } from './quotePricing';

describe('parsePreview', () => {
  it('reads the customer price, fee and percent from the RPC row', () => {
    expect(parsePreview([{ customer_price: 115, commission: 15, commission_pct: 15 }])).toEqual({
      customerPrice: 115,
      commission: 15,
      commissionPct: 15,
    });
  });

  it('accepts numeric strings (numeric columns can arrive as text)', () => {
    expect(parsePreview({ customer_price: '383', commission: '50', commission_pct: '15' })?.customerPrice).toBe(383);
  });

  it('returns null when the markup is off (no commission) or the row is unusable', () => {
    expect(parsePreview([{ customer_price: 100, commission: 0, commission_pct: 0 }])).toBeNull();
    expect(parsePreview([])).toBeNull();
    expect(parsePreview(null)).toBeNull();
    expect(parsePreview([{ customer_price: 'x', commission: 1, commission_pct: 15 }])).toBeNull();
  });
});

describe('parsePreviewAmount', () => {
  it('accepts plain and comma-separated numbers', () => {
    expect(parsePreviewAmount('100')).toBe(100);
    expect(parsePreviewAmount(' 1,500 ')).toBe(1500);
    expect(parsePreviewAmount('0')).toBe(0);
  });

  it('rejects empty, negative and non-numeric input', () => {
    expect(parsePreviewAmount('')).toBeNull();
    expect(parsePreviewAmount('-5')).toBeNull();
    expect(parsePreviewAmount('abc')).toBeNull();
  });
});
