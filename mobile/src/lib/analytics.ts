import { supabase } from './supabase';

export async function trackEvent(
  eventName: string,
  userId: string | null | undefined,
  eventProps: Record<string, unknown> = {}
) {
  try {
    await supabase.from('app_events').insert({
      user_id: userId ?? null,
      event_name: eventName,
      event_props: eventProps,
    });
  } catch {
    // Best-effort analytics: never block user flows.
  }
}
