import { computeTimerSeconds, etaBucketLabel, formatDuration, type JobRealtimeState } from './realtime';

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
});
