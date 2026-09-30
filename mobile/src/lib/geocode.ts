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
