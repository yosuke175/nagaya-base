// Platform-wide AI settings (one API key per user, FR: gadget.ai).
//
// TODO(ADR-005): Phase 1 mock — the key is stored plaintext per device.
// It moves server-side together with the BYOK credentials (AES-GCM in
// Workers) and eventually behind the AI gateway (docs/backlog.md #3,
// ADR-008 candidate). The keyspace is deliberately separate from
// 'gadget-credential:' — this key belongs to the platform, not to any
// single gadget, and is NEVER sent into a gadget iframe (ADR-001).
import { remoteCredentials, useRemoteCredentials } from './credentialsApi'

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
// Account-scoped storage (ADR-005): when signed in and the credentials Pages
// Function is available, the settings live encrypted in `user_credentials`
// and follow the user across devices. Otherwise the localStorage functions
// above act as the per-device fallback.
// ---------------------------------------------------------------------------

const AI_CREDENTIAL_ID = 'platform-ai'

export type AiSettingsScope = 'account' | 'device'

export async function aiSettingsScope(): Promise<AiSettingsScope> {
  return (await useRemoteCredentials()) ? 'account' : 'device'
}

export async function loadAiSettings(): Promise<AiSettings> {
  if (await useRemoteCredentials()) {
    try {
      const raw = await remoteCredentials.get(AI_CREDENTIAL_ID)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AiSettings>
        return {
          apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey ? parsed.apiKey : null,
          model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_AI_MODEL,
        }
      }
      return { apiKey: null, model: DEFAULT_AI_MODEL }
    } catch {
      // API hiccup — fall back to the device copy rather than failing
    }
  }
  return getAiSettings()
}

/** Returns where the settings were stored. */
export async function persistAiSettings(settings: AiSettings): Promise<AiSettingsScope> {
  if (await useRemoteCredentials()) {
    await remoteCredentials.set(AI_CREDENTIAL_ID, JSON.stringify(settings))
    return 'account'
  }
  saveAiSettings(settings)
  return 'device'
}

export async function removeAiSettings(): Promise<void> {
  if (await useRemoteCredentials()) {
    await remoteCredentials.remove(AI_CREDENTIAL_ID)
  }
  clearAiSettings()
}
