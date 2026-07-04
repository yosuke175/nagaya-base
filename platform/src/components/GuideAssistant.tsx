import { useRef, useState } from 'react'
import { askGuide, type GuideError, type GuideMessage } from '../host/guide'
import { fetchAiStatus } from '../host/aiSettings'

// 案内AI（段1・ステートレス）: 下部常駐の単一窓。スマホ最優先。
//  - 会話は1セッション内だけ（この state のみ。閉じる/再読み込みで消える）
//  - 生成はユーザーBYOK（/api/ai guide）。AIは任意: 未設定なら入口だけ表示し、長屋は完全機能
//  - 乱立させない（棚の FloatingWindow とは別。画面に1つ）

const MAX_TURNS_SENT = 10 // サーバーへ渡す直近ターン数（セッション内の連続性）

export function GuideAssistant({ onOpenAiSettings }: { onOpenAiSettings: () => void }) {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const openPanel = () => {
    setOpen(true)
    if (configured === null) {
      void fetchAiStatus()
        .then((status) => setConfigured(status.registered))
        .catch(() => setConfigured(false))
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setError(null)
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const reply = await askGuide(next.slice(-MAX_TURNS_SENT))
      setConfigured(true)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (cause) {
      const code = (cause as GuideError).code
      if (code === 'ai_not_configured') {
        setConfigured(false)
      } else {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      setBusy(false)
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      })
    }
  }

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

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
      <header
        className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2"
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

      {configured === false ? (
        <div className="grid gap-3 p-4 text-sm">
          <p className="text-stone-600">
            AIを設定すると、長屋の使い方や道具のインストールを案内します（任意）。
            <br />
            未設定でも長屋のすべての機能は使えます。
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onOpenAiSettings()
            }}
            className="btn-primary justify-self-start rounded-lg px-4 py-2 text-xs font-medium"
          >
            AI設定へ（工房）
          </button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-500">
                長屋の使い方をたずねてください。例:「道具はどこから入れる？」「スケジュール秘書の設定方法は？」
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${
                    message.role === 'user'
                      ? 'btn-primary rounded-br-sm'
                      : 'rounded-bl-sm bg-stone-100 text-stone-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-stone-400">考え中…</p>}
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
    </div>
  )
}
