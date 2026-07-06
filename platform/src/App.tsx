import { useEffect, useRef, useState } from 'react'
import { roleAtLeast } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { CatalogView } from './components/CatalogView'
import { CraftsmanGuide, EntranceScreen, type EntranceChoice } from './components/EntranceScreen'
import { FloatingWindow } from './components/FloatingWindow'
import { GadgetFrame } from './components/GadgetFrame'
import { GuideAssistant } from './components/GuideAssistant'
import {
  centerFromRect,
  clearLayouts,
  loadLayoutsRaw,
  saveLayoutRaw,
  type CenterRect,
  type WinRect,
} from './host/gadgetLayout'
import { useViewportWidth } from './host/useViewportWidth'
import { LoginView } from './components/LoginView'
import { appConfig, buildInfo } from './config'
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

/** 各画面の「この画面の使い方」で開く案内所の記事 */
const VIEW_HELP: Record<View, string> = {
  dashboard: '12-tenant-tsukau',
  catalog: '11-tenant-sagasu',
  announcements: '13-tenant-joho',
  calendar: '13-tenant-joho',
  help: '01-hajimete',
  residents: '14-tenant-heya',
  workshop: '20-maker-kobo',
  profile: '14-tenant-heya',
  admin: '30-admin-kanri',
}

/** Full-screen guidance overlays (entrance branch is behavioral only) */
type Overlay = 'entrance' | 'craftsman-guide' | 'tutorial' | null

/**
 * Service Worker を解除し、全キャッシュを消してから再読み込みする。
 * 「デプロイしたのに古いまま」を1クリックで解消するための強制更新。
 * （ガジェットはサンドボックスで SW/caches に触れないため、この操作はプラット
 * フォーム本体側にしか置けない。）
 */
async function forceRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // 失敗しても、下の reload だけは必ず行う（最低限サーバーへ再確認させる）
  }
  window.location.reload()
}

