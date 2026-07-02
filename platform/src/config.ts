// All branding comes from configuration — the project name is provisional
// and must not be hardcoded anywhere in code (docs/requirements.md §0).
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
} as const
