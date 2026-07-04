import { useEffect, useState } from 'react'
import { roleAtLeast } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { AiSettingsDialog } from './components/AiSettingsDialog'
import { CatalogView } from './components/CatalogView'
import { CraftsmanGuide, EntranceScreen, type EntranceChoice } from './components/EntranceScreen'
import { ThemePicker } from './components/ThemePicker'
import { GadgetFrame } from './components/GadgetFrame'
import { LoginView } from './components/LoginView'
import { appConfig } from './config'
import { installGadget, listInstallations, uninstallGadget } from './host/installations'
import { InfoSlot } from './components/InfoSlot'
import { TutorialOverlay } from './components/TutorialOverlay'
import { IMG } from './assets'
import { loadUserSettings, saveUserSettings, type UserSettings } from './host/userSettings'

type View = 'dashboard' | 'catalog'
/** Full-screen guidance overlays (entrance branch is behavioral only) */
type Overlay = 'entrance' | 'craftsman-guide' | 'tutorial' | null

export default function App() {
  const auth = useAuth()
  const [view, setView] = useState<View>('dashboard')
  const [installed, setInstalled] = useState<string[]>([])
  const [storeError, setStoreError] = useState<string | null>(null)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)

  const refreshInstalled = async () => {
    try {
      setInstalled(await listInstallations())
      setStoreError(null)
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : String(error))
    }
  }

  // (Re)load installations once the auth state is settled — from Supabase
  // when signed in, from the local mock in no-login dev mode.
  useEffect(() => {
    if (auth.status === 'signed-in' || auth.status === 'disabled') {
      void refreshInstalled()
      // 初回アクセス（入口が未選択）なら入口分岐を全画面表示
      void loadUserSettings()
        .then((loaded) => {
          setSettings(loaded)
          if (!loaded.entrance) setOverlay('entrance')
        })
        .catch(() => setSettings({}))
    } else {
      setInstalled([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status])

  const handleEntranceSelect = (choice: EntranceChoice) => {
    setOverlay(choice === 'craftsman' ? 'craftsman-guide' : 'tutorial')
    void saveUserSettings({ entrance: choice })
      .then(setSettings)
      .catch((error) => setStoreError(error instanceof Error ? error.message : String(error)))
  }

  const handleTutorialFinish = () => {
    setOverlay(null)
    void saveUserSettings({ tutorialDone: true })
      .then(setSettings)
      .catch((error) => setStoreError(error instanceof Error ? error.message : String(error)))
  }

  const handleInstall = async (dir: string) => {
    try {
      await installGadget(dir)
      await refreshInstalled()
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : String(error))
    }
  }
  const handleUninstall = async (dir: string) => {
    try {
      await uninstallGadget(dir)
      await refreshInstalled()
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : String(error))
    }
  }

  // UI-side gate only — RLS enforces the same rule server-side (ADR-003)
  const canInstall =
    auth.status === 'disabled' ||
    (auth.profile !== null && roleAtLeast(auth.profile.role, 'user'))

  return (
    <div className="nb-washi min-h-screen" style={{ color: 'var(--nb-ink)' }}>
      <header
        className="accent-topbar border-b border-stone-200 px-4 py-3 shadow-sm"
        style={{ backgroundColor: 'color-mix(in srgb, var(--nb-cream) 80%, white)' }}
      >
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
              {appConfig.appName}
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-normal text-amber-800">
                仮称
              </span>
            </h1>
            <p className="text-xs text-stone-500">
              {auth.status === 'disabled'
                ? 'Phase 1・ログインなしローカル開発モード'
                : 'Phase 1'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {auth.status === 'signed-in' && (
              <span className="flex items-center gap-2 text-xs text-stone-600">
                <span>
                  {auth.profile?.displayName ?? auth.email}
                  <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">
                    {auth.profile?.role ?? '…'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="rounded border border-stone-200 px-2 py-1 text-stone-500 hover:bg-stone-50"
                >
                  ログアウト
                </button>
              </span>
            )}
            {/* ナビは項目が後から増える（指示書⑦で 回覧板/長屋暦/案内所/歩み を追加） */}
            {(auth.status === 'signed-in' || auth.status === 'disabled') && (
              <nav className="flex gap-1 text-sm">
                <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>
                  棚
                </TabButton>
                <TabButton active={view === 'catalog'} onClick={() => setView('catalog')}>
                  道具市
                </TabButton>
              </nav>
            )}
            {(auth.status === 'signed-in' || auth.status === 'disabled') && (
              <GuideMenu entrance={settings?.entrance} onOpen={(next) => setOverlay(next)} />
            )}
            <button
              type="button"
              onClick={() => setAiSettingsOpen(true)}
              className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
            >
              AI設定
            </button>
            <ThemePicker />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        {storeError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {storeError}
          </p>
        )}
        {auth.status === 'loading' && (
          <p className="p-8 text-center text-sm text-stone-400">読み込み中…</p>
        )}
        {auth.status === 'signed-out' && <LoginView onSubmit={auth.signInWithMagicLink} />}
        {(auth.status === 'signed-in' || auth.status === 'disabled') &&
          (view === 'dashboard' ? (
            <Dashboard installed={installed} onOpenCatalog={() => setView('catalog')} />
          ) : (
            <CatalogView
              installed={installed}
              canInstall={canInstall}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
            />
          ))}
      </main>
      {aiSettingsOpen && <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} />}
      {overlay === 'entrance' && <EntranceScreen onSelect={handleEntranceSelect} />}
      {overlay === 'craftsman-guide' && <CraftsmanGuide onClose={() => setOverlay(null)} />}
      {overlay === 'tutorial' && (
        <TutorialOverlay
          onFinish={handleTutorialFinish}
          onOpenCatalog={() => setView('catalog')}
          onOpenDashboard={() => setView('dashboard')}
        />
      )}
    </div>
  )
}

