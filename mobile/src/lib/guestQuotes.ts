import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { listGuestJobs } from './jobPosting';
import { supabase } from './supabase';

const POLL_MS = 60_000;
const MAX_JOBS = 5;

/** How many quotes are waiting on each job a guest posted from this phone (by guest token). */
export async function countGuestQuotes(): Promise<{ total: number; byToken: Record<string, number> }> {
  const jobs = (await listGuestJobs()).slice(0, MAX_JOBS);
  const byToken: Record<string, number> = {};
  let total = 0;
  await Promise.all(
    jobs.map(async (j) => {
      try {
        const { data, error } = await supabase.rpc('job_quotes', { p_job_id: j.jobId, p_token: j.token });
        if (error || !Array.isArray(data)) return;
        const waiting = (data as Array<{ status?: string }>).filter((q) => (q.status ?? 'pending') === 'pending').length;
        if (waiting > 0) {
          byToken[j.token] = waiting;
          total += waiting;
        }
      } catch {
        // A job that cannot be read just shows no count.
      }
    }),
  );
  return { total, byToken };
}

/** Quotes waiting on a guest's jobs; refreshes on a timer and when the app comes back to the foreground. */
export function useGuestQuoteCount(enabled: boolean): { total: number; byToken: Record<string, number>; refresh: () => void } {
  const [state, setState] = useState<{ total: number; byToken: Record<string, number> }>({ total: 0, byToken: {} });

  const refresh = useCallback(() => {
    if (!enabled) {
      setState({ total: 0, byToken: {} });
      return;
    }
    countGuestQuotes()
      .then(setState)
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}
