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

  // ストリーミングに「無反応で永久に固まる」対策のタイムアウトを付ける。
  // これが無いと、サーバーのコールドスタートや提供元の詰まりでストリームが止まると、
  // reader.read() が永遠に返らず、案内AIがエラーも出さず固まっていた（本不具合の主因）。
  // 方式: AbortController を「失速タイマー」で駆動し、一定時間データが来なければ中断する。
  // 失速判定は短めに。正常時は入力直後にストリーミングで文字が出始めるので、最初の1文字が
  // 来ない＝固まり、は数秒で分かる。ただし短すぎるとコールドスタート（最初の応答に数秒）を
  // 誤って切ってしまい「偽タイムアウト」で逆に不安定に感じるため、8秒で様子見（要調整）。
  const controller = new AbortController()
  const STALL_MS = 8_000 // 最初の応答／各チャンク間がこの時間空いたら中断
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const armStall = () => {
    clearTimeout(stallTimer)
    stallTimer = setTimeout(() => controller.abort(), STALL_MS)
  }

  let response: Response
  armStall()
  try {
    response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'guide', request: { messages }, context }),
      signal: controller.signal,
    })
  } catch (cause) {
    clearTimeout(stallTimer)
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('案内AIの応答が来ませんでした（タイムアウト）。もう一度お試しください。')
    }
    throw cause
  }
  if (!response.ok) {
    clearTimeout(stallTimer)
    const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
    const err = new Error(payload.error ?? `案内AI エラー (HTTP ${response.status})`) as GuideError
    err.code = payload.code
    throw err
  }
  if (!response.body) {
    clearTimeout(stallTimer)
    return (await response.text().catch(() => '')) ?? ''
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let firstAt = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      armStall() // データが来たので失速タイマーを張り直す
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
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      // 途中で失速して中断。ここまで受け取った分があればそれを返し、無ければエラー。
      if (full) return full
      throw new Error('案内AIの応答が途中で止まりました（タイムアウト）。もう一度お試しください。')
    }
    throw cause
  } finally {
    clearTimeout(stallTimer)
  }
  console.debug('[案内AI] total(ms)', Date.now() - t0)
  return full
}
