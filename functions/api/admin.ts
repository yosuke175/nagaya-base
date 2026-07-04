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

  let body: { action?: string; targetUserId?: string; role?: string }
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
      if (!updateRes.ok) return json(502, { error: 'update failed' }, MARKER)
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
  } catch {
    return json(502, { error: 'storage error' }, MARKER)
  }

  return json(400, { error: 'unknown action' }, MARKER)
}
