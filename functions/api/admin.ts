// Cloudflare Pages Function: /api/admin
//
// 大家（admin）だけが使う管理API。ロール付与を service_role で行い、
// audit_logs に記録する（ADR-003: ロール変更はサーバー側・admin のみ）。
// クライアントに role 列の UPDATE 権限は与えていないため、ここが唯一の付与経路。
//
// 認証: 呼び出し元の Supabase トークンを検証し、その profiles.role が admin か
// を service_role で確認してから実行する。
//
// 必要な Pages 環境変数は functions/api/_shared.ts（credentials と同じ）。

import { isConfigured, json, requireUserId, type Env } from './_shared'

const MARKER = 'x-admin-api'
const VALID_ROLES = new Set(['guest', 'user', 'developer', 'admin'])
// 緊急停止で大家が切り替えられる状態（FR-09）。停止＝suspended / 再開＝published。
const VALID_GADGET_STATUS = new Set(['published', 'suspended'])

function rest(env: Env, path: string): string {
  return `${env.SUPABASE_URL}/rest/v1/${path}`
}
function restHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
}

async function callerRole(env: Env, userId: string): Promise<string | null> {
  const response = await fetch(rest(env, `profiles?id=eq.${userId}&select=role`), {
    headers: restHeaders(env),
  })
  if (!response.ok) return null
  const rows = (await response.json()) as Array<{ role: string }>
  return rows[0]?.role ?? null
}

