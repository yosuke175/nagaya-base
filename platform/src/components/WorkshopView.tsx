import { useEffect, useState } from 'react'
import { fetchCatalog, type CatalogEntry } from '../host/catalog'
import { appConfig } from '../config'
import { AiSettingsPanel } from './AiSettingsDialog'
import {
  listMyGadgets,
  registerGadget,
  setGadgetStatus,
  workshopAvailable,
  type GadgetRecord,
} from '../host/workshop'

// 工房（職人の作業場）。道具づくりの入口＋「あなたの道具」の管理。
//  - 構築中(draft) / 公開(published) の切り替え（公開すると道具市に並ぶ）
//  - 道具市の道具を「自分の道具」として登録（owner を自分に）
// カード画像・表示文の編集は道具市の「表示を編集」から。

const STATUS_LABEL: Record<string, string> = {
  draft: '構築中',
  in_review: '審査中',
  published: '公開中',
  suspended: '停止中',
}

export function WorkshopView({
  userId,
  onOpenHelp,
}: {
  userId: string | null
  onOpenHelp: () => void
}) {
  const [mine, setMine] = useState<GadgetRecord[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const releasesUrl = `${appConfig.repoUrl}/releases`

  const reload = () => {
    if (!userId) return
    listMyGadgets(userId)
      .then(setMine)
      .catch((cause: Error) => setError(cause.message))
    void fetchCatalog().then(setCatalog).catch(() => setCatalog([]))
  }
  useEffect(reload, [userId])

  if (!workshopAvailable()) {
    return <p className="p-4 text-sm text-stone-500">工房はログイン環境でのみ利用できます。</p>
  }

  const mineIds = new Set((mine ?? []).map((g) => g.id))
  const unregistered = catalog.filter((e) => !mineIds.has(e.dir))

  const changeStatus = async (id: string, status: 'draft' | 'published') => {
    setError(null)
    try {
      await setGadgetStatus(id, status)
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const register = async (dir: string, name: string) => {
    if (!userId) return
    setError(null)
    try {
      await registerGadget(dir, name, userId)
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
        工房（あなたの作業場）
      </h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {/* つくる：入口 */}
      <div className="nb-panel mb-4 p-5 text-sm">
        <h3 className="font-bold" style={{ color: 'var(--nb-navy)' }}>
          道具をつくる
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          道具づくりは AI にまかせるのがいちばん簡単です（Claude Code など）。
          セットアップウィザードで雛形を用意し、AIに読ませて会話しながら作れます。
          くわしくは案内所の「道具の作り方」を。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={releasesUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--nb-terra)' }}
          >
            セットアップウィザードを入手
          </a>
        </div>
      </div>

      {/* あなたの道具 */}
      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
        あなたの道具
      </h3>
      {mine === null && !error && <p className="text-sm text-stone-400">読み込み中…</p>}
      {mine?.length === 0 && (
        <p className="nb-panel mb-4 p-5 text-center text-xs text-stone-500">
          まだ登録した道具がありません。下から、道具市の道具を「自分の道具」として登録できます。
        </p>
      )}
      <div className="mb-6 grid gap-2">
        {mine?.map((gadget) => (
          <div key={gadget.id} className="nb-panel flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" style={{ color: 'var(--nb-navy)' }}>
                {gadget.name ?? gadget.id}
              </p>
              <p className="text-xs text-stone-400">
                {gadget.id} ・{' '}
                <span
                  style={{
                    color: gadget.status === 'published' ? 'var(--nb-sage)' : 'var(--nb-terra)',
                  }}
                >
                  {STATUS_LABEL[gadget.status] ?? gadget.status}
                </span>
              </p>
            </div>
            {gadget.status === 'published' ? (
              <button
                type="button"
                onClick={() => void changeStatus(gadget.id, 'draft')}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
              >
                非公開にする
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void changeStatus(gadget.id, 'published')}
                className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                道具市に公開する
              </button>
            )}
          </div>
        ))}
      </div>
      {(mine?.length ?? 0) > 0 && (
        <p className="mb-6 -mt-4 text-xs text-stone-400">
          カード画像・表示文の編集は「道具市」の各カードの「表示を編集」から行えます。
        </p>
      )}

      {/* AI設定（道具でAIを使うためのキー登録）。あなたの道具の下に配置 */}
      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
        AI設定
      </h3>
      <div className="nb-panel mb-6 p-5">
        <AiSettingsPanel onOpenHelp={onOpenHelp} />
      </div>

      {/* 道具市の道具を自分のものとして登録 */}
      {unregistered.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
            道具市の道具を「自分の道具」として登録
          </h3>
          <p className="mb-2 text-xs text-stone-500">
            あなたが作った道具を選んで登録すると、公開状態や表示を管理できます。
          </p>
          <div className="grid gap-2">
            {unregistered.map((entry) => (
              <div key={entry.dir} className="nb-panel flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{entry.manifest.name}</p>
                  <p className="text-xs text-stone-400">
                    {entry.dir} ・ 作者: {entry.manifest.author?.name ?? '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void register(entry.dir, entry.manifest.name)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
                >
                  自分の道具として登録
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
