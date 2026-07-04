import { supabase } from '../auth/supabaseClient'

// 入居者情報（フェーズ2）。プロフィールは本人が profiles を直接更新（RLSで自分の行のみ、
// role/room_no は更新不可）。一覧は list_residents() RPC が visibility を適用して返す。

export interface MyProfile {
  displayName: string
  avatar: string | null
  bio: string | null
  links: Record<string, string>
  visibility: Record<string, boolean>
  roomNo: number | null
  role: string
}

export interface ResidentEntry {
  room_no: number | null
  display_name: string
  avatar: string | null
  bio: string | null
  links: Record<string, string>
}

export const residentsAvailable = (): boolean => supabase !== null

function required() {
  if (!supabase) throw new Error('入居者機能は Supabase 接続時のみ利用できます')
  return supabase
}

export async function loadMyProfile(): Promise<MyProfile> {
  const client = required()
  const { data: session } = await client.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('ログインが必要です')
  const { data, error } = await client
    .from('profiles')
    .select('display_name, avatar, bio, links, visibility, room_no, role')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`プロフィールの取得に失敗しました: ${error.message}`)
  return {
    displayName: data.display_name,
    avatar: data.avatar ?? null,
    bio: data.bio ?? null,
    links: (data.links ?? {}) as Record<string, string>,
    visibility: (data.visibility ?? {}) as Record<string, boolean>,
    roomNo: data.room_no ?? null,
    role: data.role,
  }
}

export async function saveMyProfile(patch: {
  displayName: string
  avatar: string | null
  bio: string | null
  links: Record<string, string>
  visibility: Record<string, boolean>
}): Promise<void> {
  const client = required()
  const { data: session } = await client.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('ログインが必要です')
  const { error } = await client
    .from('profiles')
    .update({
      display_name: patch.displayName,
      avatar: patch.avatar,
      bio: patch.bio,
      links: patch.links,
      visibility: patch.visibility,
    })
    .eq('id', userId)
  if (error) throw new Error(`保存に失敗しました: ${error.message}`)
}

export async function listResidents(): Promise<ResidentEntry[]> {
  const { data, error } = await required().rpc('list_residents')
  if (error) throw new Error(`入居者一覧の取得に失敗しました: ${error.message}`)
  return (data ?? []) as ResidentEntry[]
}

/** 来訪を記録（状態票用の最小ログ。security definer RPC）。best-effort。 */
export async function recordVisit(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('record_visit')
  if (error) {
    // 記録失敗は無視（本処理をブロックしない）
  }
}

export interface ResidentGadget {
  kind: 'developed' | 'installed'
  gadget_id: string
  name: string | null
  status: string
}

/** ある入居者（部屋番号）が作った道具／入れている道具（公開中のみ・security definer RPC） */
export async function listResidentGadgets(roomNo: number): Promise<ResidentGadget[]> {
  const { data, error } = await required().rpc('resident_gadgets', { p_room_no: roomNo })
  if (error) throw new Error(`道具の取得に失敗しました: ${error.message}`)
  return (data ?? []) as ResidentGadget[]
}

/**
 * ログイン中のユーザーにパスワードを設定/変更する。マジックリンクで作った
 * 既存アカウントにあとからパスワードを足す用途（設定後はメール＋パスワードで
 * ログインできる）。ログイン済みなのでメール確認は不要。
 */
export async function setMyPassword(password: string): Promise<void> {
  const { error } = await required().auth.updateUser({ password })
  if (error) throw new Error(`パスワードの設定に失敗しました: ${error.message}`)
}
