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
import { ResizeHandles, computeResize, cursorForDir, type ResizeDir } from './resizeHandles'
import {
  PERSONAS,
  personaById,
  loadAssistantPrefs,
  saveAssistantPrefs,
  toPersonaDataUrl,
  USER_INFO_MAX,
  PERSONALITY_MAX,
  type AssistantPrefs,
} from '../host/persona'

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
  // ペルソナ（見た目＋性格・話し方）＋利用者の基本情報。端末ローカル保存。
  const [prefs, setPrefs] = useState<AssistantPrefs>(() => loadAssistantPrefs())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const persona = personaById(prefs.personaId)
  const avatarSrc = prefs.customImage || persona.img

  const updatePrefs = (patch: Partial<AssistantPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      saveAssistantPrefs(next)
      return next
    })
  }
  // ペルソナを選ぶと、その既定の「性格・話し方」をセットする（自作画像は解除）
  const choosePersona = (id: string) => {
    updatePrefs({ personaId: id, personality: personaById(id).personality, customImage: '' })
  }
  const onPickImage = async (file: File | undefined) => {
    if (!file) return
    setImgError(null)
    try {
      const dataUrl = await toPersonaDataUrl(file)
      updatePrefs({ customImage: dataUrl })
    } catch (cause) {
      setImgError(cause instanceof Error ? cause.message : '画像を読み込めませんでした')
    }
  }

  const drag = useRef<
    null | { mode: 'move' | 'resize'; dir?: ResizeDir; sx: number; sy: number; orig: WinRect }
  >(null)
  const [active, setActive] = useState<null | 'move' | ResizeDir>(null)

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

  // AI設定済みなら既定で開いておく（ボタンだけの状態にしない）。
  // aiReady が true になった1回だけ開く。ユーザーが閉じたら閉じたまま。
  useEffect(() => {
    if (aiReady === true) openPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady])

  // --- ドラッグ / リサイズ（PCのみ） ---
  const startMove = (e: ReactPointerEvent) => {
    if (narrow || !rect) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: rect }
    setActive('move')
  }
  const startResize = (dir: ResizeDir, e: ReactPointerEvent) => {
    if (!rect) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = { mode: 'resize', dir, sx: e.clientX, sy: e.clientY, orig: rect }
    setActive(dir)
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
    } else if (d.dir) {
      setRect(computeResize(d.orig, d.dir, dx, dy, MIN_W, MIN_H))
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
    // ストリーミング: まず空の吹き出しを置き、届いた文字を逐次追記して見せる。
    const streamIndex = working.length
    setMessages([...working, { role: 'assistant', content: '' }])
    let reply: string
    try {
      reply = await askGuide(
        toConvo(working).slice(-MAX_TURNS_SENT),
        {
          viewLabel,
          tools: toolCatalog(),
          persona: {
            name: persona.label,
            personality: prefs.personality,
            userInfo: prefs.userInfo,
          },
        },
        (chunk) => {
          setMessages((prev) => {
            const copy = [...prev]
            const m = copy[streamIndex]
            if (m && m.role === 'assistant') copy[streamIndex] = { ...m, content: (m.content ?? '') + chunk }
            return copy
          })
          scrollToEnd()
        },
      )
    } catch (cause) {
      setMessages(working) // 失敗したら空の吹き出しを取り消す
      throw cause
    }
    readyRef.current = true
    // 全文が揃ったら、ツール/操作タグを解析して最終形（タグ除去済み）に置き換える。
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
        <p className="min-w-0 truncate text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
          案内AI<span className="ml-1 font-normal text-stone-500">・{persona.label}</span>{' '}
          <span className="text-xs font-normal text-stone-400">β</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => updatePrefs({ compact: !prefs.compact })}
            title="ペルソナ画像の表示サイズ（縮小⇔標準）"
            className="rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
          >
            {prefs.compact ? '標準' : '縮小'}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            title="案内AIの見た目・性格を変える"
            aria-pressed={settingsOpen}
            className={`rounded border px-2 py-0.5 text-xs hover:bg-stone-50 ${
              settingsOpen
                ? 'border-stone-400 bg-stone-100 text-stone-700'
                : 'border-stone-200 text-stone-500'
            }`}
          >
            ⚙ 設定
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
          >
            閉じる
          </button>
        </div>
      </header>

      {/* ペルソナのすがた（案内AIの上・窓幅いっぱいに表示。窓を広げると縦横比を保って拡大）。
          縮小時は中央の帯だけ（上1割・下半分を削って高さ4割＝5:1）を見せる。 */}
      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        title="タップで見た目・性格を変える"
        className="block w-full shrink-0 overflow-hidden border-b border-stone-100"
        style={{ backgroundColor: 'color-mix(in srgb, var(--nb-cream) 55%, white)' }}
      >
        <div className="w-full overflow-hidden" style={{ aspectRatio: prefs.compact ? '5 / 1' : '2 / 1' }}>
          <img
            src={avatarSrc}
            alt={`案内AI（${persona.label}）`}
            className="h-full w-full object-cover"
            style={{ objectPosition: prefs.compact ? 'center 17%' : 'center' }}
          />
        </div>
      </button>

      {settingsOpen ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
          <section>
            <p className="mb-1.5 text-xs font-semibold text-stone-500">すがたを選ぶ</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePersona(p.id)}
                  title={p.blurb}
                  className={`overflow-hidden rounded-lg border text-center ${
                    !prefs.customImage && prefs.personaId === p.id
                      ? 'border-2 border-[var(--nb-navy)]'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <img src={p.img} alt={p.label} className="h-14 w-full object-cover" />
                  <span className="block py-0.5 text-[11px] text-stone-600">{p.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-xs font-semibold text-stone-500">自分の画像を使う</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50">
                画像を選ぶ
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickImage(e.target.files?.[0])}
                />
              </label>
              {prefs.customImage && (
                <button
                  type="button"
                  onClick={() => updatePrefs({ customImage: '' })}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
                >
                  選んだすがたに戻す
                </button>
              )}
            </div>
            {imgError && <p className="mt-1 text-xs text-red-600">{imgError}</p>}
          </section>

          <section>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">
              基本情報（あなたのこと・してほしいこと）
            </label>
            <textarea
              value={prefs.userInfo}
              maxLength={USER_INFO_MAX}
              onChange={(e) => updatePrefs({ userInfo: e.target.value })}
              rows={3}
              placeholder="例：私の名前は山田。「山田さん」と呼んで。専門用語は控えめに、結論から短く教えて。"
              className="w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-500">性格・話し方</label>
              <button
                type="button"
                onClick={() => updatePrefs({ personality: persona.personality })}
                className="text-xs text-stone-500 underline hover:text-stone-700"
              >
                このすがたの標準に戻す
              </button>
            </div>
            <textarea
              value={prefs.personality}
              maxLength={PERSONALITY_MAX}
              onChange={(e) => updatePrefs({ personality: e.target.value })}
              rows={4}
              placeholder="案内AIの性格や話し方を自由に書けます。"
              className="w-full resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </section>

          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium"
          >
            会話に戻る
          </button>
        </div>
      ) : (
        <>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <div className="grid gap-2">
                {/* ログイン時の第一声（このすがたの声かけ・挨拶）。表示のみ・生成コストなし */}
                <p
                  className="rounded-lg p-3 text-sm leading-relaxed text-stone-700"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--nb-cream) 60%, white)' }}
                >
                  {persona.greeting}
                </p>
                <p className="px-1 text-xs text-stone-400">
                  長屋のことをたずねてください。下のボタンからも聞けます。
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
        </>
      )}

      {/* PCのみ: 4辺4角のリサイズハンドル */}
      {floating && <ResizeHandles onStart={startResize} />}
      {/* ドラッグ/リサイズ中の全面シールド */}
      {active && (
        <div
          className="fixed inset-0 z-[9999]"
          style={{ cursor: active === 'move' ? 'move' : cursorForDir(active) }}
          onPointerMove={onShieldMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      )}
    </div>
  )
}
