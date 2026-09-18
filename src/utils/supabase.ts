import { Database } from '@/types/database.generated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // EXPO_PUBLIC_* values are inlined at build time. If they are missing here,
  // the build did not receive them (e.g. no `env` block in eas.json for this
  // profile, or the value was empty). Fail with a readable message instead of
  // the opaque "supabaseUrl is required" crash from the Supabase client.
  throw new Error(
    'Supabase config missing: EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY must be set at build time. ' +
      'For EAS builds, define them in the build profile env block or via `eas env`.'
  );
}

// In-memory fallback for SSR (server has no window/localStorage/AsyncStorage)
const isServer = typeof window === 'undefined';
const memoryStorage: Record<string, string> = {};
const serverStorage = {
  getItem: (key: string) => memoryStorage[key] ?? null,
  setItem: (key: string, value: string) => { memoryStorage[key] = value; },
  removeItem: (key: string) => { delete memoryStorage[key]; },
};

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: isServer ? serverStorage : AsyncStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: false,
    },
  }
);

// Continuously refresh the session when the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
