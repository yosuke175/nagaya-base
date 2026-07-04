// Platform-wide AI settings (one API key per user, FR: gadget.ai).
//
// キーは AES-GCM 暗号化してサーバー保管され、/api/ai だけが復号して各社 API を
// 呼ぶ（復号済みキーはブラウザに返さない・iframe にも渡さない: ADR-001/005）。
// 未ログインのローカル開発時のみ localStorage フォールバック（device スコープ）。
import { getAccessToken, useRemoteCredentials } from './credentialsApi'

const AI_SETTINGS_KEY = 'platform-ai-settings'

export type AiProvider = 'anthropic' | 'openai' | 'google'

export const AI_PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'anthropic', label: 'Claude（Anthropic）' },
  { id: 'openai', label: 'OpenAI（ChatGPT）' },
  { id: 'google', label: 'Google（Gemini）' },
]

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
}

/** Hard cap applied to gadget-requested maxTokens. */
export const AI_MAX_TOKENS_LIMIT = 2000

export interface AiSettings {
  provider: AiProvider
  apiKey: string | null
  model: string
}

function normalizeProvider(value: unknown): AiProvider {
  return value === 'openai' || value === 'google' ? value : 'anthropic'
}

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<AiSettings>) : null
    const provider = normalizeProvider(parsed?.provider)
    return {
      provider,
      apiKey: typeof parsed?.apiKey === 'string' && parsed.apiKey.length > 0 ? parsed.apiKey : null,
      model:
        typeof parsed?.model === 'string' && parsed.model.length > 0
          ? parsed.model
          : DEFAULT_AI_MODEL[provider],
    }
  } catch {
    return { provider: 'anthropic', apiKey: null, model: DEFAULT_AI_MODEL.anthropic }
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(
    AI_SETTINGS_KEY,
    JSON.stringify({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model || DEFAULT_AI_MODEL[settings.provider],
    }),
  )
}

export function clearAiSettings(): void {
  localStorage.removeItem(AI_SETTINGS_KEY)
}

// --- account scope (server-side, /api/ai) ---------------------------------

export type AiSettingsScope = 'account' | 'device'

export interface AiStatus {
  scope: AiSettingsScope
  registered: boolean
  provider: AiProvider
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
      const status = await aiApi<{ registered: boolean; provider: string; model: string }>({
        action: 'status',
      })
      const provider = normalizeProvider(status.provider)
      return {
        scope: 'account',
        registered: Boolean(status.registered),
        provider,
        model: status.model || DEFAULT_AI_MODEL[provider],
      }
    } catch {
      // API hiccup — report the device copy rather than failing
    }
  }
  const local = getAiSettings()
  return { scope: 'device', registered: Boolean(local.apiKey), provider: local.provider, model: local.model }
}

/**
 * apiKey may be null on the account scope to update provider/model only
 * (the stored key is kept server-side). Returns where it was stored.
 */
export async function persistAiSettings(settings: {
  provider: AiProvider
  apiKey: string | null
  model: string
}): Promise<AiSettingsScope> {
  if (await useRemoteCredentials()) {
    await aiApi({
      action: 'set',
      provider: settings.provider,
      apiKey: settings.apiKey ?? undefined,
      model: settings.model || DEFAULT_AI_MODEL[settings.provider],
    })
    return 'account'
  }
  if (!settings.apiKey) throw new Error('APIキーを入力してください')
  saveAiSettings({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model || DEFAULT_AI_MODEL[settings.provider],
  })
  return 'device'
}

export async function removeAiSettings(): Promise<void> {
  if (await useRemoteCredentials()) {
    await aiApi({ action: 'delete' })
  }
  clearAiSettings()
}
