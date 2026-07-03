// Cloudflare Pages Function: /api/credentials
//
// Server-side encrypted credential store (ADR-005). The client sends a
// Supabase access token; this function verifies it, AES-GCM-encrypts the
// value with a key held in a Pages Secret, and stores the ciphertext in the
// `user_credentials` table via service_role. service_role and the encryption
// key exist ONLY here (Workers layer) — never in platform/ client code
// (CLAUDE.md DO NOT 1).
//
// NOTE: this directory must live at the repo root (Cloudflare Pages resolves
// `functions/` relative to the configured root directory, which is `/`).
//
// Required Pages environment (Settings > Variables and Secrets):
//   SUPABASE_URL                 plaintext
//   SUPABASE_SERVICE_ROLE_KEY    secret
//   CREDENTIALS_ENCRYPTION_KEY   secret — base64 of 32 random bytes

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  CREDENTIALS_ENCRYPTION_KEY?: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function b64encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function b64decode(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

export async function importAesKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64decode(base64Key), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/** AAD binds the ciphertext to its owner/row — swapped rows fail to decrypt. */
export async function encryptValue(
  key: CryptoKey,
  aad: string,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: textEncoder.encode(aad) },
    key,
    textEncoder.encode(plaintext),
  )
  return { ciphertext: b64encode(new Uint8Array(encrypted)), iv: b64encode(iv) }
}

export async function decryptValue(
  key: CryptoKey,
  aad: string,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv), additionalData: textEncoder.encode(aad) },
    key,
    b64decode(ciphertext),
  )
  return textDecoder.decode(decrypted)
}

function isConfigured(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.CREDENTIALS_ENCRYPTION_KEY)
}

async function requireUserId(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return null
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY as string, authorization },
  })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: string }
  return typeof user.id === 'string' ? user.id : null
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-credentials-api': '1' },
  })
}

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

  const restUrl = `${env.SUPABASE_URL}/rest/v1/user_credentials`
  const restHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
  const aad = `${userId}:${credentialId}`
  const key = await importAesKey(env.CREDENTIALS_ENCRYPTION_KEY as string)
  const rowFilter = `user_id=eq.${userId}&credential_id=eq.${encodeURIComponent(credentialId)}`

  if (body.action === 'get') {
    const response = await fetch(`${restUrl}?${rowFilter}&select=ciphertext,iv`, {
      headers: restHeaders,
    })
    if (!response.ok) return json(502, { error: 'storage error' })
    const rows = (await response.json()) as Array<{ ciphertext: string; iv: string }>
    if (rows.length === 0) return json(200, { value: null })
    try {
      return json(200, { value: await decryptValue(key, aad, rows[0].ciphertext, rows[0].iv) })
    } catch {
      return json(500, { error: 'decrypt failed' })
    }
  }

  if (body.action === 'set') {
    if (typeof body.value !== 'string' || body.value.length === 0 || body.value.length > 10000) {
      return json(400, { error: 'invalid value' })
    }
    const encrypted = await encryptValue(key, aad, body.value)
    const response = await fetch(restUrl, {
      method: 'POST',
      headers: { ...restHeaders, prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, credential_id: credentialId, ...encrypted }),
    })
    if (!response.ok) return json(502, { error: 'storage error' })
    return json(200, { ok: true })
  }

  if (body.action === 'delete') {
    const response = await fetch(`${restUrl}?${rowFilter}`, {
      method: 'DELETE',
      headers: restHeaders,
    })
    if (!response.ok) return json(502, { error: 'storage error' })
    return json(200, { ok: true })
  }

  return json(400, { error: 'unknown action' })
}
