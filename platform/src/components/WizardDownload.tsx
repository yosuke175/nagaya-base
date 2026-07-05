import { appConfig } from '../config'

// セットアップウィザードの入手UI。ボタンは配布ページではなく本体を直接ダウンロードする。
// 見ているOS（Windows / Mac）を判定して、合う方を主ボタンにする。未署名のため初回起動時に
// 警告（Windows=SmartScreen / Mac=Gatekeeper）が出る旨を、ボタンのすぐ下に常設する。

/** ざっくりOS判定（デスクトップのみ対象。判定に外れても両方のリンクは出す）。 */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const s = `${navigator.platform} ${navigator.userAgent}`
  return /Mac/i.test(s) && !/iPhone|iPad|iPod/i.test(s)
}

const WIN = { url: appConfig.wizardDownloadUrl, label: 'Windows版', hint: '.exe・約90MB' }
const MAC = { url: appConfig.wizardDownloadUrlMac, label: 'Mac版', hint: '.dmg' }

/** 本体を直接ダウンロードするボタン（クリックでダウンロードが始まる）。OSに合う方を主に出す。 */
export function WizardDownloadButton({ label = 'セットアップウィザードを入手' }: { label?: string }) {
  const mac = isMacOS()
  const primary = mac ? MAC : WIN
  const other = mac ? WIN : MAC

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a
        href={primary.url}
        download
        className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: 'var(--nb-terra)' }}
      >
        {label}
        <span className="ml-1 text-xs opacity-80">
          （{primary.label}・{primary.hint}）
        </span>
      </a>
      <a href={other.url} download className="text-xs text-stone-500 underline hover:text-stone-700">
        {other.label}はこちら
      </a>
    </div>
  )
}

/** 未署名アプリの初回起動警告（Windows/Mac 両対応）。ボタンの下に置く。 */
export function WizardWarningNote() {
  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
      <p className="font-semibold text-stone-700">初回起動時の警告について</p>
      <p className="mt-1">
        現在このアプリは署名（コード証明書）を付けていないため、初回だけOSの警告が出ることがあります。
        危険という意味ではありません。次の操作で起動できます。
      </p>
      <ul className="mt-1 list-disc pl-5">
        <li>
          <strong>Windows</strong>:「WindowsによってPCが保護されました」→
          <strong>「詳細情報」→「実行」</strong>
        </li>
        <li>
          <strong>Mac</strong>:「開発元を確認できないため開けません」→ アプリを
          <strong>右クリック→「開く」</strong>
          （または システム設定 → プライバシーとセキュリティ →「このまま開く」）
        </li>
      </ul>
      <p className="mt-1">
        うまくいかない場合は、各画面の「手動で続行する場合」から手作業でも進められます。
        管理人・ベテラン職人にお声がけください。
      </p>
    </div>
  )
}
