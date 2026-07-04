import { useEffect, useState } from 'react'
import {
  createAnnouncement,
  deleteAnnouncement,
  infoLayerAvailable,
  listAnnouncements,
  type Announcement,
} from '../host/infoLayer'
import { renderMarkdown } from '../lib/markdown'

// 回覧板（指示書⑦-1）: 大家（admin）→ 全体の一方向告知。店子・職人は閲覧のみ。
// 入居者どうしのコメント・リアクションは設計原則により作らない。

export function AnnouncementsView({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [importance, setImportance] = useState<'normal' | 'important'>('normal')

  const reload = () => {
    listAnnouncements()
      .then(setItems)
      .catch((cause: Error) => setError(cause.message))
  }
  useEffect(reload, [])

  if (!infoLayerAvailable()) {
    return <p className="p-4 text-sm text-stone-500">回覧板はログイン環境でのみ表示されます。</p>
  }

  const submit = async () => {
    if (!title.trim() || !body.trim()) return
    try {
      await createAnnouncement({ title: title.trim(), body, importance })
      setTitle('')
      setBody('')
      setImportance('normal')
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        回覧板
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {isAdmin && (
        <div className="nb-panel mb-4 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold text-stone-500">大家の投稿（管理者のみ表示）</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="本文（Markdown可: # 見出し / - 箇条書き / **太字** / [リンク](https://…)）"
            rows={4}
            className="mb-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as 'normal' | 'important')}
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
            >
              <option value="normal">通常</option>
              <option value="important">重要</option>
            </select>
            <button
              type="button"
              onClick={() => void submit()}
              className="btn-primary rounded-lg px-4 py-1.5 text-xs font-medium"
            >
              回覧板に貼る
            </button>
          </div>
        </div>
      )}

      {items === null && <p className="text-sm text-stone-400">読み込み中…</p>}
      {items?.length === 0 && (
        <p className="nb-panel p-6 text-center text-sm text-stone-500">
          まだお知らせはありません。
        </p>
      )}
      <div className="grid gap-3">
        {items?.map((item) => (
          <article key={item.id} className="nb-panel p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
                {item.importance === 'important' && (
                  <span
                    className="mr-2 rounded px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--nb-terra)' }}
                  >
                    重要
                  </span>
                )}
                {item.title}
              </h3>
              <span className="shrink-0 text-xs text-stone-400">
                {new Date(item.created_at).toLocaleDateString('ja-JP')}
              </span>
            </div>
            <div
              className="prose-sm mt-2 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }}
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  void deleteAnnouncement(item.id).then(reload).catch((cause: Error) => setError(cause.message))
                }}
                className="mt-2 text-xs text-red-600 underline"
              >
                削除
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
