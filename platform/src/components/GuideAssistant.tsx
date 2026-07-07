import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { askGuide, type GuideError, type GuideMessage } from '../host/guide'
import { fetchAiStatus } from '../host/aiSettings'
import {
  centerFromRect,
  loadLayoutsRaw,
  saveLayoutRaw,
  type CenterRect,
  type WinRect,
} from '../host/gadgetLayout'
import { currentViewportWidth, useViewportWidth } from '../host/useViewportWidth'
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
  /** 棚の「整列する」で増える値。変わったら窓を初期位置へ戻す */
  resetSignal?: number
  /** 「整列する」ボタン行の下端Y（棚が実測して渡す）。初期位置をこの下に置く */
  defaultTopY?: number
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

/** 表示メッセージ → 案内AIに送る会話（tool 結果は user 発話として渡す）
 * content が空のメッセージは AI API がエラー（400: content が空です）にするため必ず落とす。
 * 例: アシスタントがツール/操作タグだけを返し前後の文が無かったターンは content='' になる。
 * 古いツール結果（最新以外）は要約サイズに切り詰める: 1件最大8000字の結果が会話窓
 * （直近10件）に積もると入力が数万字級に肥大し、遅延・コスト・失敗率が上がるため。 */
function toConvo(msgs: Msg[]): GuideMessage[] {
  const lastToolIndex = msgs.map((m) => m.role).lastIndexOf('tool')
  return msgs
    .map((m, i) => {
      let content = (m.raw ?? m.content ?? '').trim()
      if (m.role === 'tool' && i !== lastToolIndex && content.length > 300) {
        content = content.slice(0, 300) + '…（古いツール結果のため省略）'
      }
      return {
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content,
      }
    })
    .filter((m) => m.content.length > 0)
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

// 「整列する」ボタン行の下端が未測定のとき（初回描画の一瞬など）だけ使う概算値。
const FALLBACK_TOP_Y = 220

/** 要素の現在の絶対座標（画面基準）をDOMから直接読み取る。 */
function measureRect(el: HTMLElement): WinRect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/**
 * ドラッグ開始/終了時の座標変換をビューポート幅からの計算(rectFromCenter/centerFromRect)
 * ではなく実測に置き換える（棚のガジェットと同じ理由: 100vw・パディング・スクロールバー等の
 * 重なりで数px単位のズレが出る余地を無くすため）。この窓は position:fixed なので
 * containing block は「初期包含ブロック」＝document.documentElement で測る。
 */
function toCenterOffset(absX: number): number {
  const r = document.documentElement.getBoundingClientRect()
  return absX - (r.left + r.width / 2)
}

// 初期位置＝中央1024px帯の右端（＝「整列する」ボタンの真下）・実測した行の下。
function defaultRect(topY: number, viewportWidth: number): WinRect {
  const w = 380
  const h = Math.min(520, Math.round(window.innerHeight * 0.62))
  // 中央カラム(1024)の右端 = 画面中央 + 512
  const centerRight = viewportWidth / 2 + Math.min(512, viewportWidth / 2 - 16)
  const x = Math.max(8, Math.min(centerRight - w, viewportWidth - w - 8))
  return { x, y: Math.max(8, Math.round(topY) + 8), w, h }
}

export function GuideAssistant({
  onOpenAiSettings,
  viewLabel,
  installed,
  onInstall,
  onNavigate,
  onOpenHelp,
  resetSignal,
  defaultTopY,
}: GuideAssistantProps) {
  const [open, setOpen] = useState(false)
  const viewportWidth = useViewportWidth()
  // 静止時の位置は「画面中央からのオフセット」で持つ。描画は CSS の
  // calc(50% + cxpx) で行う（下の containerStyle）ので、ブラウザのリサイズは
  // レイアウトエンジンがネイティブに追従し、JSの計算待ちによるガタつきが出ない
  // （棚のガジェットと同じ仕組み。片方だけJSで絶対座標を出し直す方式だとズレて見える）。
  const [center, setCenter] = useState<CenterRect | null>(null)
  // ドラッグ/リサイズ中だけ使う絶対座標のワーキングコピー。null=静止（CSS calc()で描画）
  const [dragLocal, setDragLocal] = useState<WinRect | null>(null)
  const narrow = viewportWidth < 640
  const topY = defaultTopY ?? FALLBACK_TOP_Y

  // 棚の「整列する」が押されたら、案内AIの窓も初期位置へ戻す（行方不明の解消）。
  const firstReset = useRef(true)
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false
      return // 初回マウント時は動かさない
    }
    const c = centerFromRect(defaultRect(topY, viewportWidth), viewportWidth)
    setCenter(c)
    saveLayoutRaw(GUIDE_ID, c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  // AI設定（BYOK）済みか。未設定なら案内AIの窓自体を出さない（費用は各自負担のため）
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const readyRef = useRef(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // いま何を待っているか（考え中／ツール実行中）。無変化の待ち時間を「固まった」と
  // 誤認させないための、段階つきの進行表示。
  const [busyLabel, setBusyLabel] = useState('考えています…')
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

  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<
    null | { mode: 'move' | 'resize'; dir?: ResizeDir; sx: number; sy: number; orig: WinRect }
  >(null)
  const [active, setActive] = useState<null | 'move' | ResizeDir>(null)

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
    if (!center) {
      setCenter(
        loadLayoutsRaw()[GUIDE_ID] ?? centerFromRect(defaultRect(topY, viewportWidth), viewportWidth),
      )
    }
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
    if (narrow || !center || !containerRef.current) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const orig = measureRect(containerRef.current) // 今まさに描画されている位置をそのまま使う
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig }
    setDragLocal(orig)
    setActive('move')
  }
  const startResize = (dir: ResizeDir, e: ReactPointerEvent) => {
    if (!center || !containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const orig = measureRect(containerRef.current)
    drag.current = { mode: 'resize', dir, sx: e.clientX, sy: e.clientY, orig }
    setDragLocal(orig)
    setActive(dir)
  }
  const onShieldMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    let next: WinRect
    if (d.mode === 'move') {
      next = {
        ...d.orig,
        x: Math.min(Math.max(0, d.orig.x + dx), currentViewportWidth() - 60),
        y: Math.min(Math.max(0, d.orig.y + dy), window.innerHeight - 40),
      }
    } else if (d.dir) {
      next = computeResize(d.orig, d.dir, dx, dy, MIN_W, MIN_H)
    } else {
      return
    }
    setDragLocal(next)
  }
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    setActive(null)
    if (dragLocal) {
      const c: CenterRect = {
        cx: toCenterOffset(dragLocal.x),
        y: dragLocal.y,
        w: dragLocal.w,
        h: dragLocal.h,
      }
      setCenter(c)
      saveLayoutRaw(GUIDE_ID, c)
    }
    setDragLocal(null)
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

  // ADR-011: 1回のAI応答を処理。read ツールは自動実行して連鎖、act は承認待ちにする。
  // retried: 空応答（本文もツールも操作も無し）だったとき、1回だけ自動で再生成する。
  // 提供元の一時的な混雑などで空が返ることがあり、そのたびに手で言い直させない。
  const runFrom = async (working: Msg[], depth: number, retried = false): Promise<void> => {
    // ストリーミング: まず空の吹き出しを置き、届いた文字を逐次追記して見せる。
    const streamIndex = working.length
    setMessages([...working, { role: 'assistant', content: '' }])
    setBusyLabel('考えています…')
    // 直近N件に切った窓の先頭が assistant にならないよう補正（Anthropic/Gemini のロール制約。
    // assistant 始まりの窓は 400 になり、会話が長くなるほど周期的に失敗していた）
    let windowed = toConvo(working).slice(-MAX_TURNS_SENT)
    while (windowed.length > 0 && windowed[0].role !== 'user') windowed = windowed.slice(1)
    // 直前がツール結果なら「続きターン」: サーバーは資料検索等を省略して速く返す
    const isContinuation = working[working.length - 1]?.role === 'tool'
    let reply: string
    try {
      reply = await askGuide(
        windowed,
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
        { continuation: isContinuation },
      )
    } catch (cause) {
      setMessages(working) // 失敗したら空の吹き出しを取り消す
      throw cause
    }
    readyRef.current = true
    // 全文が揃ったら、ツール/操作タグを解析して最終形（タグ除去済み）に置き換える。
    const { text: afterTool, toolCall } = parseGuideToolCall(reply)
    const { text, action } = parseGuideReply(afterTool)
    // アシスタントがツール/操作タグだけを返して前後の文が無いと content='' になる。
    // そのままだと次ターンで空メッセージを送って AI API がエラーになるため、モデルへ
    // 送る raw にはツール/操作の要約を入れて空にならないようにする（表示は content のまま）。
    const rawForModel = text
      ? undefined
      : toolCall
        ? `（${toolCall.gadget} の ${toolCall.tool} を実行します）`
        : action
          ? `（${actionLabel(action)}）`
          : undefined
    const withReply: Msg[] = [
      ...working,
      { role: 'assistant', content: text, raw: rawForModel, action, toolCall },
    ]
    setMessages(withReply)
    scrollToEnd()
    if (toolCall) {
      const def = findTool(toolCall.gadget, toolCall.tool)
      const needsConfirm = def?.kind === 'act' || def?.requiresConfirm
      if (needsConfirm) return // act は承認ボタン待ち（confirmTool で続行）
      if (depth < MAX_TOOL_STEPS) {
        await execAndContinue(withReply, toolCall, depth) // read は自動連鎖
        return
      }
      // read だが自動連鎖の上限。黙って捨てると「確認します」と言ったきり沈黙するため、
      // 止まった理由を必ず表示してターンを終える。
      setMessages([
        ...withReply,
        {
          role: 'tool',
          content: '⚠ 自動実行の回数上限に達したため、ここで止めました。続きが必要なら、もう一度お申し付けください。',
        },
      ])
      scrollToEnd()
      return
    }
    // ここに到達＝これ以上の自動継続は無い。本文も操作ボタンも無いと、空の吹き出しは
    // 何も描画されず（render は message.content が真のときだけ表示）、ユーザーには「無反応で
    // 固まった」ように見える。ツール実行後にモデルが本文を返さなかった場合の沈黙が主因。
    if (!text && !action) {
      // まず1回だけ自動で再生成（提供元の一時的な空応答対策）。それでも空なら断りを表示。
      if (!retried) {
        await runFrom(working, depth, true)
        return
      }
      setMessages([
        ...working,
        {
          role: 'assistant',
          content: toolCall
            ? '操作は実行しましたが、うまく説明を返せませんでした。結果はガジェット側でご確認ください。'
            : 'うまくお応えできませんでした。恐れ入りますが、もう一度、少し言い方を変えてお試しください。',
        },
      ])
      scrollToEnd()
    }
  }

  // ツール結果としてモデルへ渡すJSONの上限。予定一覧などは説明文込みで際限なく大きく
  // なり得て、続きターンの入力肥大＝遅延・コスト・失敗率の増加に直結するため頭を抑える。
  const MAX_TOOL_RESULT_CHARS = 8000

  const execAndContinue = async (working: Msg[], toolCall: GuideToolCall, depth: number) => {
    // 「実行中」を先に見せる（GAS連携ツールは数秒〜20秒かかる。以前は完了後に初めて
    // 🔧行が出るまで画面が一切変化せず、固まったように見えていた）
    setBusyLabel(`${toolCall.gadget} の「${toolCall.tool}」を実行中…`)
    setMessages([
      ...working,
      { role: 'tool', content: `🔧 ${toolCall.gadget} の「${toolCall.tool}」を実行中…` },
    ])
    scrollToEnd()
    let resultText: string
    try {
      const result = await invokeGadgetTool(toolCall.gadget, toolCall.tool, toolCall.args)
      resultText = JSON.stringify(result)
      if (resultText.length > MAX_TOOL_RESULT_CHARS) {
        resultText =
          resultText.slice(0, MAX_TOOL_RESULT_CHARS) +
          '…（長すぎるため以降省略。必要なら期間や条件を絞って再取得してください）'
      }
    } catch (cause) {
      resultText = `エラー: ${cause instanceof Error ? cause.message : String(cause)}`
    }
    // 実行中の行を、結果rawつきの確定行に置き換える（この行がモデルへの[ツール結果]になる）
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
    setBusyLabel('考えています…')
    scrollToEnd() // 送った発言がすぐ見える位置へ（以前は返答が来るまでスクロールされなかった）
    try {
      await runFrom(next, 0)
    } catch (cause) {
      const code = (cause as GuideError).code
      if (code === 'ai_not_configured') {
        // 会話の途中で無言のまま窓が消えるのは不親切: 一言添えて表示は維持する
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'AIのAPIキーが確認できませんでした。工房の「AI設定」を確認してから、もう一度お試しください。',
          },
        ])
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
  const floating = !narrow && center
  const containerClass = floating
    ? 'fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl'
    : 'fixed bottom-4 right-4 z-40 flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl'
  // ドラッグ中は絶対座標(dragLocal)、静止時は CSS calc(50% + cxpx) で中央基準に描画。
  const containerStyle = !floating
    ? undefined
    : dragLocal
      ? { left: dragLocal.x, top: dragLocal.y, width: dragLocal.w, height: dragLocal.h }
      : { left: `calc(50% + ${center!.cx}px)`, top: center!.y, width: center!.w, height: center!.h }

  return (
    <div ref={containerRef} className={containerClass} style={containerStyle}>
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
            {busy && <p className="text-xs text-stone-400">{busyLabel}</p>}
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
