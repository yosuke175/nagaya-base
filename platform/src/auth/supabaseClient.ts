import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { appConfig } from '../config'

// Null when the Supabase env vars are not set — the app then runs in the
// no-login local dev mode with mock stores (see README).
export const supabase: SupabaseClient | null =
  appConfig.supabaseUrl && appConfig.supabaseAnonKey
    ? createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey)
    : null

/** Signed-in user's id, or null (not configured / signed out). */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}
