import { useState } from 'react'
import { IMG } from '../assets'
import { appConfig } from '../config'

// 店子向け初回チュートリアル（指示書④ STEP 3）。3ステップ・スキップ可。
// 完了/スキップは呼び出し側が profiles.settings.tutorialDone に保存する。

interface TutorialOverlayProps {
  onFinish: () => void
  onOpenCatalog: () => void
  onOpenDashboard: () => void
}

export function TutorialOverlay({ onFinish, onOpenCatalog, onOpenDashboard }: TutorialOverlayProps) {
  const [step, setStep] = useState(1)
  const issueUrl = `${appConfig.repoUrl}/issues/new?template=gadget-request.yml`
  const backgrounds: Record<number, string> = {
    1: IMG.backgrounds.shopInterior,
    2: IMG.keyvisual.marketplace,
    3: IMG.backgrounds.softNoren,
  }

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-cover bg-center"
      style={{ backgroundImage: `url(${backgrounds[step]})` }}
    >
      {/* 背景を「淡く」見せるための白のかぶせ */}
      <div className="absolute inset-0 bg-white/55" />
      <div className="relative mx-auto flex min-h-full max-w-xl flex-col justify-center p-6">
        <div className="nb-panel p-6" style={{ color: 'var(--nb-ink)' }}>
          <p className="text-xs" style={{ color: 'var(--nb-sage)' }}>
            はじめての案内 {step} / 3
          </p>

          {step === 1 && (
            <>
              <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
                ようこそ、{appConfig.appName} へ
              </h2>
              <p className="mt-3 text-sm leading-relaxed">
                ここは {appConfig.appName}。職人の道具（ガジェット）を選んで、
                自分の棚に並べる長屋です。むずかしい操作はありません。
                気に入った道具を選ぶだけ。
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
                道具市（カタログ）を見る
              </h2>
              <p className="mt-3 text-sm leading-relaxed">
                道具は「道具市」に並んでいます。今は建設ラッシュ期。
                道具はまだ少ないけれど、あなたの「欲しい」が職人の次の仕事になります。
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                まずは<strong>「スケジュール秘書」</strong>を1つ試してみるのがおすすめです。
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
                棚に並べる
              </h2>
              <p className="mt-3 text-sm leading-relaxed">
                道具市で「インストール」すると、道具はあなたの棚（ダッシュボード）に
                並びます。これがあなたの棚。道具はいつでも足したり外したりできます。
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                欲しい道具が見つからなかったら、遠慮なく職人に伝えてください。
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--nb-navy)' }}
              >
                次へ
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => {
                  onOpenCatalog()
                  setStep(3)
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--nb-terra)' }}
              >
                道具市をのぞいてみる
              </button>
            )}
            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onOpenDashboard()
                    onFinish()
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--nb-navy)' }}
                >
                  自分の棚を見る
                </button>
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--nb-sage)' }}
                >
                  欲しい道具を提案する
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onFinish}
              className="ml-auto rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-500"
            >
              スキップ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
