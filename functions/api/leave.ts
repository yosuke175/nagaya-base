// Cloudflare Pages Function: /api/leave
//
// 退去（本人によるアカウント削除）。auth ユーザーの削除は service_role が必要な
// ため、ここ（Workers 層）でのみ行う（ADR-003）。呼び出し元＝退去する本人。
//
// 削除は profiles への cascade で個人データ（installations / gadget_storage /
// user_credentials）を消す。作った道具の扱いは呼び出し時の gadgets 指定で決める:
//   - 'keep'    : 何もしない。owner_id は削除の set null で外れ「大家預かり」になり
//                 道具市には公開のまま残る（既定）。
//   - 'suspend' : 削除前に当人の道具を status='suspended' にして道具市から下げる。
// 著作権の移動は行わない（ADR-006: 著作権は作者に残る／CLA許諾は撤回不可）。

import { isConfigured, json, requireUserId, type Env } from './_shared'

const MARKER = 'x-leave-api'

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
  if (!isConfigured(env)) return json(503, { error: 'leave API is not configured' }, MARKER)

  const callerId = await requireUserId(request, env)
  if (!callerId) return json(401, { error: 'unauthorized' }, MARKER)

  let body: { gadgets?: 'keep' | 'suspend' }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid json' }, MARKER)
  }
  const gadgetsMode = body.gadgets === 'suspend' ? 'suspend' : 'keep'

  try {
    // 最後の大家は退去できない（プラットフォームが管理者不在になるのを防ぐ）
    if ((await callerRole(env, callerId)) === 'admin' && (await adminCount(env)) <= 1) {
      return json(
        409,
        { error: '最後の大家は退去できません。先に別の入居者を大家に指名してください。' },
        MARKER,
      )
    }

    // 「道具も下げる」場合は、owner が外れる前に道具を停止しておく
    if (gadgetsMode === 'suspend') {
      const suspendRes = await fetch(rest(env, `gadgets?owner_id=eq.${callerId}`), {
        method: 'PATCH',
        headers: { ...restHeaders(env), prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'suspended' }),
      })
      if (!suspendRes.ok) {
        const detail = await suspendRes.text().catch(() => '')
        return json(502, { error: `道具の停止に失敗しました: ${detail || `HTTP ${suspendRes.status}`}` }, MARKER)
      }
    }

    // 監査ログ（actor_id は FK なしなので退去後も残る）
    await fetch(rest(env, 'audit_logs'), {
      method: 'POST',
      headers: { ...restHeaders(env), prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: callerId,
        action: 'leave',
        target: callerId,
        detail: { gadgets: gadgetsMode },
      }),
    })

    // auth ユーザー削除 → profiles へ cascade（個人データ削除）＋ 各参照は set null
    const deleteRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${callerId}`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
    if (!deleteRes.ok) {
      const detail = await deleteRes.text().catch(() => '')
      return json(502, { error: `退去処理に失敗しました: ${detail || `HTTP ${deleteRes.status}`}` }, MARKER)
    }

    return json(200, { ok: true }, MARKER)
  } catch {
    return json(502, { error: '退去処理でエラーが発生しました' }, MARKER)
  }
}
