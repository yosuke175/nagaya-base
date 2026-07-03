// Shared helpers for the Pages Functions (files starting with "_" are not
// routed by Cloudflare Pages). Crypto per ADR-005: AES-GCM, key in a Pages
// Secret, AAD binds each ciphertext to its user/credential row.

export interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  CREDENTIALS_ENCRYPTION_KEY?: string
}

export const PLATFORM_AI_CREDENTIAL_ID = 'platform-ai'
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5'
export const AI_MAX_TOKENS_LIMIT = 2000

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

export function isConfigured(env: Env): boolean {
  return Boolean(
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.CREDENTIALS_ENCRYPTION_KEY,
  )
}

/** Verifies the Supabase access token; the returned id is the ONLY user key used. */
export async function requireUserId(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return null
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY as string, authorization },
  })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: string }
  return typeof user.id === 'string' ? user.id : null
}

export function json(status: number, body: unknown, marker = 'x-credentials-api'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', [marker]: '1' },
  })
}

// --- user_credentials table access (service_role, Workers layer only) ------

function restHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
}

function restUrl(env: Env): string {
  return `${env.SUPABASE_URL}/rest/v1/user_credentials`
}

function rowFilter(userId: string, credentialId: string): string {
  return `user_id=eq.${userId}&credential_id=eq.${encodeURIComponent(credentialId)}`
}

export async function getCredentialRow(
  env: Env,
  userId: string,
  credentialId: string,
): Promise<{ ciphertext: string; iv: string } | null> {
  const response = await fetch(
    `${restUrl(env)}?${rowFilter(userId, credentialId)}&select=ciphertext,iv`,
    { headers: restHeaders(env) },
  )
  if (!response.ok) throw new Error('storage error')
  const rows = (await response.json()) as Array<{ ciphertext: string; iv: string }>
  return rows[0] ?? null
}

export async function upsertCredentialRow(
  env: Env,
  userId: string,
  credentialId: string,
  encrypted: { ciphertext: string; iv: string },
): Promise<void> {
  const response = await fetch(restUrl(env), {
    method: 'POST',
    headers: { ...restHeaders(env), prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, credential_id: credentialId, ...encrypted }),
  })
  if (!response.ok) throw new Error('storage error')
}

export async function deleteCredentialRow(
  env: Env,
  userId: string,
  credentialId: string,
): Promise<void> {
  const response = await fetch(`${restUrl(env)}?${rowFilter(userId, credentialId)}`, {
    method: 'DELETE',
    headers: restHeaders(env),
  })
  if (!response.ok) throw new Error('storage error')
}
