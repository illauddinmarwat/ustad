export type RolloutStage = 'off' | 'pilot' | 'live';

export const ROLLOUT_STAGE_OPTIONS: RolloutStage[] = ['off', 'pilot', 'live'];

export function normalizeCityCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeRolloutStage(raw: string): RolloutStage {
  const value = raw.trim().toLowerCase();
  if (value === 'pilot' || value === 'live') return value;
  return 'off';
}
