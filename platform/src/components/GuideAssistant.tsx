import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { askGuide, type GuideError, type GuideMessage } from '../host/guide'
import { fetchAiStatus } from '../host/aiSettings'
import { loadLayouts, saveLayout, type WinRect } from '../host/gadgetLayout'
import {
  actionLabel,
  parseGuideReply,
  parseGuideToolCall,
  type GuideAction,
  type GuideToolCall,
  type GuideView,
} from '../host/guideActions'
import { loadGadgetManifest } from '../host/gadgetHost'
import { findTool, invokeGadgetTool, toolCatalog } from '../host/gadgetTools'

interface GuideAssistantProps {
  onOpenAiSettings: () => void
  /** 段2 文脈追従: 今見ている画面の表示名 */
  viewLabel: string
  /** 段2 操作補助: 導入済み判定・実行コールバック（すべてユーザー承認後に実行） */
  installed: string[]
  onInstall: (gadgetId: string) => void
  onNavigate: (view: GuideView) => void
  onOpenHelp: (article: string) => void
}

interface Msg {
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** モデルへ送る生テキスト（tool は結果JSONを添えた形。無ければ content） */
  raw?: string
  action?: GuideAction | null
  toolCall?: GuideToolCall | null
  done?: boolean
}

/** 表示メッセージ → 案内AIに送る会話（tool 結果は user 発話として渡す） */
function toConvo(msgs: Msg[]): GuideMessage[] {
  return msgs.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.raw ?? m.content,
  }))
}

// 案内AI（段1・ステートレス）: 下部常駐の単一窓。
//  - PC（広い画面）: ガジェットと同じく見出しドラッグで移動・右下でリサイズ（配置は端末保存）
//  - スマホ（狭い画面）: 下部固定パネル（動かさない）
//  - 会話は1セッション内のみ（この state のみ。閉じる/再読み込みで消える）
//  - 生成はユーザーBYOK（/api/ai guide）。AIは任意: 未設定なら入口だけ表示

const MAX_TURNS_SENT = 10
const MAX_TOOL_STEPS = 3 // 1ユーザー発話あたりの自動ツール連鎖の上限（暴走防止）
const GUIDE_ID = '__guide__' // レイアウト保存キー（gadgetLayout を流用）
const MIN_W = 300
const MIN_H = 240

function defaultRect(): WinRect {
  const w = 380
  const h = Math.min(560, Math.round(window.innerHeight * 0.7))
  return {
    x: Math.max(8, window.innerWidth - w - 16),
    y: Math.max(8, window.innerHeight - h - 16),
    w,
    h,
  }
}

