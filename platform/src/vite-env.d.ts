/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_DEV_GADGET_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** ビルド時に vite.config.ts の define で注入される（コミットSHA・時刻・版）。 */
declare const __BUILD_INFO__: {
  readonly version: string
  readonly sha: string
  readonly time: string
}
