import { supabase } from '../auth/supabaseClient'

// 道具の表示上書き（フェーズ4）。manifest を触らず、道具市カードの
// 表示名・説明・カバー画像を DB に持ち、表示時にマージする。
// 書き込みは owner か admin（RLS で強制）。画像は圧縮済み data-URL。

export interface GadgetPresentation {
  display_name: string | null
  description: string | null
  cover_image: string | null
}

export const presentationAvailable = (): boolean => supabase !== null

/** 道具ID → 上書き内容 */
export async function listPresentations(): Promise<Map<string, GadgetPresentation>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from('gadget_presentation')
    .select('gadget_id, display_name, description, cover_image')
  if (error) return new Map() // 情報系は取れなくてもカタログを壊さない
  const map = new Map<string, GadgetPresentation>()
  for (const row of data ?? []) {
    map.set(row.gadget_id as string, {
      display_name: row.display_name,
      description: row.description,
      cover_image: row.cover_image,
    })
  }
  return map
}

/** 道具ID → owner_id（編集可否の判定用。DB登録済みの道具のみ） */
export async function listGadgetOwners(): Promise<Map<string, string | null>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase.from('gadgets').select('id, owner_id')
  if (error) return new Map()
  const map = new Map<string, string | null>()
  for (const row of data ?? []) map.set(row.id as string, row.owner_id as string | null)
  return map
}

export async function savePresentation(
  gadgetId: string,
  patch: GadgetPresentation,
): Promise<void> {
  if (!supabase) throw new Error('Supabase 接続時のみ編集できます')
  const { data: session } = await supabase.auth.getSession()
  const { error } = await supabase.from('gadget_presentation').upsert(
    {
      gadget_id: gadgetId,
      display_name: patch.display_name,
      description: patch.description,
      cover_image: patch.cover_image,
      updated_by: session.session?.user.id,
    },
    { onConflict: 'gadget_id' },
  )
  if (error) throw new Error(`保存に失敗しました: ${error.message}`)
}
