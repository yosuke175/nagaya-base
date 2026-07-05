import { useEffect, useRef, useState } from 'react'
import { externalServiceBaseUrls } from 'gadget-sdk'
import { fetchCatalog, type CatalogEntry } from '../host/catalog'
import { PERMISSION_LABELS } from '../host/permissionLabels'
import { compressImageToDataUrl } from '../lib/imageCompress'
import { listPresentations, savePresentation, type GadgetPresentation } from '../host/gadgetPresentation'
import { listGadgetVisibility, workshopAvailable, type GadgetRecord } from '../host/workshop'

const COVER_MAX_DIM = 800
const COVER_MAX_BYTES = 150 * 1024

const STATUS_LABEL: Record<string, string> = {
  draft: '構築中',
  in_review: '審査中',
  suspended: '停止中',
}

interface CatalogViewProps {
  installed: string[]
  /** False for guests — catalog stays browsable but install is disabled. */
  canInstall: boolean
  /** 現在のユーザーID（道具の owner 判定用） */
  currentUserId: string | null
  isAdmin: boolean
  onInstall: (dir: string) => void
  onUninstall: (dir: string) => void
}

/** Gadget catalog (FR-03) with per-user install/uninstall (FR-04). */
export function CatalogView({
  installed,
  canInstall,
  currentUserId,
  isAdmin,
  onInstall,
  onUninstall,
}: CatalogViewProps) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presentations, setPresentations] = useState<Map<string, GadgetPresentation>>(new Map())
  const [records, setRecords] = useState<Map<string, GadgetRecord>>(new Map())
  const [recordsReady, setRecordsReady] = useState(false)

  const reloadOverrides = () => {
    void listPresentations().then(setPresentations)
    void listGadgetVisibility().then((map) => {
      setRecords(map)
      setRecordsReady(true)
    })
  }

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((list) => {
        if (!cancelled) setEntries(list)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })
    reloadOverrides()
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
  // カタログ本体（ファイル由来）と、表示可否を決める状態（DB由来）の両方が揃うまで待つ。
  // 揃う前に描くと、未登録の道具が一瞬みんなに見えてしまう（旧バグの再発）。
  if (!entries || !recordsReady) {
    return <p className="p-4 text-sm text-stone-400">読み込み中…</p>
  }

  const dbConfigured = workshopAvailable()

  const canManage = (dir: string) => {
    const rec = records.get(dir)
    return isAdmin || (!!currentUserId && !!rec && rec.owner_id === currentUserId)
  }
  // 道具市に出すのは「明示的に公開(published)された道具」だけ。
  //  - DB行があり published → 一般公開
  //  - DB行があるが未公開(draft/in_review/suspended) → owner と admin だけに見せる
  //  - DB行が無い（＝一度も登録・公開していない作りかけ）→ 本番では出さない（owner/admin のみ）。
  //    ただし Supabase 未設定のローカルdev では、確認用に全件見せる（DBが無いので判定できないため）。
  const isVisible = (dir: string) => {
    const rec = records.get(dir)
    if (rec) return rec.status === 'published' || canManage(dir)
    return !dbConfigured || canManage(dir)
  }

  // 職人（作者）別にグループ化して表示
  const visible = entries.filter((e) => isVisible(e.dir))
  const byAuthor = new Map<string, CatalogEntry[]>()
  for (const entry of visible) {
    const author = entry.manifest.author?.name || '（作者未設定）'
    byAuthor.set(author, [...(byAuthor.get(author) ?? []), entry])
  }

  if (visible.length === 0) {
    return <p className="p-4 text-sm text-stone-500">道具市に並んでいる道具は、まだありません。</p>
  }

  return (
    <div className="grid gap-6">
      {[...byAuthor.entries()].map(([author, group]) => (
        <section key={author}>
          <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-terra)' }}>
            職人: {author}
            <span className="ml-2 text-xs font-normal text-stone-400">{group.length}点</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.map((entry) => (
              <CatalogCard
                key={entry.dir}
                entry={entry}
                installed={installed.includes(entry.dir)}
                canInstall={canInstall}
                presentation={presentations.get(entry.dir)}
                statusLabel={
                  records.get(entry.dir) && records.get(entry.dir)!.status !== 'published'
                    ? (STATUS_LABEL[records.get(entry.dir)!.status] ?? records.get(entry.dir)!.status)
                    : null
                }
                canEdit={canManage(entry.dir)}
                onEdited={reloadOverrides}
                onInstall={onInstall}
                onUninstall={onUninstall}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CatalogCard({
  entry,
  installed,
  canInstall,
  presentation,
  statusLabel,
  canEdit,
  onEdited,
  onInstall,
  onUninstall,
}: {
  entry: CatalogEntry
  installed: boolean
  canInstall: boolean
  presentation?: GadgetPresentation
  statusLabel: string | null
  canEdit: boolean
  onEdited: () => void
  onInstall: (dir: string) => void
  onUninstall: (dir: string) => void
}) {
  const { manifest } = entry
  const services = manifest.externalServices ?? []
  const [editing, setEditing] = useState(false)

  // DB の上書き（フェーズ4）を manifest にマージして表示する
  const displayName = presentation?.display_name || manifest.name
  const description = presentation?.description || manifest.description
  const coverImage =
    presentation?.cover_image || (manifest.icon ? `/gadgets/${entry.dir}/${manifest.icon}` : null)

  // 画像読み込み失敗の管理。src が変わったらリセットする（onError で imperative に
  // display:none にすると、後から presentation の画像が来ても隠れたままになるため）。
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => setCoverFailed(false), [coverImage])

  if (editing) {
    return (
      <PresentationEditor
        gadgetId={entry.dir}
        initial={{
          display_name: presentation?.display_name ?? manifest.name,
          description: presentation?.description ?? manifest.description,
          cover_image: presentation?.cover_image ?? null,
        }}
        onDone={() => {
          setEditing(false)
          onEdited()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  // 将来「職人別の棚（この職人の道具一覧）」に拡張しやすいよう、
  // カード単位のコンポーネントを維持する（author 起点の絞り込みは未実装）
  return (
    <section className="nb-panel flex flex-col overflow-hidden">
      {coverImage && !coverFailed && (
        <img
          src={coverImage}
          alt=""
          className="h-36 w-full object-cover"
          // 画像ファイルが無い/壊れている場合はカードを崩さず隠す
          onError={() => setCoverFailed(true)}
        />
      )}
      <div className="flex flex-col p-4">
        <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--nb-navy)' }}>
          {statusLabel && (
            <span className="mr-1 rounded bg-stone-200 px-1.5 py-0.5 text-xs font-normal text-stone-600">
              {statusLabel}
            </span>
          )}
          {displayName}
        </h2>
        <span className="text-xs text-stone-400">v{manifest.version}</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">作者: {manifest.author.name}</p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-stone-700">{description}</p>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 self-start rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
        >
          表示を編集
        </button>
      )}

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
              軒先（ゲスト）では棚に並べられません。入居（一般ユーザー登録）すると使えます。
            </p>
          </div>
        )}
        </div>
      </div>
    </section>
  )
}

/** 道具の表示（名前・説明・カバー画像）を GUI で編集（フェーズ4） */
function PresentationEditor({
  gadgetId,
  initial,
  onDone,
  onCancel,
}: {
  gadgetId: string
  initial: GadgetPresentation
  onDone: () => void
  onCancel: () => void
}) {
  const [displayName, setDisplayName] = useState(initial.display_name ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [cover, setCover] = useState<string | null>(initial.cover_image)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickCover = async (file: File) => {
    setError(null)
    try {
      const { dataUrl } = await compressImageToDataUrl(file, COVER_MAX_DIM, COVER_MAX_BYTES)
      setCover(dataUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await savePresentation(gadgetId, {
        display_name: displayName.trim() || null,
        description: description.trim() || null,
        cover_image: cover,
      })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <section className="nb-panel flex flex-col gap-2 p-4 text-sm">
      <p className="text-xs font-semibold text-stone-500">道具市での表示を編集: {gadgetId}</p>
      {cover && <img src={cover} alt="" className="h-32 w-full rounded-lg object-cover" />}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void pickCover(file)
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
        >
          カバー画像を選ぶ（軽い画像）
        </button>
        {cover && (
          <button type="button" onClick={() => setCover(null)} className="text-xs text-red-600 underline">
            画像を外す
          </button>
        )}
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-stone-600">表示名</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-stone-600">説明</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="btn-primary rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs">
          やめる
        </button>
      </div>
      <p className="text-xs text-stone-400">
        ここでの変更は manifest を書き換えず、道具市の表示だけを上書きします。画像は軽いものだけ保存できます。
      </p>
    </section>
  )
}
