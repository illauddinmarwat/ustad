import {
  computeTimerSeconds,
  distanceKm,
  estimateEtaMinutes,
  etaBucketLabel,
  formatDuration,
  type JobRealtimeState,
} from './realtime';

describe('phase4 realtime helpers', () => {
  it('maps ETA buckets to user labels', () => {
    expect(etaBucketLabel('15m')).toContain('15');
    expect(etaBucketLabel('60m_plus')).toContain('60+');
    expect(etaBucketLabel(null)).toContain('unavailable');
  });

  it('formats duration in hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(65)).toBe('00:01:05');
    expect(formatDuration(3661)).toBe('01:01:01');
  });

  it('computes running timer seconds from accumulated + live span', () => {
    const state: JobRealtimeState = {
      is_en_route: true,
      eta_bucket: '30m',
      timer_started_at: '2026-05-07T10:00:00.000Z',
      timer_accum_seconds: 120,
      started_work_at: '2026-05-07T10:00:00.000Z',
    };
    const now = Date.parse('2026-05-07T10:02:05.000Z');
    expect(computeTimerSeconds(state, now)).toBe(245);
  });

  it('computes straight-line distance between two points', () => {
    // Lahore Gulberg roughly to Lahore Cantt — a few km apart.
    const km = distanceKm({ lat: 31.5204, lng: 74.3587 }, { lat: 31.5497, lng: 74.3436 });
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(10);
  });

  it('returns 0 distance for identical points', () => {
    const p = { lat: 31.5204, lng: 74.3587 };
    expect(distanceKm(p, p)).toBe(0);
  });

  it('estimates ETA minutes from distance', () => {
    expect(estimateEtaMinutes(0)).toBe(0);
    expect(estimateEtaMinutes(25, 25)).toBe(60);
    expect(estimateEtaMinutes(0.1)).toBeGreaterThanOrEqual(1);
  });
});
