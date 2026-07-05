import { appConfig } from '../config'

// セットアップウィザードの入手UI。ボタンは配布ページではなく exe を直接ダウンロードする。
// 未署名のため初回に SmartScreen 警告が出る旨を、ボタンのすぐ下に常設する。

/** exe を直接ダウンロードするボタン（クリックでダウンロードが始まる）。 */
export function WizardDownloadButton({ label = 'セットアップウィザードを入手' }: { label?: string }) {
  return (
    <a
      href={appConfig.wizardDownloadUrl}
      download
      className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
      style={{ backgroundColor: 'var(--nb-terra)' }}
    >
      {label}
      <span className="ml-1 text-xs opacity-80">（Windows・約90MB）</span>
    </a>
  )
}

/** 未署名アプリの初回起動警告（SmartScreen）についての案内。ボタンの下に置く。 */
export function WizardWarningNote() {
  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
      <p className="font-semibold text-stone-700">初回起動時の警告について</p>
      <p className="mt-1">
        現在このアプリは署名（コード証明書）を付けていないため、初回起動時に Windows の
        「WindowsによってPCが保護されました（SmartScreen）」という青い警告が出ることがあります。
        これは未署名アプリに一律で出るもので、危険という意味ではありません。
      </p>
      <p className="mt-1">
        <strong>「詳細情報」→「実行」</strong> の順に押すと起動できます。
      </p>
      <p className="mt-1">
        不安な場合や、うまく動かない場合は、各画面にある「手動で続行する場合」の手順から
        手作業でも進められます。管理人・ベテラン職人にお声がけください。
      </p>
    </div>
  )
}
