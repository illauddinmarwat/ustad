import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { useLiveDatabase } from '../config/env';
import { supabase } from './supabase';

const DEDUPE_MS = 60_000;
const recent = new Map<string, number>();

type Details = { componentStack?: string | null; fatal?: boolean };

/** True if this message was already sent in the last minute (a render loop must not hammer the server). */
export function seenRecently(message: string, now = Date.now()): boolean {
  const last = recent.get(message);
  if (last !== undefined && now - last < DEDUPE_MS) return true;
  recent.set(message, now);
  if (recent.size > 50) {
    for (const [k, t] of recent) if (now - t >= DEDUPE_MS) recent.delete(k);
  }
  return false;
}

/** Sends an error to the admin App errors page. Never throws: reporting must not cause a second crash. */
export async function reportError(error: unknown, details: Details = {}): Promise<void> {
  try {
    if (!useLiveDatabase) return;
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const message = err.message || err.name || 'Unknown error';
    if (seenRecently(message)) return;
    await supabase.rpc('log_client_error', {
      p_message: message,
      p_stack: err.stack ?? null,
      p_component_stack: details.componentStack ?? null,
      p_fatal: details.fatal ?? false,
      p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? null,
    });
  } catch {
    // Offline or backend down: drop it.
  }
}

type GlobalErrorUtils = {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

let installed = false;

/** Reports uncaught JS errors (outside React rendering) and then lets React Native handle them as usual. */
export function installCrashReporting(): void {
  if (installed) return;
  installed = true;
  const utils = (globalThis as unknown as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, isFatal) => {
    void reportError(error, { fatal: Boolean(isFatal) });
    previous?.(error, isFatal);
  });
}
