// Platform-wide AI settings (one API key per user, FR: gadget.ai).
//
// TODO(ADR-005): Phase 1 mock — the key is stored plaintext per device.
// It moves server-side together with the BYOK credentials (AES-GCM in
// Workers) and eventually behind the AI gateway (docs/backlog.md #3,
// ADR-008 candidate). The keyspace is deliberately separate from
// 'gadget-credential:' — this key belongs to the platform, not to any
// single gadget, and is NEVER sent into a gadget iframe (ADR-001).
import { getAccessToken, useRemoteCredentials } from './credentialsApi'

const AI_SETTINGS_KEY = 'platform-ai-settings'

export const DEFAULT_AI_MODEL = 'claude-haiku-4-5'

/** Hard cap applied to gadget-requested maxTokens. */
export const AI_MAX_TOKENS_LIMIT = 2000

export interface AiSettings {
  apiKey: string | null
  model: string
}

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<AiSettings>) : null
    return {
      apiKey: typeof parsed?.apiKey === 'string' && parsed.apiKey.length > 0 ? parsed.apiKey : null,
      model:
        typeof parsed?.model === 'string' && parsed.model.length > 0
          ? parsed.model
          : DEFAULT_AI_MODEL,
    }
  } catch {
    return { apiKey: null, model: DEFAULT_AI_MODEL }
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(
    AI_SETTINGS_KEY,
    JSON.stringify({ apiKey: settings.apiKey, model: settings.model || DEFAULT_AI_MODEL }),
  )
}

export function clearAiSettings(): void {
  localStorage.removeItem(AI_SETTINGS_KEY)
}

// ---------------------------------------------------------------------------
// Account-scoped settings (ADR-005 / backlog #4): when signed in and the
// Pages Functions are available, the key lives encrypted server-side and is
// ONLY used by /api/ai — the plaintext never reaches the browser. The client
// sees non-secret metadata (registered / model). The localStorage functions
// above remain the per-device fallback for local dev.
// ---------------------------------------------------------------------------

export type AiSettingsScope = 'account' | 'device'

export interface AiStatus {
  scope: AiSettingsScope
  registered: boolean
  model: string
}

async function aiApi<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('ログインが必要です')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `AI API エラー (HTTP ${response.status})`)
  return payload
}

export async function fetchAiStatus(): Promise<AiStatus> {
  if (await useRemoteCredentials()) {
    try {
      const status = await aiApi<{ registered: boolean; model: string }>({ action: 'status' })
      return {
        scope: 'account',
        registered: Boolean(status.registered),
        model: status.model || DEFAULT_AI_MODEL,
      }
    } catch {
      // API hiccup — report the device copy rather than failing
    }
  }
  const local = getAiSettings()
  return { scope: 'device', registered: Boolean(local.apiKey), model: local.model }
}

/**
 * apiKey may be null on the account scope to update the model only
 * (the stored key is kept server-side). Returns where it was stored.
 */
export async function persistAiSettings(settings: {
  apiKey: string | null
  model: string
}): Promise<AiSettingsScope> {
  if (await useRemoteCredentials()) {
    await aiApi({
      action: 'set',
      apiKey: settings.apiKey ?? undefined,
      model: settings.model || DEFAULT_AI_MODEL,
    })
    return 'account'
  }
  if (!settings.apiKey) throw new Error('APIキーを入力してください')
  saveAiSettings({ apiKey: settings.apiKey, model: settings.model || DEFAULT_AI_MODEL })
  return 'device'
}

export async function removeAiSettings(): Promise<void> {
  if (await useRemoteCredentials()) {
    await aiApi({ action: 'delete' })
  }
  clearAiSettings()
}
