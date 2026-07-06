// All branding comes from configuration — the project name is provisional
// and must not be hardcoded anywhere in code (docs/requirements.md §0).
const repoUrl = 'https://github.com/yosuke175/nagaya-base'

export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Gadget Platform (dev)',
  /**
   * Set by `npm run dev:gadget <dir>` — pins the dashboard to one gadget
   * (dev mode). When null, the dashboard shows the user's installed gadgets.
   */
  devGadgetDir: import.meta.env.VITE_DEV_GADGET_ID ?? null,
  // Supabase wiring lands in the next iteration (see .env.example).
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  /** Upstream repository (single place — the repo name is provisional too). */
  repoUrl,
  /**
   * セットアップウィザードの直接ダウンロードURL（OS別）。常に最新リリースの資産を指す
   * （/releases/latest/download/...）。資産名は setup-wizard の electron-builder
   * artifactName（版なし）と一致させること。ビルドは .github/workflows/build-wizard.yml。
   */
  wizardDownloadUrl: `${repoUrl}/releases/latest/download/NagayaBaseSetup-portable.exe`,
  wizardDownloadUrlMac: `${repoUrl}/releases/latest/download/NagayaBaseSetup-mac.dmg`,
} as const

/**
 * ビルド情報（版・コミットSHA・ビルド時刻）。vite.config.ts の define で注入される。
 * どのデプロイを表示しているかを画面で確認するために使う。
 */
export const buildInfo: { version: string; sha: string; time: string } =
  typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : { version: '0.0.0', sha: 'dev', time: '' }
