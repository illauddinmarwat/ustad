import { normalizeCityCode, normalizeRolloutStage } from './phase5AdminRollout';

describe('phase5 admin rollout helpers', () => {
  it('normalizes city code to lowercase trimmed value', () => {
    expect(normalizeCityCode(' Lahore ')).toBe('lahore');
  });

  it('normalizes rollout stage with deterministic fallback', () => {
    expect(normalizeRolloutStage('pilot')).toBe('pilot');
    expect(normalizeRolloutStage(' LIVE ')).toBe('live');
    expect(normalizeRolloutStage('unknown')).toBe('off');
  });
});
