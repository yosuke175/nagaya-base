import { supabase } from '../auth/supabaseClient'

// Per-user UI settings, stored in profiles.settings (jsonb) when signed in.
//
// The entrance 職人/店子 choice is a BEHAVIORAL branch only（2026-07-04 決定）:
// a self-declared preference with no status or permission implications.
// Security roles stay admin-assigned (ADR-003) — never write roles here.
//
// No-login local dev falls back to localStorage (device-only is fine there).

export interface UserSettings {
  /** 入口の選択。craftsman=職人(つくる人) / tenant=店子(つかう人) */
  entrance?: 'craftsman' | 'tenant'
  /** 店子チュートリアルを完了（またはスキップ）したか */
  tutorialDone?: boolean
}

const LOCAL_KEY = 'platform-user-settings'

async function sessionUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function loadUserSettings(): Promise<UserSettings> {
  const userId = await sessionUserId()
  if (supabase && userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', userId)
      .single()
    if (error) throw new Error(`設定の読み込みに失敗しました: ${error.message}`)
    return (data?.settings ?? {}) as UserSettings
  }
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as UserSettings
  } catch {
    return {}
  }
}

export async function saveUserSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await loadUserSettings()
  const next = { ...current, ...patch }
  const userId = await sessionUserId()
  if (supabase && userId) {
    const { error } = await supabase.from('profiles').update({ settings: next }).eq('id', userId)
    if (error) throw new Error(`設定の保存に失敗しました: ${error.message}`)
    return next
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  return next
}
