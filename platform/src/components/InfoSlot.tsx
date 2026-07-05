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
  avatar,
}: {
  onNavigate?: (view: InfoView) => void
  /** 速報！の各項目（道具公開）から、道具市の該当ガジェットへ飛ぶ */
  onOpenGadget?: (dir: string) => void
  /** 部屋トップの表示名・部屋番号・アイコン */
  userName?: string | null
  roomNo?: number | null
  avatar?: string | null
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

  // 「自分の部屋」トップの帯（高さ120px）。背景=roomBg のミラータイルを repeat-x で
  // ブラウザ幅いっぱいに（端から反転）。左=名前チップ（アイコン＋名前＋部屋番号）、
  // 右=ニュース最大2（縦に積む）。中身は本文と同じ中央カラム幅にそろえる。
  return (
    <div
      className="relative mb-4 h-[120px] overflow-hidden bg-stone-100"
      style={{
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        backgroundImage: 'var(--nb-room-bg)',
        backgroundRepeat: 'repeat-x',
        backgroundSize: 'auto 120px',
        backgroundPosition: 'center',
      }}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center gap-3 px-4">
        {/* 名前チップ（アイコン＋名前＋部屋番号）。横は内容の長さ、縦はコンパクト */}
        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-white text-lg text-stone-400">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : '🙂'}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
              {userName || '入居者'}
            </p>
            {roomNo != null && <p className="text-[11px] text-stone-400">{roomNo}号室</p>}
          </div>
        </div>
        {/* ニュース最大2（縦積み・中央〜右） */}
        {news.length > 0 && (
          <div className="ml-auto flex w-52 flex-col gap-1 sm:w-72">
            {news.slice(0, 2)}
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
      className="flex items-baseline gap-1.5 rounded-md bg-white/85 px-2.5 py-1 text-left shadow-sm backdrop-blur-sm hover:bg-white"
    >
      <span className="shrink-0 text-[10px] font-semibold" style={{ color: labelColor ?? '#78716c' }}>
        {label}
      </span>
      <span className="truncate text-xs" style={{ color: 'var(--nb-ink)' }}>
        {text}
      </span>
    </button>
  )
}
