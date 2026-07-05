import { useEffect, useState } from 'react'
import {
  infoLayerAvailable,
  listAnnouncements,
  listFeed,
  listUpcomingEvents,
  type Announcement,
  type EventItem,
  type FeedItem,
} from '../host/infoLayer'

// 棚（ダッシュボード）上部の情報系ウィジェット（指示書⑦ 横断事項）。
// 回覧板の最新 1〜2件 / 速報！ / 次の予定（長屋暦）を一方向で差し込む。
// 通知はここに「表示される」まで。メール/プッシュは作らない（将来 backlog）。

// 歩みは案内所（help）内に移設したので、速報！は help に飛ばす（既定で長屋の歩みが開く）
type InfoView = 'announcements' | 'calendar' | 'help'

export function InfoSlot({
  onNavigate,
  onOpenGadget,
}: {
  onNavigate?: (view: InfoView) => void
  /** 速報！の各項目（道具公開）から、道具市の該当ガジェットへ飛ぶ */
  onOpenGadget?: (dir: string) => void
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!infoLayerAvailable()) return
    Promise.all([listAnnouncements(2), listFeed(3), listUpcomingEvents(1)])
      .then(([latestAnnouncements, latestFeed, upcoming]) => {
        setAnnouncements(latestAnnouncements)
        setFeed(latestFeed)
        setNextEvent(upcoming[0] ?? null)
        setLoaded(true)
      })
      .catch(() => setLoaded(false)) // 情報系は取れなくても棚の邪魔をしない
  }, [])

  if (!infoLayerAvailable() || !loaded) return null
  if (announcements.length === 0 && feed.length === 0 && !nextEvent) return null

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {announcements.length > 0 && (
        <button
          type="button"
          onClick={() => onNavigate?.('announcements')}
          className="nb-panel p-3 text-left hover:opacity-90"
        >
          <p className="text-xs font-semibold text-stone-500">回覧板</p>
          {announcements.map((item) => (
            <p key={item.id} className="mt-1 truncate text-sm">
              {item.importance === 'important' && (
                <span
                  className="mr-1 rounded px-1 text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--nb-terra)' }}
                >
                  重要
                </span>
              )}
              {item.title}
            </p>
          ))}
        </button>
      )}
      {feed.length > 0 && (
        <div className="nb-panel p-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--nb-terra)' }}>
            速報！
          </p>
          {feed.map((item) => {
            // 道具公開の速報は、その道具（target=道具ID＝道具市のdir）へ飛べる
            const dir = item.type === 'gadget_published' && item.target ? item.target : null
            return dir && onOpenGadget ? (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenGadget(dir)}
                className="mt-1 block w-full truncate text-left text-sm underline-offset-2 hover:underline"
                title="道具市でこの道具を見る"
              >
                {item.summary}
              </button>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.('help')}
                className="mt-1 block w-full truncate text-left text-sm"
              >
                {item.summary}
              </button>
            )
          })}
        </div>
      )}
      {nextEvent && (
        <button
          type="button"
          onClick={() => onNavigate?.('calendar')}
          className="nb-panel p-3 text-left hover:opacity-90"
        >
          <p className="text-xs font-semibold text-stone-500">次の予定（長屋暦）</p>
          <p className="mt-1 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
            {nextEvent.title}
          </p>
          <p className="text-xs text-stone-500">
            {new Intl.DateTimeFormat('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(nextEvent.starts_at))}
          </p>
        </button>
      )}
    </div>
  )
}
