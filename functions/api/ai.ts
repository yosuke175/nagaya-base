// Cloudflare Pages Function: /api/ai
//
// Server-side proxy for gadget.ai (backlog #4 — first step toward the
// ADR-008 AI gateway). The user's Anthropic API key is decrypted HERE and
// used to call the Messages API from the server; the plaintext key is never
// returned to any browser. The client only ever receives generated text and
// non-secret metadata (registered / model).
//
// Actions (POST, Authorization: Bearer <Supabase access token>):
//   status   -> { registered, model }
//   set      -> { apiKey?, model? }  apiKey omitted = keep existing key
//   delete   -> removes the stored key
//   complete -> { request: { system?, messages, maxTokens? } } -> { text }

import {
  AI_MAX_TOKENS_LIMIT,
  DEFAULT_AI_MODEL,
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

interface StoredAiSettings {
  apiKey: string
  model: string
}

interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

const MARKER = 'x-ai-api'
const MAX_TOTAL_CONTENT_CHARS = 100_000

function validMessages(messages: unknown): messages is AiMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return false
  let total = 0
  for (const message of messages as Array<Partial<AiMessage>>) {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.length === 0
    ) {
      return false
    }
    total += message.content.length
  }
  return total <= MAX_TOTAL_CONTENT_CHARS
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context

  if (request.method === 'GET') {
    return isConfigured(env)
      ? new Response(null, { status: 204, headers: { [MARKER]: '1' } })
      : new Response(null, { status: 503 })
  }
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, MARKER)
  if (!isConfigured(env)) return json(503, { error: 'AI API is not configured' }, MARKER)

  const userId = await requireUserId(request, env)
  if (!userId) return json(401, { error: 'unauthorized' }, MARKER)

  let body: {
    action?: string
    apiKey?: string
    model?: string
    request?: { system?: string; messages?: unknown; maxTokens?: number }
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(400, { error: 'invalid json' }, MARKER)
  }

  const aad = `${userId}:${PLATFORM_AI_CREDENTIAL_ID}`
  const key = await importAesKey(env.CREDENTIALS_ENCRYPTION_KEY as string)

  const loadSettings = async (): Promise<StoredAiSettings | null> => {
    const row = await getCredentialRow(env, userId, PLATFORM_AI_CREDENTIAL_ID)
    if (!row) return null
    const parsed = JSON.parse(await decryptValue(key, aad, row.ciphertext, row.iv)) as
      Partial<StoredAiSettings>
    if (typeof parsed.apiKey !== 'string' || parsed.apiKey.length === 0) return null
    return {
      apiKey: parsed.apiKey,
      model:
        typeof parsed.model === 'string' && parsed.model.length > 0
          ? parsed.model
          : DEFAULT_AI_MODEL,
    }
  }

  try {
    if (body.action === 'status') {
      const settings = await loadSettings()
      return json(200, {
        registered: settings !== null,
        model: settings?.model ?? DEFAULT_AI_MODEL,
      }, MARKER)
    }

    if (body.action === 'set') {
      if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 500)) {
        return json(400, { error: 'invalid apiKey' }, MARKER)
      }
      if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 100)) {
        return json(400, { error: 'invalid model' }, MARKER)
      }
      const existing = await loadSettings()
      const apiKey = body.apiKey?.trim() || existing?.apiKey
      if (!apiKey) return json(400, { error: 'APIキーを入力してください' }, MARKER)
      const settings: StoredAiSettings = {
        apiKey,
        model: body.model?.trim() || existing?.model || DEFAULT_AI_MODEL,
      }
      await upsertCredentialRow(
        env,
        userId,
        PLATFORM_AI_CREDENTIAL_ID,
        await encryptValue(key, aad, JSON.stringify(settings)),
      )
      return json(200, { ok: true, model: settings.model }, MARKER)
    }

    if (body.action === 'delete') {
      await deleteCredentialRow(env, userId, PLATFORM_AI_CREDENTIAL_ID)
      return json(200, { ok: true }, MARKER)
    }

    if (body.action === 'complete') {
      const aiRequest = body.request
      if (!aiRequest || !validMessages(aiRequest.messages)) {
        return json(400, { error: 'invalid ai request' }, MARKER)
      }
      if (aiRequest.system !== undefined && typeof aiRequest.system !== 'string') {
        return json(400, { error: 'invalid ai request' }, MARKER)
      }
      const settings = await loadSettings()
      if (!settings) {
        return json(400, {
          error: 'AIのAPIキーが未登録です。プラットフォーム右上の「AI設定」から登録してください',
          code: 'ai_not_configured',
        }, MARKER)
      }
      const maxTokens =
        typeof aiRequest.maxTokens === 'number' && aiRequest.maxTokens > 0
          ? Math.min(aiRequest.maxTokens, AI_MAX_TOKENS_LIMIT)
          : 1000

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: maxTokens,
          ...(aiRequest.system ? { system: aiRequest.system } : {}),
          messages: aiRequest.messages,
        }),
      })
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>
        error?: { message?: string }
      }
      if (!response.ok) {
        return json(502, {
          error: data.error?.message ?? `AI APIエラー (HTTP ${response.status})`,
          code: 'ai_error',
        }, MARKER)
      }
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
      return json(200, { text }, MARKER)
    }
  } catch {
    return json(502, { error: 'storage error' }, MARKER)
  }

  return json(400, { error: 'unknown action' }, MARKER)
}
