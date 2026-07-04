import { useEffect, useState } from 'react'
import {
  createEvent,
  deleteEvent,
  infoLayerAvailable,
  listPastEvents,
  listUpcomingEvents,
  type EventItem,
} from '../host/infoLayer'

// 長屋暦（指示書⑦-3): 運営告知カレンダー。入居者の予定登録はしない（双方向を避ける）。

const formatRange = (event: EventItem): string => {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const start = fmt.format(new Date(event.starts_at))
  return event.ends_at ? `${start} 〜 ${fmt.format(new Date(event.ends_at))}` : start
}

export function CalendarView({ isAdmin }: { isAdmin: boolean }) {
  const [upcoming, setUpcoming] = useState<EventItem[] | null>(null)
  const [past, setPast] = useState<EventItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const reload = () => {
    Promise.all([listUpcomingEvents(), listPastEvents()])
      .then(([up, pastItems]) => {
        setUpcoming(up)
        setPast(pastItems)
      })
      .catch((cause: Error) => setError(cause.message))
  }
  useEffect(reload, [])

  if (!infoLayerAvailable()) {
    return <p className="p-4 text-sm text-stone-500">長屋暦はログイン環境でのみ表示されます。</p>
  }

  const submit = async () => {
    if (!title.trim() || !startsAt) return
    try {
      await createEvent({
        title: title.trim(),
        description: description.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        location: location.trim() || null,
      })
      setTitle('')
      setStartsAt('')
      setEndsAt('')
      setLocation('')
      setDescription('')
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const EventCard = ({ event }: { event: EventItem }) => (
    <article className="nb-panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
          {event.title}
        </h3>
        <span className="shrink-0 text-xs" style={{ color: 'var(--nb-terra)' }}>
          {formatRange(event)}
        </span>
      </div>
      {event.location && <p className="mt-1 text-xs text-stone-500">場所: {event.location}</p>}
      {event.description && (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{event.description}</p>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={() => {
            void deleteEvent(event.id).then(reload).catch((cause: Error) => setError(cause.message))
          }}
          className="mt-2 text-xs text-red-600 underline"
        >
          削除
        </button>
      )}
    </article>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        長屋暦（ながやごよみ）
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {isAdmin && (
        <div className="nb-panel mb-4 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold text-stone-500">予定の登録（管理者のみ表示）</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル（例: 勉強会 / お披露目会）"
            className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">
              開始
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-stone-500">
              終了（任意）
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="場所（任意。Zoom URL など）"
            className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="説明（任意）"
            rows={2}
            className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void submit()}
            className="btn-primary rounded-lg px-4 py-1.5 text-xs font-medium"
          >
            暦にのせる
          </button>
        </div>
      )}

      {upcoming === null && <p className="text-sm text-stone-400">読み込み中…</p>}
      {upcoming?.length === 0 && (
        <p className="nb-panel p-6 text-center text-sm text-stone-500">
          この先の予定はまだありません。
        </p>
      )}
      <div className="grid gap-3">
        {upcoming?.map((event) => <EventCard key={event.id} event={event} />)}
      </div>

      {past.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-stone-500">終わった予定</h3>
          <div className="grid gap-3 opacity-70">
            {past.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        </>
      )}
    </div>
  )
}
