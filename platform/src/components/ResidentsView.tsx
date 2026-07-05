import { useEffect, useState } from 'react'
import {
  listResidentGadgets,
  listResidents,
  residentsAvailable,
  type ResidentEntry,
  type ResidentGadget,
} from '../host/residents'

// 入居者一覧（フェーズ2）。部屋番号順。各自が「見せる」にした項目だけ表示
// （非公開項目は list_residents() がサーバー側で除外して返す）。
// カードをクリックすると紹介画面（作った道具／入れている道具）を表示する。

interface ResidentsViewProps {
  /** 自分が部屋に入れている道具（インストール済み判定用） */
  installed: string[]
  /** 軒先（ゲスト）は false。インストール導線を出さない */
  canInstall: boolean
  onInstall: (dir: string) => void
  /** 道具名クリックで道具市の該当ガジェットへ */
  onOpenGadget?: (dir: string) => void
}

export function ResidentsView({ installed, canInstall, onInstall, onOpenGadget }: ResidentsViewProps) {
  const [residents, setResidents] = useState<ResidentEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ResidentEntry | null>(null)

  useEffect(() => {
    if (!residentsAvailable()) return
    listResidents()
      .then(setResidents)
      .catch((cause: Error) => setError(cause.message))
  }, [])

  if (!residentsAvailable()) {
    return <p className="p-4 text-sm text-stone-500">入居者一覧はログイン環境でのみ表示されます。</p>
  }

  if (selected) {
    return (
      <ResidentDetail
        resident={selected}
        installed={installed}
        canInstall={canInstall}
        onInstall={onInstall}
        onOpenGadget={onOpenGadget}
        onBack={() => setSelected(null)}
      />
    )
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
          <button
            key={resident.room_no ?? resident.display_name}
            type="button"
            onClick={() => setSelected(resident)}
            className="nb-panel flex gap-3 p-4 text-left hover:opacity-90"
            title="紹介を見る"
          >
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
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-stone-600">
                  {resident.bio}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 入居者の紹介画面: プロフィール＋作った道具／入れている道具。未インストールは導線付き。 */
function ResidentDetail({
  resident,
  installed,
  canInstall,
  onInstall,
  onOpenGadget,
  onBack,
}: {
  resident: ResidentEntry
  installed: string[]
  canInstall: boolean
  onInstall: (dir: string) => void
  onOpenGadget?: (dir: string) => void
  onBack: () => void
}) {
  const [gadgets, setGadgets] = useState<ResidentGadget[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (resident.room_no == null) {
      setGadgets([])
      return
    }
    listResidentGadgets(resident.room_no)
      .then(setGadgets)
      .catch((cause: Error) => setError(cause.message))
  }, [resident.room_no])

  const developed = (gadgets ?? []).filter((g) => g.kind === 'developed')
  const installedByThem = (gadgets ?? []).filter((g) => g.kind === 'installed')

  return (
    <div className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-50"
      >
        ← 入居者一覧へ
      </button>

      <div className="nb-panel mb-4 flex gap-4 p-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-white text-2xl text-stone-400">
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
            <h2 className="truncate text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
              {resident.display_name}
            </h2>
          </div>
          {resident.bio && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{resident.bio}</p>
          )}
          {resident.links && Object.keys(resident.links).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {gadgets === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}

      <GadgetGroup
        title="作った道具"
        empty="公開中の道具はまだありません。"
        gadgets={developed}
        installed={installed}
        canInstall={canInstall}
        onInstall={onInstall}
        onOpenGadget={onOpenGadget}
      />
      <GadgetGroup
        title="部屋に入れている道具"
        empty="公開中の道具はまだありません。"
        gadgets={installedByThem}
        installed={installed}
        canInstall={canInstall}
        onInstall={onInstall}
        onOpenGadget={onOpenGadget}
      />
    </div>
  )
}

function GadgetGroup({
  title,
  empty,
  gadgets,
  installed,
  canInstall,
  onInstall,
  onOpenGadget,
}: {
  title: string
  empty: string
  gadgets: ResidentGadget[]
  installed: string[]
  canInstall: boolean
  onInstall: (dir: string) => void
  onOpenGadget?: (dir: string) => void
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-terra)' }}>
        {title}
        <span className="ml-2 text-xs font-normal text-stone-400">{gadgets.length}点</span>
      </h3>
      {gadgets.length === 0 ? (
        <p className="nb-panel p-4 text-center text-xs text-stone-500">{empty}</p>
      ) : (
        <div className="grid gap-2">
          {gadgets.map((gadget) => {
            const already = installed.includes(gadget.gadget_id)
            return (
              <div key={gadget.gadget_id} className="nb-panel flex items-center gap-3 p-3 text-sm">
                {onOpenGadget ? (
                  <button
                    type="button"
                    onClick={() => onOpenGadget(gadget.gadget_id)}
                    className="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:underline"
                    style={{ color: 'var(--nb-navy)' }}
                    title="道具市でこの道具を見る"
                  >
                    {gadget.name ?? gadget.gadget_id}
                  </button>
                ) : (
                  <p className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--nb-navy)' }}>
                    {gadget.name ?? gadget.gadget_id}
                  </p>
                )}
                {already ? (
                  <span className="shrink-0 text-xs text-stone-400">導入済み</span>
                ) : canInstall ? (
                  <button
                    type="button"
                    onClick={() => onInstall(gadget.gadget_id)}
                    className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    自分の部屋にインストール
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
