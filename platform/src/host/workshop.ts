import { supabase } from '../auth/supabaseClient'

// 工房（職人の作業場）と、道具市の状態フィルタ用のデータアクセス。
// 道具の登録・状態変更は gadgets テーブル（RLS: insert/update は owner か admin）。

export interface GadgetRecord {
  id: string
  status: string
  owner_id: string | null
  name?: string | null
}

export type GadgetStatus = 'draft' | 'in_review' | 'published' | 'suspended'

export const workshopAvailable = (): boolean => supabase !== null

/** 全道具の状態マップ（カタログの表示可否判定用。security definer RPC 経由） */
export async function listGadgetVisibility(): Promise<Map<string, GadgetRecord>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase.rpc('gadget_visibility')
  if (error) return new Map() // 取れなくてもカタログは壊さない
  const map = new Map<string, GadgetRecord>()
  for (const row of (data ?? []) as GadgetRecord[]) map.set(row.id, row)
  return map
}

/** 自分が owner の道具（工房の「あなたの道具」） */
export async function listMyGadgets(userId: string): Promise<GadgetRecord[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('gadgets')
    .select('id, status, owner_id, name')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`あなたの道具の取得に失敗しました: ${error.message}`)
  return (data ?? []) as GadgetRecord[]
}

/**
 * 道具市の道具を「自分の道具」として登録（owner を自分に）。既存行が他人所有なら
 * RLS で弾かれる（他人の道具は登録できない）。初期状態は draft（構築中）。
 */
export async function registerGadget(id: string, name: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase 接続時のみ利用できます')
  const { error } = await supabase
    .from('gadgets')
    .upsert(
      { id, owner_id: userId, name: name || null, status: 'draft' },
      { onConflict: 'id' },
    )
  if (error) throw new Error(`登録に失敗しました: ${error.message}`)
}

export async function setGadgetStatus(id: string, status: GadgetStatus): Promise<void> {
  if (!supabase) throw new Error('Supabase 接続時のみ利用できます')
  const { error } = await supabase.from('gadgets').update({ status }).eq('id', id)
  if (error) throw new Error(`状態の変更に失敗しました: ${error.message}`)
}
