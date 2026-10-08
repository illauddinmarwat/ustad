import * as Location from 'expo-location';

let inFlight: Promise<boolean> | null = null;

/**
 * Asks for foreground location once at a time. The job page (sharing) and the tracking page (viewing) can both ask
 * in the same moment; two overlapping system prompts make Android drop one of them, so they share one request.
 */
export function ensureForegroundLocation(): Promise<boolean> {
  if (!inFlight) {
    inFlight = Location.requestForegroundPermissionsAsync()
      .then((p) => p.granted)
      .catch(() => false)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
