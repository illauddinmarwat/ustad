import {
  contactVisible,
  dialableHelpline,
  isValidPhone,
  parseAmount,
  paymentStep,
  validateContact,
} from './jobPayments';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('contactVisible', () => {
  it('hides contact until a worker has accepted', () => {
    for (const s of ['open', 'quoted', 'pending_customer_confirm', 'cancelled']) {
      expect(contactVisible(s)).toBe(false);
    }
    for (const s of ['assigned', 'completed', 'payment_pending', 'disputed', 'closed']) {
      expect(contactVisible(s)).toBe(true);
    }
  });
});

describe('phone and contact validation', () => {
  it('accepts common Pakistani formats', () => {
    for (const p of ['0300-1234567', '+92 300 1234567', '03001234567', '042 1234567']) {
      expect(isValidPhone(p)).toBe(true);
    }
  });

  it('rejects junk', () => {
    for (const p of ['', 'abc', '123', 'call me', '0300-12345678901234567890', '(042) 1234567']) {
      expect(isValidPhone(p)).toBe(false);
    }
  });

  it('requires both phone and address', () => {
    const res = validateContact({ phone: 'x', address: 'no' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(['address', 'phone']);
    expect(validateContact({ phone: '0300-1234567', address: 'House 4, Street 2, DHA' })).toEqual({
      ok: true,
      phone: '0300-1234567',
      address: 'House 4, Street 2, DHA',
    });
  });
});

describe('paymentStep', () => {
  it('walks the cash flow for each side', () => {
    expect(paymentStep('assigned', true, false)).toBe('none');
    expect(paymentStep('completed', true, false)).toBe('customer_pay');
    expect(paymentStep('completed', false, true)).toBe('worker_wait');
    expect(paymentStep('payment_pending', true, false)).toBe('customer_wait');
    expect(paymentStep('payment_pending', false, true)).toBe('worker_confirm');
    expect(paymentStep('disputed', true, false)).toBe('disputed');
    expect(paymentStep('closed', false, true)).toBe('closed');
  });

  it('shows nothing to non-participants', () => {
    expect(paymentStep('payment_pending', false, false)).toBe('none');
  });
});

describe('parseAmount', () => {
  it('parses positive amounts only', () => {
    expect(parseAmount('2,500')).toBe(2500);
    expect(parseAmount(' 800 ')).toBe(800);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-4')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('dialableHelpline', () => {
  it('only offers a call for real numbers', () => {
    expect(dialableHelpline('Coming soon')).toBeNull();
    expect(dialableHelpline(null)).toBeNull();
    expect(dialableHelpline('0800-12345')).toBe('080012345');
    expect(dialableHelpline('+92 21 111 222 333')).toBe('+9221111222333');
  });
});
