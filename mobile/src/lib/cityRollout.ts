import type { Phase5Flags } from './phase5Flags';

export type CityConfig = {
  code: string;
  name: string;
  isActive: boolean;
};

export const DEFAULT_CITY: CityConfig = {
  code: 'karachi',
  name: 'Karachi',
  isActive: true,
};

const normalizeCity = (city: CityConfig): CityConfig => ({
  code: city.code.trim().toLowerCase(),
  name: city.name.trim(),
  isActive: city.isActive,
});

export function getEffectiveCities(
  flags: Phase5Flags,
  cities: CityConfig[] | null | undefined,
): CityConfig[] {
  if (!flags.multiCityEnabled) return [DEFAULT_CITY];
  if (!cities || cities.length === 0) return [DEFAULT_CITY];

  const normalized = cities
    .map(normalizeCity)
    .filter((city) => city.isActive && city.code.length > 0 && city.name.length > 0);

  if (normalized.length === 0) return [DEFAULT_CITY];

  const deduped = new Map<string, CityConfig>();
  for (const city of normalized) {
    if (!deduped.has(city.code)) deduped.set(city.code, city);
  }
  return Array.from(deduped.values());
}
