import { useState } from 'react'
import { IMG } from '../assets'
import { appConfig } from '../config'
import { WizardDownloadButton, WizardWarningNote } from './WizardDownload'

// 入口分岐（指示書④ STEP 2）。選択は「行動の分岐」だけで、ステータスや権限は
// 一切変わらない（2026-07-04 決定: 自己申告の着せ替え。ロールは admin 付与のみ）。
// メニューの「案内」からいつでもやり直せる。

export type EntranceChoice = 'craftsman' | 'tenant'

export function EntranceScreen({ onSelect }: { onSelect: (choice: EntranceChoice) => void }) {
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-cover bg-center"
      style={{ backgroundImage: `url(${IMG.keyvisual.workshopShopFrame})` }}
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 p-6">
        <div className="nb-panel px-8 py-4">
          <h1 className="text-center text-xl font-bold" style={{ color: 'var(--nb-navy)' }}>
            あなたは、どちらで長屋に入りますか？
          </h1>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelect('craftsman')}
            className="group flex flex-col items-center gap-3 rounded-2xl p-6 text-white shadow-lg transition hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--nb-navy)' }}
          >
            <img src={IMG.objects.happiCoat} alt="" className="h-24 w-24 object-contain" />
            <span className="text-2xl font-bold">職人</span>
            <span className="text-sm leading-relaxed opacity-90">
              つくる人。道具（ガジェット）を作る。
              <br />
              AIに書かせてOK・経験不問
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelect('tenant')}
            className="group flex flex-col items-center gap-3 rounded-2xl p-6 text-white shadow-lg transition hover:scale-[1.02]"
            style={{ backgroundColor: 'var(--nb-sage)' }}
          >
            <img src={IMG.objects.hairComb} alt="" className="h-24 w-24 object-contain" />
            <span className="text-2xl font-bold">店子</span>
            <span className="text-sm leading-relaxed opacity-90">
              つかう人。職人の道具で自分の棚を組む。
              <br />
              選んで使う遊び
            </span>
          </button>
        </div>

        <p className="nb-panel px-4 py-2 text-xs" style={{ color: 'var(--nb-ink)' }}>
          いつでも変えられます（メニューの「案内」からやり直せます）
        </p>
      </div>
    </div>
  )
}

/** 職人を選んだ人向け: セットアップウィザードのダウンロード案内 */
export function CraftsmanGuide({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-cover bg-center"
      style={{ backgroundImage: `url(${IMG.backgrounds.workshopTools})` }}
    >
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center p-6">
        <div className="nb-panel p-6" style={{ color: 'var(--nb-ink)' }}>
          <h1 className="text-lg font-bold" style={{ color: 'var(--nb-navy)' }}>
            ようこそ、職人さん。工房の準備をしましょう
          </h1>
          <p className="mt-3 text-sm leading-relaxed">
            道具（ガジェット）づくりは、あなたのPCの「工房」で行います。
            準備はセットアップウィザード（約15分）が案内します。
          </p>
          <ol className="mt-3 list-decimal pl-5 text-sm leading-relaxed">
            <li>
              下のボタンで<strong>セットアップウィザード</strong>をダウンロード（Windows / Mac 対応）
            </li>
            <li>ダブルクリックで起動（初回だけ下記の警告を通過してください）</li>
            <li>ウィザードの「次へ」に従うだけで、最初の道具の雛形まで完成します</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <WizardDownloadButton />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(appConfig.wizardDownloadUrl)
                setCopied(true)
              }}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              {copied ? 'コピーしました' : 'ダウンロードURLをコピー'}
            </button>
          </div>
          <WizardWarningNote />
          <p className="mt-3 text-xs" style={{ color: 'var(--nb-ink)' }}>
            PCの準備はあとでもOK。まずは長屋の中を見て回れます。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--nb-navy)' }}
          >
            自分の部屋へ進む
          </button>
        </div>
      </div>
    </div>
  )
}
