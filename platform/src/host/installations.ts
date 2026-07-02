// Mock of the `installations` table (ADR-003, FR-04), keyed by gadget
// directory. Moves to Supabase behind RLS in the Supabase iteration — the
// RLS rules already exist in supabase/migrations/20260702000000_initial_schema.sql.
const INSTALLATIONS_KEY = 'gadget-installations'

export function listInstallations(): string[] {
  try {
    const raw = localStorage.getItem(INSTALLATIONS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

export function installGadget(dir: string): void {
  const list = listInstallations()
  if (!list.includes(dir)) {
    save([...list, dir])
  }
}

// Uninstalling removes the installation only. Gadget storage and the
// approval record stay, matching the planned Supabase behavior (RLS blocks
// access while uninstalled; reinstalling restores the data).
export function uninstallGadget(dir: string): void {
  save(listInstallations().filter((entry) => entry !== dir))
}

function save(list: string[]): void {
  localStorage.setItem(INSTALLATIONS_KEY, JSON.stringify(list))
}
