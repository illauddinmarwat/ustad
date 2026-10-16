import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isSupabaseConfigured } from '../config/env';
import Constants from 'expo-constants';
import { activeOnly } from './activeOnly';

const PROBE_MS = 20_000;
const TIMEOUT_MS = 6_000;

/**
 * True unless the backend cannot be reached. Any HTTP answer, even an error status, counts as online; only a
 * network failure or timeout counts as offline. A probe (not a NetInfo flag) is used so captive portals and
 * dead mobile data both show as offline, which is what actually stops the app working.
 */
export async function probeOnline(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    await fetchImpl(url, { method: 'GET', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  const base = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!isSupabaseConfigured || !base) return;
    const url = `${base.replace(/\/$/, '')}/auth/v1/health`;
    const check = async () => {
      const ok = await probeOnline(url);
      if (alive.current) setOnline(ok);
    };
    void check();
    const timer = setInterval(activeOnly(check), PROBE_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [base]);

  return online;
}
