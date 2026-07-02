import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { appConfig } from '../config'

// Null when the Supabase env vars are not set — the app then runs in the
// no-login local dev mode with mock stores (see README).
export const supabase: SupabaseClient | null =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey)
    : null
