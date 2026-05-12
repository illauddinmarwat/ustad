export type JobRealtimeState = {
  is_en_route: boolean;
  eta_bucket: '15m' | '30m' | '45m' | '60m_plus' | null;
  timer_started_at: string | null;
  timer_accum_seconds: number;
  started_work_at: string | null;
};

export function etaBucketLabel(bucket: JobRealtimeState['eta_bucket']): string {
  switch (bucket) {
    case '15m':
      return 'ETA about 15 min';
    case '30m':
      return 'ETA about 30 min';
    case '45m':
      return 'ETA about 45 min';
    case '60m_plus':
      return 'ETA about 60+ min';
    default:
      return 'ETA unavailable';
  }
}

export function computeTimerSeconds(state: JobRealtimeState | null, nowMs = Date.now()): number {
  if (!state) return 0;
  const base = Math.max(0, state.timer_accum_seconds || 0);
  if (!state.timer_started_at) return base;
  const startedMs = Date.parse(state.timer_started_at);
  if (Number.isNaN(startedMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
