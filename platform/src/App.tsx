import { useState } from 'react'
import { CatalogView } from './components/CatalogView'
import { GadgetFrame } from './components/GadgetFrame'
import { appConfig } from './config'
import { installGadget, listInstallations, uninstallGadget } from './host/installations'

type View = 'dashboard' | 'catalog'

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [installed, setInstalled] = useState<string[]>(() => listInstallations())

  const handleInstall = (dir: string) => {
    installGadget(dir)
    setInstalled(listInstallations())
  }
  const handleUninstall = (dir: string) => {
    uninstallGadget(dir)
    setInstalled(listInstallations())
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold">
              {appConfig.appName}
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-normal text-amber-800">
                仮称
              </span>
            </h1>
            <p className="text-xs text-stone-500">Phase 1 scaffold・ログインなし開発版</p>
          </div>
          <nav className="flex gap-1 text-sm">
            <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>
              ダッシュボード
            </TabButton>
            <TabButton active={view === 'catalog'} onClick={() => setView('catalog')}>
              カタログ
            </TabButton>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        {view === 'dashboard' ? (
          <Dashboard installed={installed} onOpenCatalog={() => setView('catalog')} />
        ) : (
          <CatalogView
            installed={installed}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
          />
        )}
      </main>
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
        active ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'
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
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
        <p>まだガジェットがインストールされていません。</p>
        <button
          type="button"
          onClick={onOpenCatalog}
          className="mt-3 rounded-lg bg-stone-800 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700"
        >
          カタログからさがす
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {installed.map((dir) => (
        <GadgetFrame key={dir} gadgetDir={dir} />
      ))}
    </div>
  )
}
