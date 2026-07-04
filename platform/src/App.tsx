import { useEffect, useRef, useState } from 'react'
import { roleAtLeast } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { CatalogView } from './components/CatalogView'
import { CraftsmanGuide, EntranceScreen, type EntranceChoice } from './components/EntranceScreen'
import { FloatingWindow } from './components/FloatingWindow'
import { GadgetFrame } from './components/GadgetFrame'
import { GuideAssistant } from './components/GuideAssistant'
import { clearLayouts, loadLayouts, saveLayout, type WinRect } from './host/gadgetLayout'
import { LoginView } from './components/LoginView'
import { appConfig } from './config'
import { installGadget, listInstallations, uninstallGadget } from './host/installations'
import { AdminView } from './components/AdminView'
import { AnnouncementsView } from './components/AnnouncementsView'
import { CalendarView } from './components/CalendarView'
import { HelpView } from './components/HelpView'
import { InfoSlot } from './components/InfoSlot'
import { ProfileView } from './components/ProfileView'
import { ResidentsView } from './components/ResidentsView'
import { recordVisit } from './host/residents'
import { WorkshopView } from './components/WorkshopView'
import { TutorialOverlay } from './components/TutorialOverlay'
import { IMG } from './assets'
import { loadUserSettings, saveUserSettings, type UserSettings } from './host/userSettings'

type View =
  | 'dashboard'
  | 'catalog'
  | 'announcements'
  | 'calendar'
  | 'help'
  | 'residents'
  | 'workshop'
  | 'profile'
  | 'admin'
/** 案内AIの文脈追従用: 画面の表示名（world-view 語彙） */
const VIEW_LABEL: Record<View, string> = {
  dashboard: '自分の部屋',
  catalog: '道具市',
  announcements: '回覧板',
  calendar: '長屋暦',
  help: '案内所',
  residents: '入居者',
  workshop: '工房',
  profile: '入居者情報',
  admin: '大家の間',
}

/** Full-screen guidance overlays (entrance branch is behavioral only) */
type Overlay = 'entrance' | 'craftsman-guide' | 'tutorial' | null

