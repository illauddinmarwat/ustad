export type ReverseResult = {
  displayName: string;
  city: string | null;
  area: string | null;
};

/** Free reverse geocoding via OpenStreetMap Nominatim (no API key). Returns null when nothing was found. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'UstadApp/1.0' } }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    if (!json.display_name) return null;
    const a = json.address ?? {};
    return {
      displayName: json.display_name,
      city: a.city ?? a.town ?? a.municipality ?? a.state_district ?? null,
      area: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.residential ?? null,
    };
  } catch {
    return null;
  }
}

/** Where a place name is, via OpenStreetMap Nominatim (no API key), limited to Pakistan. Null when not found. */
export async function forwardGeocode(place: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = place.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pk&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'UstadApp/1.0' } }
    );
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = list[0];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, displayName: hit.display_name ?? q };
  } catch {
    return null;
  }
}
