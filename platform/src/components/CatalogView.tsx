import { useEffect, useState } from 'react'
import { externalServiceBaseUrls } from 'gadget-sdk'
import { fetchCatalog, type CatalogEntry } from '../host/catalog'
import { PERMISSION_LABELS } from '../host/permissionLabels'

interface CatalogViewProps {
  installed: string[]
  /** False for guests — catalog stays browsable but install is disabled. */
  canInstall: boolean
  onInstall: (dir: string) => void
  onUninstall: (dir: string) => void
}

/** Gadget catalog (FR-03) with per-user install/uninstall (FR-04). */
export function CatalogView({ installed, canInstall, onInstall, onUninstall }: CatalogViewProps) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((list) => {
        if (!cancelled) setEntries(list)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        カタログを読み込めませんでした: {error}
      </p>
    )
  }
  if (!entries) {
    return <p className="p-4 text-sm text-stone-400">読み込み中…</p>
  }
  if (entries.length === 0) {
    return (
      <p className="p-4 text-sm text-stone-500">
        道具市に並んでいる道具は、まだありません。
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {entries.map((entry) => (
        <CatalogCard
          key={entry.dir}
          entry={entry}
          installed={installed.includes(entry.dir)}
          canInstall={canInstall}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />
      ))}
    </div>
  )
}

function CatalogCard({
  entry,
  installed,
  canInstall,
  onInstall,
  onUninstall,
}: {
  entry: CatalogEntry
  installed: boolean
  canInstall: boolean
  onInstall: (dir: string) => void
  onUninstall: (dir: string) => void
}) {
  const { manifest } = entry
  const services = manifest.externalServices ?? []

  // 将来「職人別の棚（この職人の道具一覧）」に拡張しやすいよう、
  // カード単位のコンポーネントを維持する（author 起点の絞り込みは未実装）
  return (
    <section className="nb-panel flex flex-col p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--nb-navy)' }}>
          {manifest.name}
        </h2>
        <span className="text-xs text-stone-400">v{manifest.version}</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">作者: {manifest.author.name}</p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-stone-700">{manifest.description}</p>

      <div className="mt-3 text-xs text-stone-600">
        <h3 className="font-semibold">必要な権限</h3>
        {manifest.permissions.length > 0 ? (
          <ul className="list-disc pl-4">
            {manifest.permissions.map((permission) => (
              <li key={permission}>{PERMISSION_LABELS[permission] ?? permission}</li>
            ))}
          </ul>
        ) : (
          <p>なし</p>
        )}
        {services.length > 0 && (
          <>
            <h3 className="mt-2 font-semibold">外部サービス連携（あなた自身のキーで接続）</h3>
            <ul className="list-disc pl-4">
              {services.map((service) => (
                <li key={service.id}>
                  {service.name}（{externalServiceBaseUrls(service).join(', ')}）
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-3">
        {installed ? (
          <button
            type="button"
            onClick={() => onUninstall(entry.dir)}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
          >
            アンインストール
          </button>
        ) : canInstall ? (
          <button
            type="button"
            onClick={() => onInstall(entry.dir)}
            className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            インストール
          </button>
        ) : (
          <div>
            <button
              type="button"
              disabled
              className="cursor-default rounded-lg bg-stone-300 px-3 py-1.5 text-xs font-medium text-white"
            >
              インストール
            </button>
            <p className="mt-1 text-xs text-stone-400">
              インストールには user ロール以上が必要です（管理者がロールを付与します）
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
