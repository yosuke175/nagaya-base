import { getAccessToken } from './credentialsApi'

// 案内AI（段1・ステートレス）クライアント。生成は既存 /api/ai の 'guide' アクション経由
// （ユーザーBYOK・状態票つきの system はサーバーが組む）。会話履歴は1セッション内のみ
// （このモジュールは保持しない。呼び出し側が直近ターンを渡す）。

export interface GuideMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GuideError extends Error {
  code?: string
}

/** 直近ターン（messages）を渡して案内AIの返答を得る。未設定時は code='ai_not_configured'。 */
export async function askGuide(messages: GuideMessage[]): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'guide', request: { messages } }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    text?: string
    error?: string
    code?: string
  }
  if (!response.ok) {
    const err = new Error(
      payload.error ?? `案内AI エラー (HTTP ${response.status})`,
    ) as GuideError
    err.code = payload.code
    throw err
  }
  return payload.text ?? ''
}
