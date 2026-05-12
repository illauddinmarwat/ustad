jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));
jest.mock('../supabase', () => ({
  supabase: { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) },
}));

import { extractDocument } from './index';
import type { OcrInput, OcrProvider, OcrProviderName } from './types';
import { OcrUnavailable } from './types';

const cnicInput: OcrInput = { doc: 'cnic', base64: 'fake' };

const makeProvider = (name: OcrProviderName, impl: OcrProvider['recognize']): OcrProvider => ({
  name,
  recognize: impl,
});

describe('extractDocument orchestration (Phase 3)', () => {
  it('returns disabled when flag is off', async () => {
    const out = await extractDocument(cnicInput, {}, {
      isOcrEnabled: async () => false,
      resolveProvider: () => makeProvider('google', async () => ({ text: '', confidence: 1 })),
    });
    expect(out.status).toBe('disabled');
  });

  it('falls back to manual when every provider throws OcrUnavailable', async () => {
    const out = await extractDocument(cnicInput, {}, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          throw new OcrUnavailable();
        }),
    });
    expect(out.status).toBe('manual_fallback');
    if (out.status === 'manual_fallback') {
      expect(out.reason).toBe('provider_unavailable');
    }
  });

  it('translates an unknown error into parse_failed when no provider succeeds', async () => {
    const out = await extractDocument(cnicInput, {}, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          throw new Error('boom');
        }),
    });
    expect(out.status).toBe('manual_fallback');
    if (out.status === 'manual_fallback') {
      expect(out.reason).toBe('parse_failed');
    }
  });

  it('falls back to manual but keeps best partial fields when both providers are low confidence', async () => {
    const calls: OcrProviderName[] = [];
    const out = await extractDocument(cnicInput, { minConfidence: 0.95 }, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          calls.push(n);
          if (n === 'google') return { text: '35202-1234567-8', confidence: 0.5 };
          return { text: '', confidence: 0.1 };
        }),
    });
    expect(calls).toEqual(['google', 'groq']);
    expect(out.status).toBe('manual_fallback');
    if (out.status === 'manual_fallback') {
      expect(out.reason).toBe('low_confidence');
      expect(out.fields.cnic_number).toBe('35202-1234567-8');
    }
  });

  it('uses the second provider when the first throws', async () => {
    const out = await extractDocument(cnicInput, {}, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          if (n === 'google') throw new OcrUnavailable();
          return { text: '35202-1234567-8 — Ali Khan', confidence: 0.9 };
        }),
    });
    expect(out.status).toBe('parsed');
    if (out.status === 'parsed') {
      expect(out.provider).toBe('groq');
      expect(out.fields.cnic_number).toBe('35202-1234567-8');
    }
  });

  it('returns parsed result on a high-confidence run from the first provider', async () => {
    const calls: OcrProviderName[] = [];
    const out = await extractDocument(cnicInput, {}, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          calls.push(n);
          return { text: '35202-1234567-8 — John Doe', confidence: 0.95 };
        }),
    });
    expect(calls).toEqual(['google']);
    expect(out.status).toBe('parsed');
    if (out.status === 'parsed') {
      expect(out.fields.cnic_number).toBe('35202-1234567-8');
      expect(out.provider).toBe('google');
    }
  });

  it('preferredProvider option leads the chain', async () => {
    const calls: OcrProviderName[] = [];
    await extractDocument(cnicInput, { preferredProvider: 'groq' }, {
      isOcrEnabled: async () => true,
      resolveProvider: (n) =>
        makeProvider(n, async () => {
          calls.push(n);
          throw new OcrUnavailable();
        }),
    });
    expect(calls[0]).toBe('groq');
  });
});
