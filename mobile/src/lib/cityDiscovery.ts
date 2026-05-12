import type { Phase5Flags } from './phase5Flags';

export const FALLBACK_CITY_CODE = 'karachi';

const normalizeCityCode = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
};

export function shouldUseCityAwareDiscovery(flags: Phase5Flags): boolean {
  return flags.multiCityEnabled;
}

export function resolveDiscoveryCityCode(
  flags: Phase5Flags,
  requestedCityCode?: string | null,
  effectiveCityCodeFromServer?: string | null,
): string {
  if (!flags.multiCityEnabled) return FALLBACK_CITY_CODE;
  return (
    normalizeCityCode(requestedCityCode) ??
    normalizeCityCode(effectiveCityCodeFromServer) ??
    FALLBACK_CITY_CODE
  );
}

export function buildDiscoverySubtitle(
  rankingEnabled: boolean,
  boostsEnabled: boolean,
  cityCode: string,
  cityAware: boolean,
): string {
  const rankPart = rankingEnabled
    ? boostsEnabled
      ? 'Ranked by trust, recency, and featured boosts'
      : 'Ranked by trust and recency'
    : 'Sorted by most recent';
  const cityPart = cityAware ? `City: ${cityCode.toUpperCase()}` : 'City fallback: Karachi';
  return `${rankPart} · ${cityPart}`;
}
