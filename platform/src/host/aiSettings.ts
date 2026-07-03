// Platform-wide AI settings (one API key per user, FR: gadget.ai).
//
// TODO(ADR-005): Phase 1 mock — the key is stored plaintext per device.
// It moves server-side together with the BYOK credentials (AES-GCM in
// Workers) and eventually behind the AI gateway (docs/backlog.md #3,
// ADR-008 candidate). The keyspace is deliberately separate from
// 'gadget-credential:' — this key belongs to the platform, not to any
// single gadget, and is NEVER sent into a gadget iframe (ADR-001).
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
