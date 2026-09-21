import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const url =
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  '';
const anonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

import { useFixtureMode } from '../config/env';
import { FIXTURE_RPC } from './fixtures';

export { isSupabaseConfigured, useFixtureMode } from '../config/env';

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Fixture mode: answer the RPCs we have sample data for without touching the network.
if (useFixtureMode) {
  const realRpc = supabase.rpc.bind(supabase);
  (supabase as unknown as { rpc: unknown }).rpc = (fn: string, ...args: unknown[]) =>
    fn in FIXTURE_RPC
      ? Promise.resolve({ data: FIXTURE_RPC[fn], error: null })
      : (realRpc as (f: string, ...a: unknown[]) => unknown)(fn, ...args);
}
