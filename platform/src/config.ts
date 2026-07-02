// All branding comes from configuration — the project name is provisional
// and must not be hardcoded anywhere in code (docs/requirements.md §0).
export const appConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Gadget Platform (dev)',
  /** Gadget directory shown on the dashboard until the catalog exists (set by `npm run dev:gadget`). */
  devGadgetDir: import.meta.env.VITE_DEV_GADGET_ID ?? '_template',
  // Supabase wiring lands in the next iteration (see .env.example).
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
} as const