export default function App() {
  const auth = useAuth()
  const [view, setView] = useState<View>('dashboard')
  const [installed, setInstalled] = useState<string[]>([])
  const [storeError, setStoreError] = useState<string | null>(null)
  const [helpArticle, setHelpArticle] = useState<string | undefined>(undefined)
  // 速報！/入居者一覧の道具クリック → 道具市でその道具へスクロール＆強調
  const [focusGadget, setFocusGadget] = useState<string | null>(null)
  const openCatalogGadget = (dir: string) => {
    setFocusGadget(dir)
    setView('catalog')
  }
  // 長屋の歩みの「職人べつ」から、その職人（入居者）のプロフへ
  const [residentFocus, setResidentFocus] = useState<string | null>(null)
  const openResident = (name: string) => {
    setResidentFocus(name)
    setView('residents')
  }
  // 「この画面の使い方」→ 各画面に対応する案内所の記事
  const openViewHelp = () => {
    setHelpArticle(VIEW_HELP[view])
    setView('help')
  }
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

  // 「整列する」で棚の配置と一緒に案内AIの窓も初期位置へ戻すためのシグナル
  const [layoutResetKey, setLayoutResetKey] = useState(0)
  // 「整列する」行の下端Y（棚が実測）。案内AIの初期位置に使う
  const [guideTopY, setGuideTopY] = useState<number | undefined>(undefined)

  return (
    <div className="nb-washi min-h-screen overflow-x-hidden" style={{ color: 'var(--nb-ink)' }}>
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
              className="flex items-center gap-3 text-left"
              title="自分の部屋（ホーム）へ"
            >
              <img
                src="/img/logo.png"
                alt=""
                className="h-11 w-11 shrink-0"
                width={44}
                height={44}
              />
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold leading-none" style={{ color: 'var(--nb-navy)' }}>
                  {appConfig.appName}
                </h1>
                {/* どのデプロイを見ているか一目で分かるよう、版・コミット・ビルド時刻を表示 */}
                <span
                  className="mt-0.5 font-mono text-[10px] leading-none text-stone-400"
                  title={`build ${buildInfo.time}`}
                >
                  v{buildInfo.version} · {buildInfo.sha}
                  {buildInfo.time ? ` · ${buildInfo.time.slice(0, 16).replace('T', ' ')}` : ''}
                </span>
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
          <div className="flex shrink-0 items-center gap-1">
            {/* デプロイ後に「古いまま」を1クリックで解消する強制更新
                （SW解除＋全キャッシュ削除＋再読み込み） */}
            <button
              type="button"
              onClick={() => void forceRefresh()}
              title="キャッシュ（Service Worker・保存済みデータ）を消して最新を再読み込みします"
              className="flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
            >
              <span aria-hidden>🔄</span>
              <span className="hidden sm:inline">更新</span>
            </button>
            {view !== 'help' && (
              <button
                type="button"
                onClick={openViewHelp}
                className="flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
                title="この画面の使い方（案内所）"
              >
                <span aria-hidden>❓</span>
                <span className="hidden sm:inline">使い方</span>
              </button>
            )}
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
          </div>
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
                onOpenGadget={openCatalogGadget}
                onUninstall={handleUninstall}
                userName={auth.profile?.displayName}
                avatar={auth.profile?.avatar}
                roomNo={auth.profile?.roomNo}
                onTidy={() => setLayoutResetKey((k) => k + 1)}
                onMeasureTop={setGuideTopY}
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
                focusDir={focusGadget}
                onFocusHandled={() => setFocusGadget(null)}
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
                onNavigate={setView}
                onOpenGadget={openCatalogGadget}
                onOpenResident={openResident}
              />
            )}
            {view === 'residents' && (
              <ResidentsView
                installed={installed}
                canInstall={canInstall}
                onInstall={handleInstall}
                onOpenGadget={openCatalogGadget}
                focusName={residentFocus}
                onFocusHandled={() => setResidentFocus(null)}
              />
            )}
            {view === 'workshop' && (
              <WorkshopView
                userId={auth.userId}
                onOpenHelp={(article) => {
                  setHelpArticle(article ?? '05-ai')
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
          resetSignal={layoutResetKey}
          defaultTopY={guideTopY}
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
  onOpenGadget,
  onUninstall,
  userName,
  avatar,
  roomNo,
  onTidy,
  onMeasureTop,
}: {
  installed: string[]
  onOpenCatalog: () => void
  onNavigate: (view: View) => void
  onOpenGadget: (dir: string) => void
  onUninstall: (dir: string) => void
  userName?: string | null
  avatar?: string | null
  roomNo?: number | null
  onTidy: () => void
  onMeasureTop: (y: number) => void
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
        <InfoSlot onNavigate={onNavigate} onOpenGadget={onOpenGadget} userName={userName} avatar={avatar} roomNo={roomNo} />
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
      <InfoSlot onNavigate={onNavigate} onOpenGadget={onOpenGadget} userName={userName} avatar={avatar} roomNo={roomNo} />
      <FloatingDesk installed={installed} onUninstall={onUninstall} onTidy={onTidy} onMeasureTop={onMeasureTop} />
    </>
  )
}

/** 棚のフローティング配置（自由に移動・リサイズ）。配置は端末ごとに保存。 */
function FloatingDesk({
  installed,
  onUninstall,
  onTidy,
  onMeasureTop,
}: {
  installed: string[]
  onUninstall: (dir: string) => void
  onTidy: () => void
  /** 「整列する」行の下端Y（案内AIの初期位置に使う。実測値を都度渡す） */
  onMeasureTop: (y: number) => void
}) {
  const tidyRowRef = useRef<HTMLDivElement>(null)
  const viewportWidth = useViewportWidth()
  // 保存形式（中央基準の生データ）をそのまま state に持つ。絶対座標への変換は
  // 描画のたびに rectFor 内で行う＝resize のたびに「保存し直して読み直す」という
  // 一拍遅れる経路を経由しないので、リサイズ中もガタつかず滑らかに追従する。
  const [rawLayouts, setRawLayouts] = useState<Record<string, CenterRect>>(() => loadLayoutsRaw())
  const [order, setOrder] = useState<string[]>(installed)

  // インストール一覧に合わせて重なり順（order）を同期。新規は末尾＝前面
  useEffect(() => {
    setOrder((prev) => {
      const kept = prev.filter((id) => installed.includes(id))
      const added = installed.filter((id) => !kept.includes(id))
      return [...kept, ...added]
    })
  }, [installed])

  // スマホ等の狭い画面では自由配置はやめ、縦積み・全幅で表示する（操作しやすさ優先）
  const narrow = viewportWidth < 640

  // 「整列する」行の下端を測って親へ伝える（案内AIの初期位置＝この行の下、に使う）。
  // narrow⇔wide の切り替えで行の有無が変わるので、narrow が変わるたび測り直す。
  useEffect(() => {
    if (narrow) return
    const row = tidyRowRef.current
    if (!row) return
    const measure = () => onMeasureTop(row.getBoundingClientRect().bottom)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow])

  // 静止時は常に「中央基準」のまま渡す＝FloatingWindow が CSS の calc(50% + cxpx) で
  // 描画するので、リサイズはブラウザのレイアウトエンジンがネイティブに追従し、ガタつかない。
  const rectFor = (id: string, index: number): CenterRect =>
    rawLayouts[id] ?? centerFromRect(defaultRect(index, viewportWidth || 1000), viewportWidth)

  const commit = (id: string, center: CenterRect) => {
    setRawLayouts((prev) => ({ ...prev, [id]: center }))
    saveLayoutRaw(id, center)
  }
  const bringToFront = (id: string) => setOrder((prev) => [...prev.filter((x) => x !== id), id])
  const tidy = () => {
    clearLayouts() // 棚の各窓＋案内AI（__guide__）の保存位置をまとめて消す
    setRawLayouts({})
    onTidy() // 案内AIの窓も初期位置へ戻す
  }

  const deskHeight = Math.max(
    440,
    ...installed.map((id, index) => {
      const r = rectFor(id, index)
      return r.y + r.h + 24
    }),
  )

  return (
    // 棚はブラウザ幅いっぱいに（案内AIと同様、道具を左右どこにでも置けるように）。
    // full-bleed: 中央寄せの親(max-w-5xl)から抜けてビューポート全幅にする。
    <div
      style={narrow ? undefined : { width: '100vw', marginLeft: 'calc(50% - 50vw)' }}
      className={narrow ? undefined : 'px-4'}
    >
      {narrow ? (
        <div className="grid grid-cols-1 gap-4">
          {installed.map((id) => (
            <GadgetFrame key={id} gadgetDir={id} onUninstall={onUninstall} />
          ))}
        </div>
      ) : (
        <>
          <div
            ref={tidyRowRef}
            className="mx-auto mb-2 flex max-w-5xl items-center justify-end gap-2 text-xs text-stone-500"
          >
            <span>道具の枠は自由に動かせます（見出しをドラッグで移動／縁や角のハンドルでサイズ変更）</span>
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

/**
 * 保存された配置が無い窓の既定位置・サイズ。
 * 基本の整列範囲は「中央 1024px」の帯（ヘッダー/本文と同じ中央カラム）に収める。
 * 帯より広いブラウザでは中央寄せ。窓は後から自由に帯の外へも動かせる。
 */
const CENTER_BAND = 1024
function defaultRect(index: number, deskWidth: number): WinRect {
  const band = Math.min(CENTER_BAND, deskWidth)
  const offset = Math.max(0, (deskWidth - band) / 2)
  const w = Math.min(400, Math.max(260, band - 24))
  const h = 340
  const cols = Math.max(1, Math.floor(band / (w + 16)))
  const col = index % cols
  const row = Math.floor(index / cols)
  return { x: offset + col * (w + 16), y: row * (h + 16), w, h }
}
