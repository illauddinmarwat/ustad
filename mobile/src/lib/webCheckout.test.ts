import { buildCheckoutUrl } from './webCheckout';

describe('phase4 web checkout helpers', () => {
  it('builds canonical checkout URL from path', () => {
    expect(buildCheckoutUrl('/web/checkout/abc')).toBe('https://ustad.app/web/checkout/abc');
    expect(buildCheckoutUrl('web/checkout/abc', 'https://example.com/')).toBe('https://example.com/web/checkout/abc');
  });
});
