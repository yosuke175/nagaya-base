import { useState } from 'react'
import { GadgetFrame } from './GadgetFrame'

// ADR-012 Phase 2: 作りかけガジェットの「部屋プレビュー」。
// GitHub の自分のリポジトリ(fork)に push した gadgets/<id>/ を、プラットフォーム自身の
// /preview/<owner>/<branch>/ 経由で本番同等のホスト（SDK/保存/AI/連携）で試運転する。
// まだ公開はされない（道具市に並ぶのは PR→マージ→公開の後）。

const LS_USER = 'nb.preview.ghUser'
const LS_BRANCH = 'nb.preview.branch'

const OWNER_OK = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const GADGET_OK = /^[a-z0-9-]{3,40}$/
const BRANCH_OK = /^[A-Za-z0-9._-]{1,255}$/

export function GadgetPreview() {
  const [ghUser, setGhUser] = useState(() => localStorage.getItem(LS_USER) ?? '')
  const [branch, setBranch] = useState(() => localStorage.getItem(LS_BRANCH) ?? 'main')
  const [gadgetId, setGadgetId] = useState('')
  const [open, setOpen] = useState(false)

  const canPreview = OWNER_OK.test(ghUser) && BRANCH_OK.test(branch) && GADGET_OK.test(gadgetId)

  const start = () => {
    localStorage.setItem(LS_USER, ghUser.trim())
    localStorage.setItem(LS_BRANCH, branch.trim())
    setOpen(true)
  }

  return (
    <div className="text-sm">
      <p className="text-xs leading-relaxed text-stone-600">
        GitHub の<strong>自分のリポジトリ（fork）に push 済み</strong>の作りかけを、この部屋で
        <strong>試運転</strong>できます（SDK・保存・AI・連携も本番と同じに動きます）。
        まだ公開はされません（道具市に並ぶのは PR→マージ→公開の後）。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-stone-500">
          GitHubユーザー名
          <input
            value={ghUser}
            onChange={(e) => setGhUser(e.target.value.trim())}
            placeholder="例: inoue-taro"
            spellCheck={false}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-stone-500">
          ブランチ
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value.trim())}
            placeholder="main"
            spellCheck={false}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-stone-500">
          道具のID
          <input
            value={gadgetId}
            onChange={(e) => setGadgetId(e.target.value.trim())}
            placeholder="例: my-first-gadget"
            spellCheck={false}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={start}
        disabled={!canPreview}
        className="btn-primary mt-3 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        この道具を部屋で試運転する
      </button>
      <p className="mt-1 text-xs text-stone-400">
        ※ クラウド/PCで編集したら、まず GitHub の自分のリポジトリに push してください。push した内容が試運転に反映されます。
      </p>

      {open && (
        <PreviewOverlay
          ghUser={ghUser.trim()}
          branch={branch.trim()}
          gadgetId={gadgetId.trim()}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function PreviewOverlay({
  ghUser,
  branch,
  gadgetId,
  onClose,
}: {
  ghUser: string
  branch: string
  gadgetId: string
  onClose: () => void
}) {
  const basePath = `/preview/${ghUser}/${branch}/`
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stone-900/40 p-3 sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <header
          className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2"
          style={{ backgroundColor: 'color-mix(in srgb, var(--nb-cream) 70%, white)' }}
        >
          <p className="min-w-0 truncate text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
            試運転中: {gadgetId}
            <span className="ml-2 text-xs font-normal text-stone-400">
              {ghUser}@{branch}・未公開
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-stone-200 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-50"
          >
            閉じる
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <GadgetFrame gadgetDir={gadgetId} basePath={basePath} floating />
        </div>
      </div>
    </div>
  )
}
