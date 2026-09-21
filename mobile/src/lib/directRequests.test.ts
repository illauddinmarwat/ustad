import { canAcceptAsIs, requestStatusLabel, validateRequestForm } from './directRequests';

jest.mock('./supabase', () => ({ supabase: {} }));

const base = { title: 'Fix tap', description: 'Kitchen tap is leaking badly', budget: '', preferredTime: '' };

describe('validateRequestForm', () => {
  it('accepts a valid request without budget', () => {
    expect(validateRequestForm(base)).toEqual({
      ok: true,
      title: 'Fix tap',
      description: 'Kitchen tap is leaking badly',
      budgetPkr: null,
      preferredTime: null,
    });
  });

  it('parses budget with commas and trims the preferred time', () => {
    const res = validateRequestForm({ ...base, budget: '2,500', preferredTime: '  tomorrow 5pm ' });
    expect(res).toMatchObject({ ok: true, budgetPkr: 2500, preferredTime: 'tomorrow 5pm' });
  });

  it('rejects short title and description', () => {
    const res = validateRequestForm({ ...base, title: 'a', description: 'short' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(['description', 'title']);
  });

  it('rejects a negative or non-numeric budget', () => {
    for (const budget of ['-5', 'abc']) {
      const res = validateRequestForm({ ...base, budget });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.budget).toBeDefined();
    }
  });
});

describe('requestStatusLabel', () => {
  it('describes each state', () => {
    expect(requestStatusLabel('open', true)).toBe('Waiting for the worker');
    expect(requestStatusLabel('open', false)).toBe('Open to other workers');
    expect(requestStatusLabel('quoted', true)).toBe('Quote received');
    expect(requestStatusLabel('assigned', true)).toBe('Accepted');
    expect(requestStatusLabel('cancelled', true)).toBe('Declined or cancelled');
  });
});

describe('canAcceptAsIs', () => {
  it('needs a stated budget', () => {
    expect(canAcceptAsIs(null)).toBe(false);
    expect(canAcceptAsIs(undefined)).toBe(false);
    expect(canAcceptAsIs(1500)).toBe(true);
  });
});
