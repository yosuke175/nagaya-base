import { supabase } from '../auth/supabaseClient'

// Client for the /api/credentials Pages Function (server-side AES-GCM
// storage, ADR-005). In local dev (vite has no Pages Functions runtime) or
// while the function is unconfigured, remote storage reports unavailable and
// callers fall back to per-device localStorage.

let availability: Promise<boolean> | null = null

function remoteCredentialsAvailable(): Promise<boolean> {
  availability ??= (async () => {
    try {
      const response = await fetch('/api/credentials', { method: 'GET' })
      // The SPA fallback would answer 200/html here — require the marker.
      return response.headers.get('x-credentials-api') === '1'
    } catch {
      return false
    }
  })()
  return availability
}

/** True when credentials should go to the account store (signed in + API up). */
export async function useRemoteCredentials(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  if (!data.session) return false
  return remoteCredentialsAvailable()
}

/** Supabase access token for calling the Pages Functions, or null. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function callApi(
  action: 'get' | 'set' | 'delete',
  credentialId: string,
  value?: string,
): Promise<string | null> {
  const { data } = await supabase!.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ログインが必要です')
  const response = await fetch('/api/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, credentialId, value }),
  })
  const payload = (await response.json()) as { value?: string | null; error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? `credentials API エラー (HTTP ${response.status})`)
  }
  return payload.value ?? null
}

export const remoteCredentials = {
  get: (credentialId: string) => callApi('get', credentialId),
  set: async (credentialId: string, value: string) => {
    await callApi('set', credentialId, value)
  },
  remove: async (credentialId: string) => {
    await callApi('delete', credentialId)
  },
}
