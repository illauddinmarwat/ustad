import Constants from 'expo-constants';

/**
 * Fixture mode: no Supabase process required — fake session + sample data for UI work.
 * Set EXPO_PUBLIC_USE_FIXTURES=1 in .env
 */
export const useFixtureMode = Boolean(
  process.env.EXPO_PUBLIC_USE_FIXTURES === '1' ||
    Constants.expoConfig?.extra?.useFixtures === '1'
);

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Real Supabase (local or hosted) env present */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
);

/** Safe to call PostgREST / RPC */
export const useLiveDatabase = !useFixtureMode && isSupabaseConfigured;
