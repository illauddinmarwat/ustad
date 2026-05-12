import { normalizeRateLimitDecision, normalizeRateLimitObservation } from './scaleHardeningNormalize';

describe('scale hardening normalization', () => {
  it('normalizes decisions with deterministic fallback', () => {
    expect(normalizeRateLimitDecision('allow')).toBe('allow');
    expect(normalizeRateLimitDecision('BLOCK')).toBe('block');
    expect(normalizeRateLimitDecision('other')).toBe('fallback_allow');
  });

  it('normalizes observation fields', () => {
    const out = normalizeRateLimitObservation({
      endpointKey: ' services_discovery ',
      cityCode: ' Lahore ',
      decision: 'block',
      retryAfterSeconds: 14.8,
      windowSeconds: -5,
      props: { reason: '429' },
    });
    expect(out.endpointKey).toBe('services_discovery');
    expect(out.cityCode).toBe('lahore');
    expect(out.decision).toBe('block');
    expect(out.retryAfterSeconds).toBe(14);
    expect(out.windowSeconds).toBe(0);
  });
});
