import { useEffect, useState } from 'react'
import { IMG } from '../assets'
import {
  infoLayerAvailable,
  listFeed,
  listPublishedGadgets,
  type FeedItem,
  type PublishedGadget,
} from '../host/infoLayer'

// 長屋の歩み（指示書⑦-5）: 公開の記録を自動生成で淡々と見せる。
// ランキング化・競争煽りはしない（職人別の数字は五十音等でなく公開順のまま）。

export function ProgressView() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null)
  const [gadgets, setGadgets] = useState<PublishedGadget[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listFeed(100), listPublishedGadgets()])
      .then(([feedItems, published]) => {
        setFeed(feedItems)
        setGadgets(published)
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

  // タイムライン: フィードがまだ薄い初期は公開済み一覧で補完する
  const timeline =
    feed && feed.length > 0
      ? feed.map((item) => ({
          key: `feed-${item.id}`,
          date: item.created_at,
          text: item.summary,
        }))
      : gadgets
          .slice()
          .reverse()
          .map((gadget) => ({
            key: `gadget-${gadget.id}`,
            date: gadget.created_at,
            text: `${gadget.ownerName ?? '職人'}さんの「${gadget.name ?? gadget.id}」が公開されています`,
          }))

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        長屋の歩み
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="nb-panel p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--nb-navy)' }}>
            {gadgets.length}
          </p>
          <p className="text-xs text-stone-500">公開中の道具</p>
        </div>
        <div className="nb-panel p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--nb-terra)' }}>
            {thisMonth}
          </p>
          <p className="text-xs text-stone-500">今月の新着</p>
        </div>
        <div className="nb-panel hidden p-4 text-center sm:block">
          <img src={IMG.objects.riceBarrel} alt="" className="mx-auto h-12 w-12 object-contain" />
          <p className="text-xs text-stone-500">こつこつ貯まる</p>
        </div>
      </div>

      {byOwner.size > 0 && (
        <div className="nb-panel mb-4 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold text-stone-500">職人べつの公開数</p>
          <ul className="grid gap-1">
            {[...byOwner.entries()].map(([name, count]) => (
              <li key={name}>
                {name} — {count}件
              </li>
            ))}
          </ul>
        </div>
      )}

      {feed === null && <p className="text-sm text-stone-400">読み込み中…</p>}
      <ol className="grid gap-2">
        {timeline.map((item) => (
          <li key={item.key} className="nb-panel flex items-baseline gap-3 px-4 py-2 text-sm">
            <span className="shrink-0 text-xs text-stone-400">
              {new Date(item.date).toLocaleDateString('ja-JP')}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
        {timeline.length === 0 && (
          <li className="nb-panel p-6 text-center text-sm text-stone-500">
            歩みはこれから。最初の一歩は、あなたの道具かもしれません。
          </li>
        )}
      </ol>
    </div>
  )
}
