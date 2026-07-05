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

/** 直近ターン（messages）＋文脈を渡して案内AIの返答を得る。未設定時は code='ai_not_configured'。 */
export async function askGuide(messages: GuideMessage[], context?: GuideContext): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'guide', request: { messages }, context }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    text?: string
    error?: string
    code?: string
    timing?: { prepMs: number; ragMs: number; genMs: number; totalMs: number }
  }
  // 実測: 1ターンの内訳（準備並列/RAG検索/生成/合計）を devtools で確認できる。
  if (payload.timing) console.debug('[案内AI] timing(ms)', payload.timing)
  if (!response.ok) {
    const err = new Error(
      payload.error ?? `案内AI エラー (HTTP ${response.status})`,
    ) as GuideError
    err.code = payload.code
    throw err
  }
  return payload.text ?? ''
}
