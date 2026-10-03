import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

/**
 * The device position, or null when it is not available: permission refused, location switched off (common on a
 * PC without GPS), or no answer in time. Callers fall back to picking a place by hand.
 */
export async function getMyLocation(timeoutMs = 12_000): Promise<Coords | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!position) return null;
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
