import { supabase } from '../auth/supabaseClient'

// 退去（本人によるアカウント削除）クライアント。実処理は /api/leave（service_role）。
// ローカル開発（vite に Pages Functions ランタイムなし）や未設定時は「利用不可」を
// 返し、UI 側で退去セクションを隠す。

export type GadgetDisposition = 'keep' | 'suspend'

let availability: Promise<boolean> | null = null

/** 退去APIが使えるか（Functions が配備・設定済みか）。SPA フォールバック回避にマーカー必須。 */
export function offboardingAvailable(): Promise<boolean> {
  if (!supabase) return Promise.resolve(false)
  availability ??= (async () => {
    try {
      const response = await fetch('/api/leave', { method: 'GET' })
      return response.headers.get('x-leave-api') === '1'
    } catch {
      return false
    }
  })()
  return availability
}

/**
 * 長屋を退去する。作った道具の扱いを gadgets で選ぶ:
 *   'keep'    … 道具は長屋に残す（世話役は大家へ・道具市には残る）
 *   'suspend' … 自分の道具も道具市から下げる
 * 成功後はサインアウトして signed-out 状態に戻す（App が LoginView を表示する）。
 */
export async function leaveNagaya(gadgets: GadgetDisposition): Promise<void> {
  if (!supabase) throw new Error('退去は Supabase 接続時のみ利用できます')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ログインが必要です')

  const response = await fetch('/api/leave', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ gadgets }),
  })
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `退去に失敗しました (HTTP ${response.status})`)
  }
  // アカウントは消えているのでローカルセッションを破棄
  await supabase.auth.signOut()
}
