import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

const STORAGE_KEY = 'workerzpk.anonJobTokens.v1';

/**
 * Anon job tokens are opaque UUIDs the client generates when posting a job
 * without an account. They are the only handle the client has to:
 *   - read its own anon job back (`get_anon_job` RPC)
 *   - claim it after sign-in (`claim_anon_job` RPC)
 *
 * Tokens are stored locally in AsyncStorage so they survive across reloads.
 */

/** RFC4122 v4 UUID — non-cryptographic but sufficient for opaque tokens. */
export function generateAnonToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readTokens(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

async function writeTokens(tokens: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Non-fatal: token list lives only in memory for this session.
  }
}

export async function listAnonTokens(): Promise<string[]> {
  return readTokens();
}

export async function addAnonToken(token: string): Promise<void> {
  if (!token) return;
  const current = await readTokens();
  if (current.includes(token)) return;
  await writeTokens([...current, token]);
}

export async function removeAnonToken(token: string): Promise<void> {
  const current = await readTokens();
  const next = current.filter((t) => t !== token);
  if (next.length !== current.length) {
    await writeTokens(next);
  }
}

export async function clearAnonTokens(): Promise<void> {
  await writeTokens([]);
}

export type AnonJobRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  location_text: string | null;
  worker_id: string | null;
  created_at: string;
  origin: string;
  posted_by_anon: boolean;
};

/** Fetch all anon jobs the device has tokens for, one RPC call per token. */
export async function fetchOwnAnonJobs(): Promise<AnonJobRow[]> {
  const tokens = await readTokens();
  if (tokens.length === 0) return [];
  const jobs: AnonJobRow[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const { data, error } = await supabase.rpc('get_anon_job', { p_token: token });
      if (error || !Array.isArray(data) || data.length === 0) return;
      jobs.push(data[0] as AnonJobRow);
    }),
  );
  return jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/**
 * Best-effort claim of every locally-stored anon job for the currently
 * authenticated user. Successfully claimed tokens are removed from storage so
 * we don't retry forever. Failures (already claimed, missing job, network)
 * are swallowed.
 */
export async function claimAllAnonJobs(): Promise<{ claimed: number; failed: number }> {
  const tokens = await readTokens();
  if (tokens.length === 0) return { claimed: 0, failed: 0 };
  let claimed = 0;
  let failed = 0;
  for (const token of tokens) {
    const { error } = await supabase.rpc('claim_anon_job', { p_token: token });
    if (error) {
      failed += 1;
    } else {
      claimed += 1;
      await removeAnonToken(token);
    }
  }
  return { claimed, failed };
}
