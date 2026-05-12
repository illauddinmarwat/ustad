export type RateLimitDecision = 'allow' | 'block' | 'fallback_allow';

export type RateLimitObservationInput = {
  endpointKey: string;
  cityCode?: string | null;
  decision?: string | null;
  retryAfterSeconds?: number | null;
  windowSeconds?: number | null;
  props?: Record<string, unknown>;
};

const clean = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return value.length > 0 ? value : null;
};

export function normalizeRateLimitDecision(raw: string | null | undefined): RateLimitDecision {
  const value = clean(raw);
  if (value === 'allow' || value === 'block') return value;
  return 'fallback_allow';
}

export function normalizeRateLimitObservation(
  input: RateLimitObservationInput
): Required<RateLimitObservationInput> {
  return {
    endpointKey: input.endpointKey.trim(),
    cityCode: clean(input.cityCode) ?? 'karachi',
    decision: normalizeRateLimitDecision(input.decision),
    retryAfterSeconds: Math.max(0, Math.floor(Number(input.retryAfterSeconds ?? 0))),
    windowSeconds: Math.max(0, Math.floor(Number(input.windowSeconds ?? 0))),
    props: input.props ?? {},
  };
}
