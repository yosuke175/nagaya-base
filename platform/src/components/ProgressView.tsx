import { useEffect, useState } from 'react'
import {
  infoLayerAvailable,
  listFeed,
  listPublishedGadgets,
  type FeedItem,
  type PublishedGadget,
} from '../host/infoLayer'
import { listResidents } from '../host/residents'

// 長屋の歩み（指示書⑦-5）: 公開の記録を自動生成で淡々と見せる。
// ランキング化・競争煽りはしない（職人別の数字は五十音等でなく公開順のまま）。
// 各要素は押すと該当画面へ飛ぶ（道具→道具市 / 職人→その人のプロフ / 入居者→入居者一覧）。

interface ProgressViewProps {
  onNavigate?: (view: 'catalog' | 'residents') => void
  onOpenGadget?: (dir: string) => void
  onOpenResident?: (name: string) => void
}

export function ProgressView({ onNavigate, onOpenGadget, onOpenResident }: ProgressViewProps) {
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [gadgets, setGadgets] = useState<PublishedGadget[]>([])
  const [residentCount, setResidentCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listFeed(100), listPublishedGadgets(), listResidents().catch(() => [])])
      .then(([feedItems, published, residents]) => {
        setFeed(feedItems)
        setGadgets(published)
        setResidentCount(residents.length)
      })
      .catch((cause: Error) => setError(cause.message))
  }, [])

  if (!infoLayerAvailable()) {
    return <p className="p-4 text-sm text-stone-500">長屋の歩みはログイン環境でのみ表示されます。</p>
  }

  const now = new Date()
  const thisMonth = gadgets.filter((gadget) => {
    const created = new Date(gadget.created_at)
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
  }).length
  const byOwner = new Map<string, number>()
  for (const gadget of gadgets) {
    const key = gadget.ownerName ?? '（名無しの職人）'
    byOwner.set(key, (byOwner.get(key) ?? 0) + 1)
  }

  // タイムライン: フィードがまだ薄い初期は公開済み一覧で補完する。
  // dir（道具ID＝道具市の並び）を持たせ、押すと道具市の該当ガジェットへ飛ぶ。
  const timeline =
    feed && feed.length > 0
      ? feed.map((item) => ({
          key: `feed-${item.id}`,
          date: item.created_at,
          text: item.summary,
          dir: item.type === 'gadget_published' && item.target ? item.target : null,
        }))
      : gadgets
          .slice()
          .reverse()
          .map((gadget) => ({
            key: `gadget-${gadget.id}`,
            date: gadget.created_at,
            text: `${gadget.ownerName ?? '職人'}さんの「${gadget.name ?? gadget.id}」が公開されています`,
            dir: gadget.id,
          }))

  const statCard = (value: number | string, label: string, color: string, to?: 'catalog' | 'residents') => (
    <button
      type="button"
      onClick={() => to && onNavigate?.(to)}
      disabled={!to}
      className="nb-panel p-4 text-center enabled:hover:opacity-90"
    >
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-stone-500">{label}</p>
    </button>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        長屋の歩み
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statCard(gadgets.length, '公開中の道具', 'var(--nb-navy)', 'catalog')}
        {statCard(thisMonth, '今月の新着', 'var(--nb-terra)', 'catalog')}
        {statCard(residentCount ?? '—', '入居者総数', 'var(--nb-sage)', 'residents')}
      </div>

      {byOwner.size > 0 && (
        <div className="nb-panel mb-4 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold text-stone-500">職人べつの公開数</p>
          <ul className="grid gap-1">
            {[...byOwner.entries()].map(([name, count]) => (
              <li key={name}>
                {onOpenResident ? (
                  <button
                    type="button"
                    onClick={() => onOpenResident(name)}
                    className="text-left underline-offset-2 hover:underline"
                    title="この職人のプロフィールを見る"
                  >
                    {name} — {count}件
                  </button>
                ) : (
                  <span>
                    {name} — {count}件
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {feed === null && <p className="text-sm text-stone-400">読み込み中…</p>}
      <ol className="grid gap-2">
        {timeline.map((item) => {
          const dir = item.dir
          const date = (
            <span className="shrink-0 text-xs text-stone-400">
              {new Date(item.date).toLocaleDateString('ja-JP')}
            </span>
          )
          return dir && onOpenGadget ? (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onOpenGadget(dir)}
                className="nb-panel flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm hover:opacity-90"
                title="道具市でこの道具を見る"
              >
                {date}
                <span>{item.text}</span>
              </button>
            </li>
          ) : (
            <li key={item.key} className="nb-panel flex items-baseline gap-3 px-4 py-2 text-sm">
              {date}
              <span>{item.text}</span>
            </li>
          )
        })}
        {timeline.length === 0 && (
          <li className="nb-panel p-6 text-center text-sm text-stone-500">
            歩みはこれから。最初の一歩は、あなたの道具かもしれません。
          </li>
        )}
      </ol>
    </div>
  )
}