async function adminCount(env: Env): Promise<number> {
  const response = await fetch(rest(env, 'profiles?role=eq.admin&select=id'), {
    headers: restHeaders(env),
  })
  if (!response.ok) return 0
  const rows = (await response.json()) as Array<{ id: string }>
  return rows.length
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (request.method === 'GET') {
    return isConfigured(env)
      ? new Response(null, { status: 204, headers: { [MARKER]: '1' } })
      : new Response(null, { status: 503 })
  }
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, MARKER)
  if (!isConfigured(env)) return json(503, { error: 'admin API is not configured' }, MARKER)

  const callerId = await requireUserId(request, env)
  if (!callerId) return json(401, { error: 'unauthorized' }, MARKER)
  if ((await callerRole(env, callerId)) !== 'admin') {
    return json(403, { error: '大家（管理者）のみが利用できます' }, MARKER)
  }

  let body: {
    action?: string
    targetUserId?: string
    role?: string
    gadgetId?: string
    status?: string
    gadgets?: string
    roomNo?: number | null
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid json' }, MARKER)
  }

  try {
    if (body.action === 'list') {
      // profiles（id/display_name/role/room_no）と auth のメールをマージ
      const profilesRes = await fetch(
        rest(env, 'profiles?select=id,display_name,role,room_no&order=room_no.asc.nullslast'),
        { headers: restHeaders(env) },
      )
      if (!profilesRes.ok) return json(502, { error: 'storage error' }, MARKER)
      const profiles = (await profilesRes.json()) as Array<{
        id: string
        display_name: string
        role: string
        room_no: number | null
      }>
      const usersRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY as string, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      })
      const emails = new Map<string, string>()
      if (usersRes.ok) {
        const payload = (await usersRes.json()) as { users?: Array<{ id: string; email?: string }> }
        for (const user of payload.users ?? []) if (user.email) emails.set(user.id, user.email)
      }
      return json(
        200,
        {
          users: profiles.map((profile) => ({
            id: profile.id,
            displayName: profile.display_name,
            role: profile.role,
            roomNo: profile.room_no,
            email: emails.get(profile.id) ?? null,
          })),
        },
        MARKER,
      )
    }

    if (body.action === 'set-role') {
      const { targetUserId, role } = body
      if (typeof targetUserId !== 'string' || !role || !VALID_ROLES.has(role)) {
        return json(400, { error: 'invalid target or role' }, MARKER)
      }
      if (targetUserId === callerId) {
        return json(400, { error: '自分自身のロールはここでは変更できません（ロックアウト防止）' }, MARKER)
      }
      const updateRes = await fetch(rest(env, `profiles?id=eq.${targetUserId}`), {
        method: 'PATCH',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({ role }),
      })
      if (!updateRes.ok) {
        // 本当の原因を返す（例: permission denied for sequence …）
        const detail = await updateRes.text().catch(() => '')
        return json(502, { error: `ロール変更に失敗しました: ${detail || `HTTP ${updateRes.status}`}` }, MARKER)
      }
      await fetch(rest(env, 'audit_logs'), {
        method: 'POST',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_id: callerId,
          action: 'set_role',
          target: targetUserId,
          detail: { role },
        }),
      })
      return json(200, { ok: true }, MARKER)
    }

    if (body.action === 'ai-usage-summary') {
      // 当月の AI 利用集計（key_owner 別: 'self'=ユーザーBYOK / 'platform'=運営保有）
      const since = new Date()
      since.setUTCDate(1)
      since.setUTCHours(0, 0, 0, 0)
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_usage_summary`, {
        method: 'POST',
        headers: { ...restHeaders(env), prefer: 'return=representation' },
        body: JSON.stringify({ p_since: since.toISOString() }),
      })
      if (!res.ok) return json(502, { error: 'storage error' }, MARKER)
      const rows = (await res.json()) as Array<{ key_owner: string; total_usd: number; calls: number }>
      return json(200, { since: since.toISOString(), rows }, MARKER)
    }

    if (body.action === 'list-gadgets') {
      // 全道具（下書き含む）を service_role で取得。緊急停止の判断材料。
      const gadgetsRes = await fetch(
        rest(env, 'gadgets?select=id,name,status,owner_id&order=created_at.asc'),
        { headers: restHeaders(env) },
      )
      if (!gadgetsRes.ok) return json(502, { error: 'storage error' }, MARKER)
      const gadgets = (await gadgetsRes.json()) as Array<{
        id: string
        name: string | null
        status: string
        owner_id: string | null
      }>
      return json(200, { gadgets }, MARKER)
    }

    if (body.action === 'set-gadget-status') {
      const { gadgetId, status } = body
      if (typeof gadgetId !== 'string' || !status || !VALID_GADGET_STATUS.has(status)) {
        return json(400, { error: 'invalid gadget or status' }, MARKER)
      }
      const updateRes = await fetch(rest(env, `gadgets?id=eq.${encodeURIComponent(gadgetId)}`), {
        method: 'PATCH',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({ status }),
      })
      if (!updateRes.ok) {
        const detail = await updateRes.text().catch(() => '')
        return json(502, { error: `状態変更に失敗しました: ${detail || `HTTP ${updateRes.status}`}` }, MARKER)
      }
      await fetch(rest(env, 'audit_logs'), {
        method: 'POST',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_id: callerId,
          action: 'set_gadget_status',
          target: gadgetId,
          detail: { status },
        }),
      })
      return json(200, { ok: true }, MARKER)
    }

    if (body.action === 'set-room-no') {
      // 部屋番号（号室）の変更。room_no は unique・サーバー側のみ更新可（RLSで本人不可）。
      const { targetUserId, roomNo } = body
      if (typeof targetUserId !== 'string') {
        return json(400, { error: 'invalid target' }, MARKER)
      }
      if (roomNo !== null && (typeof roomNo !== 'number' || !Number.isInteger(roomNo) || roomNo < 1)) {
        return json(400, { error: '号室は1以上の整数で指定してください' }, MARKER)
      }
      const updateRes = await fetch(rest(env, `profiles?id=eq.${targetUserId}`), {
        method: 'PATCH',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({ room_no: roomNo }),
      })
      if (!updateRes.ok) {
        const detail = await updateRes.text().catch(() => '')
        // unique 制約違反はわかりやすく
        if (detail.includes('23505') || detail.toLowerCase().includes('duplicate')) {
          return json(409, { error: `${roomNo}号室は既に他の入居者が使っています` }, MARKER)
        }
        return json(502, { error: `号室の変更に失敗しました: ${detail || `HTTP ${updateRes.status}`}` }, MARKER)
      }
      await fetch(rest(env, 'audit_logs'), {
        method: 'POST',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_id: callerId,
          action: 'set_room_no',
          target: targetUserId,
          detail: { roomNo },
        }),
      })
      return json(200, { ok: true }, MARKER)
    }

    if (body.action === 'delete-user') {
      // 大家によるアカウント削除（誤登録・死にアカウントの掃除など）。
      // 個人データは profiles への cascade で消え、作った道具は既定で長屋に残る
      // （FK の on delete set null → owner は大家預かり）。gadgets='suspend' で下げる。
      const { targetUserId } = body
      if (typeof targetUserId !== 'string') {
        return json(400, { error: 'invalid target' }, MARKER)
      }
      if (targetUserId === callerId) {
        return json(
          400,
          { error: '自分自身はここでは削除できません（退去機能を使ってください）' },
          MARKER,
        )
      }
      // 最後の大家を消してしまう事故を防ぐ
      if ((await callerRole(env, targetUserId)) === 'admin' && (await adminCount(env)) <= 1) {
        return json(409, { error: '最後の大家は削除できません。' }, MARKER)
      }
      // 「道具も下げる」場合は owner が外れる前に停止
      if (body.gadgets === 'suspend') {
        await fetch(rest(env, `gadgets?owner_id=eq.${targetUserId}`), {
          method: 'PATCH',
          headers: { ...restHeaders(env), prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'suspended' }),
        })
      }
      await fetch(rest(env, 'audit_logs'), {
        method: 'POST',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_id: callerId,
          action: 'delete_user',
          target: targetUserId,
          detail: { gadgets: body.gadgets === 'suspend' ? 'suspend' : 'keep' },
        }),
      })
      const deleteRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`, {
        method: 'DELETE',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      })
      if (!deleteRes.ok) {
        const detail = await deleteRes.text().catch(() => '')
        return json(502, { error: `削除に失敗しました: ${detail || `HTTP ${deleteRes.status}`}` }, MARKER)
      }
      return json(200, { ok: true }, MARKER)
    }
  } catch {
    return json(502, { error: 'storage error' }, MARKER)
  }

  return json(400, { error: 'unknown action' }, MARKER)
}
