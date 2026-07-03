// Cloudflare Pages Function: /api/credentials
//
// Server-side encrypted credential store (ADR-005) for gadget BYOK
// credentials. The client sends a Supabase access token; this function
// verifies it, AES-GCM-encrypts the value with a key held in a Pages
// Secret, and stores the ciphertext in `user_credentials` via service_role.
// service_role and the encryption key exist ONLY here (Workers layer) —
// never in platform/ client code (CLAUDE.md DO NOT 1).
//
// The platform AI key (credential_id "platform-ai") is NOT accessible here
// at all — it is managed exclusively by /api/ai, which never returns the
// plaintext key to the browser (security review 2026-07-03, backlog #4).
//
// Required Pages environment: see functions/api/_shared.ts.

import {
  PLATFORM_AI_CREDENTIAL_ID,
  decryptValue,
  deleteCredentialRow,
  encryptValue,
  getCredentialRow,
  importAesKey,
  isConfigured,
  json,
  requireUserId,
  upsertCredentialRow,
  type Env,
} from './_shared'

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  // Health probe: the client uses the marker header to decide between
  // account storage (here) and the per-device localStorage fallback.
  if (request.method === 'GET') {
    return isConfigured(env)
      ? new Response(null, { status: 204, headers: { 'x-credentials-api': '1' } })
      : new Response(null, { status: 503 })
  }
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' })
  if (!isConfigured(env)) return json(503, { error: 'credentials API is not configured' })

  const userId = await requireUserId(request, env)
  if (!userId) return json(401, { error: 'unauthorized' })

  let body: { action?: string; credentialId?: string; value?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid json' })
  }
  const credentialId = body.credentialId ?? ''
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(credentialId)) {
    return json(400, { error: 'invalid credentialId' })
  }
  if (credentialId === PLATFORM_AI_CREDENTIAL_ID) {
    // The AI key never round-trips through the browser — /api/ai only.
    return json(403, { error: 'platform-ai は /api/ai 経由でのみ操作できます' })
  }

  const aad = `${userId}:${credentialId}`
  const key = await importAesKey(env.CREDENTIALS_ENCRYPTION_KEY as string)

  try {
    if (body.action === 'get') {
      const row = await getCredentialRow(env, userId, credentialId)
      if (!row) return json(200, { value: null })
      try {
        return json(200, { value: await decryptValue(key, aad, row.ciphertext, row.iv) })
      } catch {
        return json(500, { error: 'decrypt failed' })
      }
    }

    if (body.action === 'set') {
      if (typeof body.value !== 'string' || body.value.length === 0 || body.value.length > 10000) {
        return json(400, { error: 'invalid value' })
      }
      await upsertCredentialRow(env, userId, credentialId, await encryptValue(key, aad, body.value))
      return json(200, { ok: true })
    }

    if (body.action === 'delete') {
      await deleteCredentialRow(env, userId, credentialId)
      return json(200, { ok: true })
    }
  } catch {
    return json(502, { error: 'storage error' })
  }

  return json(400, { error: 'unknown action' })
}
