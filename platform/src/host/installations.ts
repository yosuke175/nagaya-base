import { currentUserId, supabase } from '../auth/supabaseClient'

// Installation state (ADR-003, FR-04), keyed by gadget directory
// (= manifest.id for published gadgets).
//
// Signed in  -> `installations` table behind RLS (shared across devices;
//               guests are rejected by RLS as the final gate).
// Not signed in (Supabase unconfigured local dev) -> localStorage fallback.
const INSTALLATIONS_KEY = 'gadget-installations'

export async function listInstallations(): Promise<string[]> {
  const userId = await currentUserId()
  if (supabase && userId) {
    const { data, error } = await supabase.from('installations').select('gadget_id')
    if (error) throw new Error(`インストール一覧の取得に失敗しました: ${error.message}`)
    return data.map((row) => row.gadget_id as string)
  }
  return listLocal()
}

export async function installGadget(dir: string): Promise<void> {
  const userId = await currentUserId()
  if (supabase && userId) {
    const { error } = await supabase
      .from('installations')
      .upsert({ user_id: userId, gadget_id: dir }, { onConflict: 'user_id,gadget_id' })
    if (error) throw new Error(`インストールに失敗しました: ${error.message}`)
    return
  }
  const list = listLocal()
  if (!list.includes(dir)) saveLocal([...list, dir])
}

// Uninstalling removes the installation row only; gadget_storage rows stay
// (RLS blocks access while uninstalled; reinstalling restores the data).
export async function uninstallGadget(dir: string): Promise<void> {
  const userId = await currentUserId()
  if (supabase && userId) {
    const { error } = await supabase.from('installations').delete().eq('gadget_id', dir)
    if (error) throw new Error(`アンインストールに失敗しました: ${error.message}`)
    return
  }
  saveLocal(listLocal().filter((entry) => entry !== dir))
}

function listLocal(): string[] {
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

function saveLocal(list: string[]): void {
  localStorage.setItem(INSTALLATIONS_KEY, JSON.stringify(list))
}
