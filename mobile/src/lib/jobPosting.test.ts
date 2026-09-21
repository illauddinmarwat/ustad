import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addGuestJob,
  expiresIn,
  formatBudget,
  listGuestJobs,
  looksLikeContact,
  removeGuestJob,
  validatePostJob,
} from './jobPosting';

jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
        return Promise.resolve();
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

const form = {
  category: 'plumber',
  title: 'Fix kitchen tap',
  description: 'The kitchen tap is leaking badly',
  city: 'Karachi',
  area: 'Gulshan',
  budgetMin: '',
  budgetMax: '',
  preferredTime: '',
};

beforeEach(() => {
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

describe('looksLikeContact', () => {
  it('flags phone numbers and links', () => {
    for (const t of ['call 0300 1234567', '03001234567', '+92-300-1234567', 'see www.site.pk', 'mail me a@b.com', 'my whatsapp', 'https://x.io']) {
      expect(looksLikeContact(t)).toBe(true);
    }
  });

  it('allows normal job text and short numbers', () => {
    for (const t of ['Fix tap in flat 12, floor 3', 'budget Rs 25000', 'need 2 workers for 4 hours']) {
      expect(looksLikeContact(t)).toBe(false);
    }
  });
});

describe('validatePostJob', () => {
  it('accepts a valid post and trims it', () => {
    const res = validatePostJob({ ...form, title: '  Fix kitchen tap ', budgetMin: '1,000', budgetMax: '2500' });
    expect(res).toEqual({
      ok: true,
      value: {
        category: 'plumber',
        title: 'Fix kitchen tap',
        description: 'The kitchen tap is leaking badly',
        city: 'Karachi',
        area: 'Gulshan',
        budgetMin: 1000,
        budgetMax: 2500,
        preferredTime: null,
      },
    });
  });

  it('requires category, title and description', () => {
    const res = validatePostJob({ ...form, category: '', title: 'a', description: 'short' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(['category', 'description', 'title']);
  });

  it('rejects a reversed or invalid budget', () => {
    for (const [min, max] of [['5000', '1000'], ['abc', ''], ['-1', '']]) {
      const res = validatePostJob({ ...form, budgetMin: min, budgetMax: max });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.budget).toBeDefined();
    }
  });

  it('rejects contact details in any free-text field', () => {
    for (const patch of [
      { description: 'The tap leaks, call me on 0300-1234567' },
      { title: 'Fix tap www.example.com' },
      { area: '0300 1234567' },
    ]) {
      const res = validatePostJob({ ...form, ...patch });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.errors.contact).toBeDefined();
    }
  });
});

describe('formatBudget and expiresIn', () => {
  it('formats ranges', () => {
    expect(formatBudget(null, null)).toBeNull();
    expect(formatBudget(1000, 2000)).toBe('Rs 1000 - 2000');
    expect(formatBudget(1500, 1500)).toBe('Rs 1500');
    expect(formatBudget(1000, null)).toBe('From Rs 1000');
    expect(formatBudget(null, 900)).toBe('Up to Rs 900');
  });

  it('describes time left', () => {
    const now = new Date('2026-09-21T12:00:00Z').getTime();
    expect(expiresIn('2026-09-21T12:30:00Z', now)).toBe('Expires in under an hour');
    expect(expiresIn('2026-09-21T15:00:00Z', now)).toBe('Expires in 3 hours');
    expect(expiresIn('2026-09-26T12:00:00Z', now)).toBe('Expires in 5 days');
    expect(expiresIn('2026-09-20T12:00:00Z', now)).toBeNull();
    expect(expiresIn(null, now)).toBeNull();
  });
});

describe('guest job storage', () => {
  it('remembers, de-duplicates and removes guest jobs', async () => {
    await addGuestJob({ jobId: 'j1', token: 't1', title: 'A', createdAt: 'x' });
    await addGuestJob({ jobId: 'j2', token: 't2', title: 'B', createdAt: 'y' });
    await addGuestJob({ jobId: 'j1', token: 't1', title: 'A2', createdAt: 'z' });
    expect((await listGuestJobs()).map((r) => r.title)).toEqual(['A2', 'B']);
    await removeGuestJob('t1');
    expect((await listGuestJobs()).map((r) => r.jobId)).toEqual(['j2']);
  });
});
