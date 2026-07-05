import { useEffect, useState } from 'react'
import { fetchCatalog, type CatalogEntry } from '../host/catalog'
import { AiSettingsPanel } from './AiSettingsDialog'
import { WizardDownloadButton, WizardWarningNote } from './WizardDownload'
import {
  GADGET_IDEAS,
  duplicateToolPrompt,
  improveToolPrompt,
  newToolPrompt,
} from '../host/toolPrompts'
import {
  listMyGadgets,
  registerGadget,
  setGadgetStatus,
  workshopAvailable,
  type GadgetRecord,
} from '../host/workshop'

// 工房（職人の作業場）。道具づくり（お題＋AI指示文）＋「あなたの道具」の管理。
//  - 道具づくりは AI指示文の案内（工房はWebなのでローカルにファイルは作れない。実作成は
//    PCのリポジトリで Claude Code 等にこの指示文を貼って進める）
//  - 構築中(draft) / 公開(published) の切り替え（公開すると道具市に並ぶ）
//  - 各道具に「改善する / 複製して新規」（＝AI指示文）
//  - 道具市の道具を「自分の道具」として登録（owner を自分に）
// カード画像・表示文の編集は道具市の「表示を編集」から。

const STATUS_LABEL: Record<string, string> = {
  draft: '構築中',
  in_review: '審査中',
  published: '公開中',
  suspended: '停止中',
}

// AI指示文を表示してコピーさせる箱（工房→PCのリポジトリへ橋渡し）。
function PromptBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => setCopied(false), [text])
  return (
    <div className="mt-2">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-900 p-3 text-xs leading-relaxed text-stone-100">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
        }}
        className="btn-primary mt-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
      >
        {copied ? 'コピーしました' : '指示文をコピー'}
      </button>
      <p className="mt-1 text-xs text-stone-400">
        この指示文をコピーして、PCのリポジトリで Claude Code 等に貼り付けて進めます（工房はWeb
        なので、実際のファイル作成・改修はPC側で行います）。
      </p>
    </div>
  )
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
  // 道具づくり（新規）
  const [newIdea, setNewIdea] = useState('')
  const [newIdeaKey, setNewIdeaKey] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  // 各道具の「改善/複製」指示文パネルの開閉
  const [openTool, setOpenTool] = useState<{ id: string; mode: 'improve' | 'duplicate' } | null>(null)
  const [dupId, setDupId] = useState('')

  const chooseIdea = (idea: (typeof GADGET_IDEAS)[number]) => {
    setNewIdeaKey(idea.key)
    setNewIdea(idea.idea)
    if (!newId.trim()) setNewId(idea.key === 'blank' ? 'my-first-gadget' : idea.key)
  }
  const toggleTool = (id: string, mode: 'improve' | 'duplicate') => {
    setOpenTool((prev) => (prev && prev.id === id && prev.mode === mode ? null : { id, mode }))
    setDupId('')
  }

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
        <div className="mt-3">
          <WizardDownloadButton />
          <WizardWarningNote />
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
          <div key={gadget.id} className="nb-panel p-3 text-sm">
            <div className="flex items-center gap-3">
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
                  className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-xs"
                >
                  非公開にする
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void changeStatus(gadget.id, 'published')}
                  className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  道具市に公開する
                </button>
              )}
            </div>
            {/* この道具を土台に、AIと一緒に手を入れる（指示文を出す） */}
            <div className="mt-2 flex flex-wrap gap-2 border-t border-stone-100 pt-2">
              <button
                type="button"
                onClick={() => toggleTool(gadget.id, 'improve')}
                className={`rounded-lg border px-3 py-1 text-xs ${
                  openTool?.id === gadget.id && openTool.mode === 'improve'
                    ? 'border-stone-400 bg-stone-100'
                    : 'border-stone-300 hover:bg-stone-50'
                }`}
              >
                改善する
              </button>
              <button
                type="button"
                onClick={() => toggleTool(gadget.id, 'duplicate')}
                className={`rounded-lg border px-3 py-1 text-xs ${
                  openTool?.id === gadget.id && openTool.mode === 'duplicate'
                    ? 'border-stone-400 bg-stone-100'
                    : 'border-stone-300 hover:bg-stone-50'
                }`}
              >
                複製して新規
              </button>
            </div>
            {openTool?.id === gadget.id && (
              <div>
                {openTool.mode === 'duplicate' && (
                  <label className="mt-2 block text-xs text-stone-500">
                    新しい道具のID（半角英小文字・数字・ハイフン）
                    <input
                      value={dupId}
                      onChange={(e) => setDupId(e.target.value)}
                      placeholder={`${gadget.id}-2`}
                      spellCheck={false}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
                    />
                  </label>
                )}
                <PromptBox
                  text={
                    openTool.mode === 'improve'
                      ? improveToolPrompt(gadget.id)
                      : duplicateToolPrompt(gadget.id, dupId.trim())
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {(mine?.length ?? 0) > 0 && (
        <p className="mb-6 -mt-4 text-xs text-stone-400">
          カード画像・表示文の編集は「道具市」の各カードの「表示を編集」から行えます。
        </p>
      )}

      {/* 新しい道具をつくる（お題→AI指示文）。あなたの道具とAI設定の間に配置 */}
      <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--nb-navy)' }}>
        新しい道具をつくる
      </h3>
      <div className="nb-panel mb-6 p-5 text-sm">
        <p className="text-xs leading-relaxed text-stone-600">
          お題を選ぶと、AIへの指示文ができます。道具づくりは AI にまかせるのがいちばん簡単です
          （Claude Code など）。まず雛形を複製して、会話しながら作り込みます。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GADGET_IDEAS.map((idea) => (
            <button
              key={idea.key}
              type="button"
              onClick={() => chooseIdea(idea)}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs ${
                newIdeaKey === idea.key
                  ? 'border-2 border-[var(--nb-terra)] bg-[color:color-mix(in_srgb,var(--nb-terra)_8%,white)]'
                  : 'border-stone-300 hover:bg-stone-50'
              }`}
            >
              <span className="block font-bold" style={{ color: 'var(--nb-navy)' }}>
                {idea.name}
              </span>
              <span className="block text-[11px] text-stone-500">{idea.desc}</span>
            </button>
          ))}
        </div>
        {newIdeaKey !== null && (
          <>
            <label className="mt-3 block text-xs text-stone-500">
              道具のID（半角英小文字・数字・ハイフン、3〜40文字）
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="例: my-first-gadget"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
              />
            </label>
            <PromptBox text={newToolPrompt(newId.trim(), newIdea)} />
          </>
        )}
      </div>

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
