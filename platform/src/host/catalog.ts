import type { GadgetManifest } from 'gadget-sdk'

export interface CatalogEntry {
  /** Directory under gadgets/ (must equal manifest.id for real gadgets). */
  dir: string
  manifest: GadgetManifest
}

// Mock of the published-gadget catalog (FR-03). The index is generated from
// gadgets/*/manifest.json by the dev middleware / build step
// (platform/vite.config.ts); it moves to the `gadgets` + `gadget_versions`
// tables (status = 'published') in the Supabase iteration.
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const response = await fetch('/gadgets/index.json')
  if (!response.ok) {
    throw new Error(`カタログの取得に失敗しました (HTTP ${response.status})`)
  }
  const entries = (await response.json()) as CatalogEntry[]
  return entries.filter(
    (entry) => entry && typeof entry.dir === 'string' && entry.manifest != null,
  )
}
