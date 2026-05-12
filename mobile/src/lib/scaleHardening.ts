import { supabase } from './supabase';
import { normalizeRateLimitObservation, type RateLimitObservationInput } from './scaleHardeningNormalize';

export async function trackRateLimitObservation(input: RateLimitObservationInput) {
  const normalized = normalizeRateLimitObservation(input);
  try {
    await supabase.rpc('log_rate_limit_event', {
      p_endpoint_key: normalized.endpointKey,
      p_city_code: normalized.cityCode,
      p_decision: normalized.decision,
      p_retry_after_seconds: normalized.retryAfterSeconds,
      p_window_seconds: normalized.windowSeconds,
      p_event_props: normalized.props,
    });
  } catch {
    // Scale telemetry is best-effort only.
  }
}
