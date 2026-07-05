import { useEffect, useState, type ReactNode } from 'react'
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
  userName,
  roomNo,
}: {
  onNavigate?: (view: InfoView) => void
  /** 速報！の各項目（道具公開）から、道具市の該当ガジェットへ飛ぶ */
  onOpenGadget?: (dir: string) => void
  /** 部屋トップの表示名・部屋番号 */
  userName?: string | null
  roomNo?: number | null
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)

  useEffect(() => {
    if (!infoLayerAvailable()) return
    Promise.all([listAnnouncements(2), listFeed(3), listUpcomingEvents(1)])
      .then(([latestAnnouncements, latestFeed, upcoming]) => {
        setAnnouncements(latestAnnouncements)
        setFeed(latestFeed)
        setNextEvent(upcoming[0] ?? null)
      })
      .catch(() => undefined) // 情報系は取れなくても部屋の帯（背景＋ようこそ）は出す
  }, [])

  const fmtEvent = (iso: string) =>
    new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  // ニュースは中央〜右に最大2つ（速報！→回覧板→次の予定 の優先で先頭2件）
  const news: ReactNode[] = []
  if (feed.length > 0) {
    const item = feed[0]
    const dir = item.type === 'gadget_published' && item.target ? item.target : null
    news.push(
      <NewsCard
        key="feed"
        label="速報！"
        labelColor="var(--nb-terra)"
        text={item.summary}
        onClick={() => (dir && onOpenGadget ? onOpenGadget(dir) : onNavigate?.('help'))}
      />,
    )
  }
  if (announcements.length > 0) {
    news.push(
      <NewsCard
        key="ann"
        label="回覧板"
        text={announcements[0].title}
        onClick={() => onNavigate?.('announcements')}
      />,
    )
  }
  if (nextEvent) {
    news.push(
      <NewsCard
        key="ev"
        label="次の予定"
        text={`${nextEvent.title}（${fmtEvent(nextEvent.starts_at)}）`}
        onClick={() => onNavigate?.('calendar')}
      />,
    )
  }

  // 「自分の部屋」トップの帯（高さ120px・背景はテーマの roomBg）。左=ようこそ窓、右=ニュース最大2。
  return (
    <div
      className="mb-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-100"
      style={{
        backgroundImage: 'var(--nb-room-bg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="flex h-[120px] items-stretch gap-2 p-2">
        <div className="flex shrink-0 flex-col justify-center rounded-lg bg-white/85 px-4 py-2 shadow-sm backdrop-blur-sm">
          <p className="text-[11px] text-stone-500">ようこそ</p>
          <p className="text-base font-bold leading-tight" style={{ color: 'var(--nb-navy)' }}>
            {userName || '入居者'}
            <span className="text-xs font-normal text-stone-500"> さん</span>
          </p>
          {roomNo != null && <p className="text-[11px] text-stone-400">{roomNo}号室</p>}
        </div>
        {news.length > 0 && (
          <div className="ml-auto flex min-w-0 items-stretch gap-2">
            {news.slice(0, 2).map((card, i) => (
              // 2つ目は狭い画面では隠す（最大2・中央〜右）
              <div key={i} className={i === 1 ? 'hidden sm:contents' : 'contents'}>
                {card}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NewsCard({
  label,
  labelColor,
  text,
  onClick,
}: {
  label: string
  labelColor?: string
  text: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-40 flex-col justify-center rounded-lg bg-white/85 px-3 py-2 text-left shadow-sm backdrop-blur-sm hover:bg-white sm:w-48"
    >
      <p className="text-[11px] font-semibold" style={{ color: labelColor ?? '#78716c' }}>
        {label}
      </p>
      <p className="truncate text-sm" style={{ color: 'var(--nb-ink)' }}>
        {text}
      </p>
    </button>
  )
}