/** メニュー「案内」— 入口・各はじめ方をいつでもやり直せる入口 */
function GuideMenu({
  entrance,
  onOpen,
}: {
  entrance: UserSettings['entrance']
  onOpen: (overlay: Overlay) => void
}) {
  const [open, setOpen] = useState(false)
  const pick = (next: Overlay) => {
    setOpen(false)
    onOpen(next)
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
      >
        案内
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-stone-200 bg-white p-2 text-xs shadow-lg">
          <button
            type="button"
            onClick={() => pick('entrance')}
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50"
          >
            入口からやり直す（職人/店子）
            {entrance && (
              <span className="ml-1 text-stone-400">
                現在: {entrance === 'craftsman' ? '職人' : '店子'}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => pick('craftsman-guide')}
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50"
          >
            職人のはじめ方（ウィザード案内）
          </button>
          <button
            type="button"
            onClick={() => pick('tutorial')}
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50"
          >
            店子のはじめ方（チュートリアル）
          </button>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        active ? 'btn-primary' : 'text-stone-600 hover:bg-stone-100'
      }`}
    >
      {children}
    </button>
  )
}

/** Installed gadgets laid out on a grid (FR-05). */
function Dashboard({
  installed,
  onOpenCatalog,
}: {
  installed: string[]
  onOpenCatalog: () => void
}) {
  // `npm run dev:gadget <dir>` pins the dashboard to one gadget for development
  if (appConfig.devGadgetDir) {
    return (
      <>
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          開発モード: gadgets/{appConfig.devGadgetDir} を表示中（npm run dev:gadget）
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GadgetFrame gadgetDir={appConfig.devGadgetDir} />
        </div>
      </>
    )
  }

  if (installed.length === 0) {
    return (
      <>
        <InfoSlot />
        <div className="nb-panel p-10 text-center text-sm">
          <img src={IMG.objects.well} alt="" className="mx-auto h-24 w-24 object-contain" />
          <p className="mt-3" style={{ color: 'var(--nb-ink)' }}>
            あなたの棚には、まだ道具が並んでいません。
          </p>
          <p className="mt-1 text-xs text-stone-500">
            道具市から選んで、自分の棚を組みましょう。
          </p>
          <button
            type="button"
            onClick={onOpenCatalog}
            className="btn-primary mt-4 rounded-lg px-4 py-2 text-xs font-medium"
          >
            道具市へ
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <InfoSlot />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {installed.map((dir) => (
          <GadgetFrame key={dir} gadgetDir={dir} />
        ))}
      </div>
    </>
  )
}
