import { getAccessToken } from './credentialsApi'

// 案内AI（段1・ステートレス）クライアント。生成は既存 /api/ai の 'guide' アクション経由
// （ユーザーBYOK・状態票つきの system はサーバーが組む）。会話履歴は1セッション内のみ
// （このモジュールは保持しない。呼び出し側が直近ターンを渡す）。
//
// 通信は非ストリーミングの JSON（{ text }）。以前は SSE ストリーミングだったが、
// 提供元の途中イベントの扱い等で「空の正常応答」「無言で固まる」が間欠的に発生し
// 不安定の主因になっていたため、gadget.ai.complete と同じ実証済みの単純な経路に
// 一本化した（2026-07-07）。復活させる場合は git 履歴を参照。

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

// 生成完了までの総時間の上限。非ストリーミングなので「生成が終わるまで」を待つ
// （長い回答＋コールドスタートでも収まる値）。超えたら中断してエラー表示＝無言で
// 固まらせない。待ち時間中は呼び出し側の「考え中」表示が出ている。
const TOTAL_TIMEOUT_MS = 60_000

/**
 * 直近ターン（messages）＋文脈を渡して案内AIの返答を得る。未設定時は code='ai_not_configured'。
 * onDelta は互換のため残しており、全文が届いた時点で1回だけ呼ばれる。
 */
export async function askGuide(
  messages: GuideMessage[],
  context?: GuideContext,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const t0 = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'guide', request: { messages }, context }),
      signal: controller.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('案内AIの応答が来ませんでした（60秒タイムアウト）。もう一度お試しください。')
    }
    throw cause
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string
    error?: string
    code?: string
  }
  if (!response.ok) {
    const err = new Error(payload.error ?? `案内AI エラー (HTTP ${response.status})`) as GuideError
    err.code = payload.code
    throw err
  }
  const text = typeof payload.text === 'string' ? payload.text : ''
  console.debug('[案内AI] total(ms)', Date.now() - t0)
  if (text) onDelta?.(text)
  return text
}
