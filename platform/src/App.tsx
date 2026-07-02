import { GadgetFrame } from './components/GadgetFrame'
import { appConfig } from './config'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold">
          {appConfig.appName}
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-normal text-amber-800">
            仮称
          </span>
        </h1>
        <p className="text-xs text-stone-500">
          ダッシュボード（Phase 1 scaffold・ログインなし開発版）
        </p>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GadgetFrame gadgetDir={appConfig.devGadgetDir} />
        </div>
      </main>
    </div>
  )
}
