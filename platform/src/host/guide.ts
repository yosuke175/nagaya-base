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

/** 段2: クライアントが分かる「今の文脈」（サーバ状態票を補う。画面など）。 */
export interface GuideContext {
  /** 今ユーザーが見ている画面の表示名（例: 道具市） */
  viewLabel?: string
  /** ADR-011: 今操作できるガジェットのツール一覧（棚に開いているもの） */
  tools?: Array<{
    gadget: string
    gadgetName: string
    name: string
    description: string
    kind: 'read' | 'act'
  }>
  /** ペルソナ（見た目に合わせた性格・話し方）＋利用者の基本情報 */
  persona?: {
    /** 呼び名（例: 女中） */
    name?: string
    /** 性格・話し方 */
    personality?: string
    /** 利用者の基本情報（名前・呼ばれ方・してほしいこと等） */
    userInfo?: string
  }
}

/**
 * 直近ターン（messages）＋文脈を渡して案内AIの返答を得る。未設定時は code='ai_not_configured'。
 * 生成はサーバー側でストリーミング（text/plain）。onDelta が届いた分を逐次受け取り、
 * 戻り値は最終的な全文（呼び出し側は全文でツール/操作タグを解析する）。
 */
export async function askGuide(
  messages: GuideMessage[],
  context?: GuideContext,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const t0 = Date.now()
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'guide', request: { messages }, context }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
    const err = new Error(payload.error ?? `案内AI エラー (HTTP ${response.status})`) as GuideError
    err.code = payload.code
    throw err
  }
  if (!response.body) return (await response.text().catch(() => '')) ?? ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let firstAt = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (!chunk) continue
    if (!firstAt) {
      firstAt = Date.now()
      // 実測: 最初の文字が出るまで（TTFT）。ストリーミングの体感速度の指標。
      console.debug('[案内AI] TTFT(ms)', firstAt - t0)
    }
    full += chunk
    onDelta?.(chunk)
  }
  console.debug('[案内AI] total(ms)', Date.now() - t0)
  return full
}