export default function App() {
  const auth = useAuth()
  const [view, setView] = useState<View>('dashboard')
  const [installed, setInstalled] = useState<string[]>([])
  const [storeError, setStoreError] = useState<string | null>(null)
  const [helpArticle, setHelpArticle] = useState<string | undefined>(undefined)
  // settings 値自体は現在ヘッダーから参照しない（案内は「あなたの部屋」へ移設）。
  // 保存の副作用のため setter だけ使う。
  const [, setSettings] = useState<UserSettings | null>(null)
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
      // 状態票用の最小の来訪ログ（案内AI / ADR-010）。ログイン時のみ
      if (auth.status === 'signed-in') void recordVisit()
      // 初回アクセス（入口が未選択）なら入口分岐を全画面表示
      void loadUserSettings()
        .then((loaded) => {
          setSettings(loaded)
          // ゲスト（軒先）は「すぐ入れる」を優先し、入口分岐は出さない
          if (!loaded.entrance && !auth.isAnonymous) setOverlay('entrance')
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* ロゴ・タイトルをクリックすると既定表示（部屋＝ログイン後の起点）へ */}
            <button
              type="button"
              onClick={() => setView('dashboard')}
              className="flex items-center gap-2.5 text-left"
              title="自分の部屋（ホーム）へ"
            >
              <img
                src="/img/logo.png"
                alt=""
                className="h-9 w-9 shrink-0"
                width={36}
                height={36}
              />
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
            </button>
            {/* メニューはタイトルの右に一列（指定の並び順: 部屋/入居者/道具市/回覧板/
                長屋暦/案内所/工房）。「部屋」は主画面(dashboard)の表示名。歩みは案内所内、
                大家の間は入居者情報内へ移設済み */}
            {(auth.status === 'signed-in' || auth.status === 'disabled') && (
              <nav className="flex flex-wrap items-center gap-1 text-sm">
                <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>
                  自分の部屋
                </TabButton>
                <TabButton active={view === 'residents'} onClick={() => setView('residents')}>
                  入居者
                </TabButton>
                <TabButton active={view === 'catalog'} onClick={() => setView('catalog')}>
                  道具市
                </TabButton>
                <TabButton active={view === 'announcements'} onClick={() => setView('announcements')}>
                  回覧板
                </TabButton>
                <TabButton active={view === 'calendar'} onClick={() => setView('calendar')}>
                  長屋暦
                </TabButton>
                <TabButton active={view === 'help'} onClick={() => setView('help')}>
                  案内所
                </TabButton>
                {/* 工房は道具をつくる人（店子以上＝軒先は不可）向け。ローカル開発では常に表示 */}
                {(auth.status === 'disabled' ||
                  (auth.profile !== null && roleAtLeast(auth.profile.role, 'user'))) && (
                  <TabButton active={view === 'workshop'} onClick={() => setView('workshop')}>
                    工房
                  </TabButton>
                )}
              </nav>
            )}
          </div>
          {(auth.status === 'signed-in' || auth.status === 'disabled') && (
            <button
              type="button"
              onClick={() => setView('profile')}
              className="flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
              title="入居者情報（設定・ログアウト・見た目）"
            >
              {auth.status === 'signed-in'
                ? (auth.profile?.displayName ?? auth.email ?? '軒先の方')
                : '入居者情報'}
              {auth.status === 'signed-in' && (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">
                  {auth.profile?.role ?? '…'}
                </span>
              )}
            </button>
          )}
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
        {auth.status === 'signed-out' && <LoginView auth={auth} />}
        {(auth.status === 'signed-in' || auth.status === 'disabled') && (
          <>
            {view === 'dashboard' && (
              <Dashboard
                installed={installed}
                onOpenCatalog={() => setView('catalog')}
                onNavigate={setView}
                onUninstall={handleUninstall}
              />
            )}
            {view === 'catalog' && (
              <CatalogView
                installed={installed}
                canInstall={canInstall}
                currentUserId={auth.userId}
                isAdmin={auth.profile?.role === 'admin'}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            )}
            {view === 'announcements' && (
              <AnnouncementsView isAdmin={auth.profile?.role === 'admin'} />
            )}
            {view === 'calendar' && <CalendarView isAdmin={auth.profile?.role === 'admin'} />}
            {view === 'help' && (
              <HelpView
                key={helpArticle ?? 'default'}
                initialArticle={helpArticle}
                onOpenGuide={(guide) => setOverlay(guide)}
              />
            )}
            {view === 'residents' && (
              <ResidentsView
                installed={installed}
                canInstall={canInstall}
                onInstall={handleInstall}
              />
            )}
            {view === 'workshop' && (
              <WorkshopView
                userId={auth.userId}
                onOpenHelp={() => {
                  setHelpArticle('05-ai')
                  setView('help')
                }}
              />
            )}
            {view === 'profile' && (
              <ProfileView
                onSignOut={() => void auth.signOut()}
                isAdmin={auth.profile?.role === 'admin'}
                onOpenAdmin={() => setView('admin')}
              />
            )}
            {view === 'admin' && auth.profile?.role === 'admin' && <AdminView />}
          </>
        )}
      </main>
      {overlay === 'entrance' && <EntranceScreen onSelect={handleEntranceSelect} />}
      {overlay === 'craftsman-guide' && <CraftsmanGuide onClose={() => setOverlay(null)} />}
      {overlay === 'tutorial' && (
        <TutorialOverlay
          onFinish={handleTutorialFinish}
          onOpenCatalog={() => setView('catalog')}
          onOpenDashboard={() => setView('dashboard')}
        />
      )}
      {/* 案内AI（段1ステートレス＋段2 文脈追従・承認つき操作補助）。下部常駐の単一窓。AIは任意 */}
      {auth.status === 'signed-in' && !overlay && (
        <GuideAssistant
          onOpenAiSettings={() => setView('workshop')}
          viewLabel={VIEW_LABEL[view] ?? ''}
          installed={installed}
          onInstall={handleInstall}
          onNavigate={(v) => setView(v)}
          onOpenHelp={(article) => {
            setHelpArticle(article)
            setView('help')
          }}
        />
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
  onNavigate,
  onUninstall,
}: {
  installed: string[]
  onOpenCatalog: () => void
  onNavigate: (view: View) => void
  onUninstall: (dir: string) => void
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
        <InfoSlot onNavigate={onNavigate} />
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
      <FloatingDesk installed={installed} onUninstall={onUninstall} />
    </>
  )
}

/** 棚のフローティング配置（自由に移動・リサイズ）。配置は端末ごとに保存。 */
function FloatingDesk({
  installed,
  onUninstall,
}: {
  installed: string[]
  onUninstall: (dir: string) => void
}) {
  const deskRef = useRef<HTMLDivElement>(null)
  const [deskWidth, setDeskWidth] = useState(0)
  const [layouts, setLayouts] = useState<Record<string, WinRect>>(() => loadLayouts())
  const [order, setOrder] = useState<string[]>(installed)

  // インストール一覧に合わせて重なり順（order）を同期。新規は末尾＝前面
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => installed.includes(id))
      const added = installed.filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
  }, [installed])

  // 棚の幅を測る（既定配置の列数・幅に使う）
  useEffect(() => {
    const el = deskRef.current
    if (!el) return
    const update = () => setDeskWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const rectFor = (id: string, index: number): WinRect =>
    layouts[id] ?? defaultRect(index, deskWidth || 1000)

  const commit = (id: string, rect: WinRect) => {
    setLayouts((prev) => ({ ...prev, [id]: rect }))
    saveLayout(id, rect)
  }
  const bringToFront = (id: string) => setOrder((prev) => [...prev.filter((x) => x !== id), id])
  const tidy = () => {
    clearLayouts()
    setLayouts({})
  }

  const deskHeight = Math.max(
    440,
    ...installed.map((id, index) => {
      const r = rectFor(id, index)
      return r.y + r.h + 24
    }),
  )

  // スマホ等の狭い画面では自由配置はやめ、縦積み・全幅で表示する（操作しやすさ優先）
  const narrow = deskWidth > 0 && deskWidth < 640

  return (
    <div ref={deskRef}>
      {narrow ? (
        <div className="grid grid-cols-1 gap-4">
          {installed.map((id) => (
            <GadgetFrame key={id} gadgetDir={id} onUninstall={onUninstall} />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-end gap-2 text-xs text-stone-500">
            <span>道具の枠は自由に動かせます（見出しをドラッグ／右下でサイズ変更）</span>
            <button
              type="button"
              onClick={tidy}
              className="rounded-lg border border-stone-300 px-3 py-1 text-stone-600 hover:bg-stone-50"
            >
              整列する
            </button>
          </div>
          <div className="relative" style={{ height: deskHeight }}>
            {installed.map((id, index) => (
              <FloatingWindow
                key={id}
                gadgetDir={id}
                rect={rectFor(id, index)}
                zIndex={order.indexOf(id) + 1}
                onFocus={() => bringToFront(id)}
                onCommit={(rect) => commit(id, rect)}
                onUninstall={onUninstall}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** 保存された配置が無い窓の既定位置・サイズ（棚幅に応じてゆるくグリッド配置） */
function defaultRect(index: number, deskWidth: number): WinRect {
  const w = Math.min(400, Math.max(260, deskWidth - 24))
  const h = 340
  const cols = Math.max(1, Math.floor(deskWidth / (w + 16)))
  const col = index % cols
  const row = Math.floor(index / cols)
  return { x: col * (w + 16), y: row * (h + 16), w, h }
}
