import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

export type LiveEvent = { table: 'jobs' | 'messages' | 'job_realtime_states' | 'quotes'; type: string; row: Record<string, unknown> };

const FALLBACK_MS = 15_000;
const DEBOUNCE_MS = 250;

/**
 * Keeps a job page current: any change to the job, its messages, its live status or its quotes calls
 * `onChange` straight away (a websocket), with a slow poll and a refresh on returning to the app as a safety net.
 * `onEvent` also sees each change so the page can tell the person something just happened.
 */
export function useJobLive(
  jobId: string,
  enabled: boolean,
  onChange: () => void,
  onEvent?: (e: LiveEvent) => void
): void {
  const change = useRef(onChange);
  const event = useRef(onEvent);
  change.current = onChange;
  event.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => change.current(), DEBOUNCE_MS);
    };

    const channel = supabase.channel(`job-live-${jobId}`);
    const listen = (table: LiveEvent['table'], filter: string) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
        event.current?.({ table, type: payload.eventType, row: (payload.new ?? {}) as Record<string, unknown> });
        refresh();
      });
    listen('jobs', `id=eq.${jobId}`);
    listen('messages', `job_id=eq.${jobId}`);
    listen('job_realtime_states', `job_id=eq.${jobId}`);
    listen('quotes', `job_id=eq.${jobId}`);
    channel.subscribe();

    const poll = setInterval(() => change.current(), FALLBACK_MS);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') change.current();
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      app.remove();
      void supabase.removeChannel(channel);
    };
  }, [jobId, enabled]);
}