export function GuideAssistant({
  onOpenAiSettings,
  viewLabel,
  installed,
  onInstall,
  onNavigate,
  onOpenHelp,
}: GuideAssistantProps) {
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [rect, setRect] = useState<WinRect | null>(null)
  // AI設定（BYOK）済みか。未設定なら案内AIの窓自体を出さない（費用は各自負担のため）
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const readyRef = useRef(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 段2 伴走: 連携設定が要る（externalServices を持つ）導入済み道具 → 設定方法チップを出す
  const [setupGadgets, setSetupGadgets] = useState<Array<{ id: string; name: string }>>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const drag = useRef<null | { mode: 'move' | 'resize'; sx: number; sy: number; orig: WinRect }>(null)
  const [active, setActive] = useState<null | 'move' | 'resize'>(null)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // AI設定済みかを確認（マウント時＋画面移動のたび、設定が済むまで）。
  // 済んだら readyRef で以後は問い合わせない。工房でAI設定→移動すると窓が出る。
  useEffect(() => {
    if (readyRef.current) return
    void fetchAiStatus()
      .then((status) => {
        if (status.registered) {
          readyRef.current = true
          setAiReady(true)
        } else {
          setAiReady(false)
        }
      })
      .catch(() => setAiReady(false))
  }, [viewLabel])

  const openPanel = () => {
    setOpen(true)
    if (!rect) setRect(loadLayouts()[GUIDE_ID] ?? defaultRect())
    // 導入済み道具のうち「連携設定が要る」ものを拾い、設定方法チップの候補にする
    void (async () => {
      const found: Array<{ id: string; name: string }> = []
      for (const id of installed) {
        try {
          const manifest = await loadGadgetManifest(id)
          if ((manifest.externalServices?.length ?? 0) > 0) found.push({ id, name: manifest.name })
        } catch {
          // 読めない道具はスキップ
        }
      }
      setSetupGadgets(found)
    })()
  }

  // --- ドラッグ / リサイズ（PCのみ） ---
  const startMove = (e: ReactPointerEvent) => {
    if (narrow || !rect) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: rect }
    setActive('move')
  }
  const startResize = (e: ReactPointerEvent) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = { mode: 'resize', sx: e.clientX, sy: e.clientY, orig: rect }
    setActive('resize')
  }
  const onShieldMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') {
      setRect({
        ...d.orig,
        x: Math.min(Math.max(0, d.orig.x + dx), window.innerWidth - 60),
        y: Math.min(Math.max(0, d.orig.y + dy), window.innerHeight - 40),
      })
    } else {
      setRect({
        ...d.orig,
        w: Math.max(MIN_W, d.orig.w + dx),
        h: Math.max(MIN_H, d.orig.h + dy),
      })
    }
  }
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    setActive(null)
    if (rect) saveLayout(GUIDE_ID, rect)
  }

  const scrollToEnd = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }))

  const runAction = (index: number, action: GuideAction) => {
    switch (action.type) {
      case 'install':
        if (!installed.includes(action.gadgetId)) onInstall(action.gadgetId)
        break
      case 'open':
        onNavigate(action.view)
        break
      case 'help':
        onOpenHelp(action.article)
        break
      case 'ai-settings':
        onOpenAiSettings()
        break
    }
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, done: true } : m)))
  }

  // ADR-011: 1回のAI応答を処理。read ツールは自動実行して連鎖、act は承認待ちにする
  const runFrom = async (working: Msg[], depth: number): Promise<void> => {
    const reply = await askGuide(toConvo(working).slice(-MAX_TURNS_SENT), {
      viewLabel,
      tools: toolCatalog(),
    })
    readyRef.current = true
    const { text: afterTool, toolCall } = parseGuideToolCall(reply)
    const { text, action } = parseGuideReply(afterTool)
    const withReply: Msg[] = [...working, { role: 'assistant', content: text, action, toolCall }]
    setMessages(withReply)
    scrollToEnd()
    if (toolCall) {
      const def = findTool(toolCall.gadget, toolCall.tool)
      const needsConfirm = def?.kind === 'act' || def?.requiresConfirm
      if (needsConfirm) return // act は承認ボタン待ち（confirmTool で続行）
      if (depth < MAX_TOOL_STEPS) await execAndContinue(withReply, toolCall, depth) // read は自動
    }
  }

  const execAndContinue = async (working: Msg[], toolCall: GuideToolCall, depth: number) => {
    let resultText: string
    try {
      const result = await invokeGadgetTool(toolCall.gadget, toolCall.tool, toolCall.args)
      resultText = JSON.stringify(result)
    } catch (cause) {
      resultText = `エラー: ${cause instanceof Error ? cause.message : String(cause)}`
    }
    const next: Msg[] = [
      ...working,
      {
        role: 'tool',
        content: `🔧 ${toolCall.gadget} の「${toolCall.tool}」を実行`,
        raw: `[ツール結果 ${toolCall.gadget}.${toolCall.tool}] ${resultText}`,
      },
    ]
    setMessages(next)
    scrollToEnd()
    await runFrom(next, depth + 1)
  }

  const confirmTool = async (index: number) => {
    const msg = messages[index]
    if (!msg?.toolCall || busy) return
    const working = messages.map((m, i) => (i === index ? { ...m, done: true } : m))
    setMessages(working)
    setBusy(true)
    try {
      await execAndContinue(working, msg.toolCall, 0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      scrollToEnd()
    }
  }

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || busy) return
    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      await runFrom(next, 0)
    } catch (cause) {
      const code = (cause as GuideError).code
      if (code === 'ai_not_configured') {
        // 途中でキーが外れた等 → 窓ごと隠す（次に設定すれば再表示）
        readyRef.current = false
        setAiReady(false)
      } else setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      scrollToEnd()
    }
  }

  // AI未設定なら案内AIは出さない（費用は各自のBYOK負担のため、動かせない窓は見せない）
  if (aiReady !== true) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="btn-primary fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg"
        title="案内AI（長屋の使い方をたずねる）"
      >
        <span aria-hidden>💬</span>
        案内AI
      </button>
    )
  }

  // 狭い画面は下部固定、広い画面は保存位置に自由配置
  const floating = !narrow && rect
  const containerClass = floating
    ? 'fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl'
    : 'fixed bottom-4 right-4 z-40 flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl'
  const containerStyle = floating
    ? { left: rect!.x, top: rect!.y, width: rect!.w, height: rect!.h }
    : undefined

  return (
    <div className={containerClass} style={containerStyle}>
      <header
        onPointerDown={startMove}
        className={`flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2 ${
          floating ? 'cursor-move select-none' : ''
        }`}
        style={{ backgroundColor: 'color-mix(in srgb, var(--nb-cream) 70%, white)' }}
      >
        <p className="text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
          案内AI <span className="text-xs font-normal text-stone-400">β・記憶しません</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
        >
          閉じる
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <div className="grid gap-2">
                <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
                  長屋の使い方をたずねてください。下のボタンからも聞けます。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {setupGadgets.slice(0, 2).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => void send(`「${g.name}」の連携設定のやり方を教えて`)}
                      className="rounded-full border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50"
                    >
                      「{g.name}」の設定方法
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void send('道具はどこから入れる？')}
                    className="rounded-full border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50"
                  >
                    道具の入れ方
                  </button>
                  <button
                    type="button"
                    onClick={() => void send('この画面でできることは？')}
                    className="rounded-full border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50"
                  >
                    この画面の使い方
                  </button>
                </div>
              </div>
            )}
            {messages.map((message, index) => {
              if (message.role === 'tool') {
                return (
                  <p key={index} className="text-center text-xs text-stone-400">
                    {message.content}
                  </p>
                )
              }
              const toolDef = message.toolCall
                ? findTool(message.toolCall.gadget, message.toolCall.tool)
                : null
              const needsConfirm =
                message.role === 'assistant' &&
                message.toolCall != null &&
                (toolDef?.kind === 'act' || toolDef?.requiresConfirm)
              return (
                <div
                  key={index}
                  className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {message.content && (
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                        message.role === 'user'
                          ? 'btn-primary rounded-br-sm'
                          : 'rounded-bl-sm bg-stone-100 text-stone-800'
                      }`}
                    >
                      {message.content}
                    </div>
                  )}
                  {message.role === 'assistant' && message.action && (
                    <div className="mt-1">
                      {message.action.type === 'install' &&
                      installed.includes(message.action.gadgetId) ? (
                        <span className="text-xs text-stone-400">導入済み</span>
                      ) : (
                        <button
                          type="button"
                          disabled={message.done}
                          onClick={() => runAction(index, message.action!)}
                          className="rounded-lg border border-[color:var(--nb-terra)] px-3 py-1 text-xs font-medium disabled:opacity-40"
                          style={{ color: 'var(--nb-terra)' }}
                        >
                          {message.done ? '実行しました' : `▶ ${actionLabel(message.action)}`}
                        </button>
                      )}
                    </div>
                  )}
                  {needsConfirm && (
                    <div className="mt-1">
                      <button
                        type="button"
                        disabled={message.done || busy}
                        onClick={() => void confirmTool(index)}
                        className="rounded-lg border border-[color:var(--nb-terra)] px-3 py-1 text-xs font-medium disabled:opacity-40"
                        style={{ color: 'var(--nb-terra)' }}
                      >
                        {message.done
                          ? '実行しました'
                          : `▶ ${message.toolCall!.gadget} に「${message.toolCall!.tool}」を実行`}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {busy && <p className="text-xs text-stone-400">道具・案内を確認しています…</p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          </div>
          <div className="flex items-end gap-2 border-t border-stone-100 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="長屋のことをたずねる…"
              className="max-h-24 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="btn-primary shrink-0 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              送信
            </button>
          </div>

      {/* PCのみ: 右下リサイズハンドル */}
      {floating && (
        <div
          onPointerDown={startResize}
          title="サイズ変更"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 55%, var(--nb-navy) 55%, var(--nb-navy) 65%, transparent 65%, transparent 75%, var(--nb-navy) 75%, var(--nb-navy) 85%, transparent 85%)',
          }}
        />
      )}
      {/* ドラッグ/リサイズ中の全面シールド */}
      {active && (
        <div
          className="fixed inset-0 z-[9999]"
          style={{ cursor: active === 'resize' ? 'nwse-resize' : 'move' }}
          onPointerMove={onShieldMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      )}
    </div>
  )
}
