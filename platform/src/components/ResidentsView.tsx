import { useEffect, useState } from 'react'
import { listResidents, residentsAvailable, type ResidentEntry } from '../host/residents'

// 入居者一覧（フェーズ2）。部屋番号順。各自が「見せる」にした項目だけ表示
// （非公開項目は list_residents() がサーバー側で除外して返す）。

export function ResidentsView() {
  const [residents, setResidents] = useState<ResidentEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!residentsAvailable()) return
    listResidents()
      .then(setResidents)
      .catch((cause: Error) => setError(cause.message))
  }, [])

  if (!residentsAvailable()) {
    return <p className="p-4 text-sm text-stone-500">入居者一覧はログイン環境でのみ表示されます。</p>
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        入居者一覧
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {residents === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}
      {residents?.length === 0 && (
        <p className="nb-panel p-6 text-center text-sm text-stone-500">まだ入居者がいません。</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {residents?.map((resident) => (
          <article key={resident.room_no ?? resident.display_name} className="nb-panel flex gap-3 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-white text-xl text-stone-400">
              {resident.avatar ? (
                <img src={resident.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                '🙂'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                {resident.room_no != null && (
                  <span className="shrink-0 text-xs text-stone-400">{resident.room_no}号室</span>
                )}
                <h3 className="truncate text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
                  {resident.display_name}
                </h3>
              </div>
              {resident.bio && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-stone-600">{resident.bio}</p>
              )}
              {resident.links && Object.keys(resident.links).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {Object.entries(resident.links).map(([label, url]) => (
                    <a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                      style={{ color: 'var(--nb-terra)' }}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
