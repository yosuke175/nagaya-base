import { supabase } from '../auth/supabaseClient'

// 情報系レイヤー（一方向）のデータアクセス。書き込みは admin のみ
// （UIゲートは補助。最終防衛線は RLS — 20260704010000_info_layer.sql）。
// activity_feed への書き込み関数は存在しない（DBトリガーのみが生成する）。

export interface Announcement {
  id: number
  title: string
  body: string
  importance: 'normal' | 'important'
  created_at: string
}

export interface EventItem {
  id: number
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
}

export interface FeedItem {
  id: number
  type: string
  target: string | null
  summary: string
  created_at: string
}

export interface PublishedGadget {
  id: string
  name: string | null
  created_at: string
  ownerName: string | null
}

/** 情報レイヤーは Supabase 接続時のみ（ログインなしローカル開発では非表示） */
export const infoLayerAvailable = (): boolean => supabase !== null

function required() {
  if (!supabase) throw new Error('情報レイヤーは Supabase 接続時のみ利用できます')
  return supabase
}

export async function listAnnouncements(limit = 50): Promise<Announcement[]> {
  const { data, error } = await required()
    .from('announcements')
    .select('id, title, body, importance, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`回覧板の取得に失敗しました: ${error.message}`)
  return (data ?? []) as Announcement[]
}

export async function createAnnouncement(input: {
  title: string
  body: string
  importance: 'normal' | 'important'
}): Promise<void> {
  const client = required()
  const { data: session } = await client.auth.getSession()
  const { error } = await client
    .from('announcements')
    .insert({ ...input, author_id: session.session?.user.id })
  if (error) throw new Error(`投稿に失敗しました: ${error.message}`)
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const { error } = await required().from('announcements').delete().eq('id', id)
  if (error) throw new Error(`削除に失敗しました: ${error.message}`)
}

export async function listUpcomingEvents(limit = 20): Promise<EventItem[]> {
  const { data, error } = await required()
    .from('events')
    .select('id, title, description, starts_at, ends_at, location')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`長屋暦の取得に失敗しました: ${error.message}`)
  return (data ?? []) as EventItem[]
}

export async function listPastEvents(limit = 5): Promise<EventItem[]> {
  const { data, error } = await required()
    .from('events')
    .select('id, title, description, starts_at, ends_at, location')
    .lt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`長屋暦の取得に失敗しました: ${error.message}`)
  return (data ?? []) as EventItem[]
}

export async function createEvent(input: {
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
}): Promise<void> {
  const client = required()
  const { data: session } = await client.auth.getSession()
  const { error } = await client
    .from('events')
    .insert({ ...input, author_id: session.session?.user.id })
  if (error) throw new Error(`予定の登録に失敗しました: ${error.message}`)
}

export async function deleteEvent(id: number): Promise<void> {
  const { error } = await required().from('events').delete().eq('id', id)
  if (error) throw new Error(`削除に失敗しました: ${error.message}`)
}

export async function listFeed(limit = 50): Promise<FeedItem[]> {
  const { data, error } = await required()
    .from('activity_feed')
    .select('id, type, target, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`速報の取得に失敗しました: ${error.message}`)
  return (data ?? []) as FeedItem[]
}

/** 長屋の歩み用: 公開済みの道具一覧（職人名つき） */
export async function listPublishedGadgets(): Promise<PublishedGadget[]> {
  const { data, error } = await required()
    .from('gadgets')
    .select('id, name, created_at, profiles(display_name)')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`公開一覧の取得に失敗しました: ${error.message}`)
  return (data ?? []).map((row) => {
    const profile = row.profiles as { display_name?: string } | { display_name?: string }[] | null
    const ownerName = Array.isArray(profile)
      ? (profile[0]?.display_name ?? null)
      : (profile?.display_name ?? null)
    return { id: row.id, name: row.name, created_at: row.created_at, ownerName }
  })
}
