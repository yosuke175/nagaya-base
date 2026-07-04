// Cloudflare Pages Function: /api/ai
//
// gadget.ai のサーバー側プロキシ（複数プロバイダ対応）。ユーザーが AI設定に
// 登録した API キーはここでのみ復号し、サーバーから各社の API を呼ぶ。復号済み
// キーはブラウザに一切返さない（クライアントは生成テキストと非秘匿メタのみ受け取る）。
//
// 対応プロバイダ: anthropic (Claude) / openai (ChatGPT) / google (Gemini)。
// gadget.ai.complete の { system, messages, maxTokens } を各社形式へ変換する。
//
// action (POST, Authorization: Bearer <Supabase access token>):
//   status   -> { registered, provider, model }
//   set      -> { provider?, apiKey?, model? }（apiKey 省略で既存キー維持）
//   delete   -> 登録キーを削除
//   complete -> { request: { system?, messages, maxTokens? } } -> { text }

import {
  AI_MAX_TOKENS_LIMIT,
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

type Provider = 'anthropic' | 'openai' | 'google'

interface StoredAiSettings {
  provider: Provider
  apiKey: string
  model: string
}

interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

const MARKER = 'x-ai-api'
const MAX_TOTAL_CONTENT_CHARS = 100_000
const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google']

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
}

// モデル許可リスト（backlog #3）。高額モデルの誤指定を防ぐ。増補は各社の
// モデル追随（backlog #7）に合わせてここを1行足すだけ。既定モデルは必ず含める。
const ALLOWED_MODELS: Record<Provider, string[]> = {
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  google: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
}

// レート制限（backlog #3）: 1時間あたりの complete 上限（本人のキー保護）
const USAGE_WINDOW_MS = 60 * 60 * 1000
const AI_HOURLY_LIMIT = 120

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
}

/** 直近1時間の利用回数。障害時は 0 を返して AI をブロックしない（fail-open）。 */
async function countRecentUsage(env: Env, userId: string): Promise<number> {
  const since = new Date(Date.now() - USAGE_WINDOW_MS).toISOString()
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ai_usage?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(
      since,
    )}&select=id`,
    { headers: { ...serviceHeaders(env), prefer: 'count=exact', range: '0-0' } },
  )
  if (!response.ok) return 0
  const total = Number((response.headers.get('content-range') ?? '').split('/')[1])
  return Number.isFinite(total) ? total : 0
}

/** 利用記録（透明性＋レート制限の根拠）。best-effort（失敗しても本処理は続ける）。 */
async function logUsage(
  env: Env,
  userId: string,
  provider: Provider,
  model: string,
  inputChars: number,
  outputChars: number,
): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/ai_usage`, {
      method: 'POST',
      headers: { ...serviceHeaders(env), prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        provider,
        model,
        input_chars: inputChars,
        output_chars: outputChars,
      }),
    })
  } catch {
    // 記録失敗は無視（AI応答は既に成功している）
  }
}

function normalizeProvider(value: unknown): Provider {
  return PROVIDERS.includes(value as Provider) ? (value as Provider) : 'anthropic'
}

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

// --- provider adapters: return generated text or throw with a message -------

interface AiRequest {
  system?: string
  messages: AiMessage[]
  maxTokens: number
}

async function callAnthropic(s: StoredAiSettings, req: AiRequest): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: req.maxTokens,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages,
    }),
  })
  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(data.error?.message ?? `Claude API エラー (HTTP ${response.status})`)
  return (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
}

async function callOpenai(s: StoredAiSettings, req: AiRequest): Promise<string> {
  const messages = req.system
    ? [{ role: 'system', content: req.system }, ...req.messages]
    : req.messages
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, max_tokens: req.maxTokens, messages }),
  })
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(data.error?.message ?? `OpenAI API エラー (HTTP ${response.status})`)
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGoogle(s: StoredAiSettings, req: AiRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    s.model,
  )}:generateContent?key=${encodeURIComponent(s.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: req.maxTokens },
    }),
  })
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (!response.ok) throw new Error(data.error?.message ?? `Gemini API エラー (HTTP ${response.status})`)
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
}

function callProvider(settings: StoredAiSettings, req: AiRequest): Promise<string> {
  if (settings.provider === 'openai') return callOpenai(settings, req)
  if (settings.provider === 'google') return callGoogle(settings, req)
  return callAnthropic(settings, req)
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
    provider?: string
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
    const provider = normalizeProvider(parsed.provider)
    return {
      provider,
      apiKey: parsed.apiKey,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL[provider],
    }
  }

  try {
    if (body.action === 'status') {
      const settings = await loadSettings()
      return json(
        200,
        {
          registered: settings !== null,
          provider: settings?.provider ?? 'anthropic',
          model: settings?.model ?? DEFAULT_MODEL[settings?.provider ?? 'anthropic'],
        },
        MARKER,
      )
    }

    if (body.action === 'set') {
      if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 500)) {
        return json(400, { error: 'invalid apiKey' }, MARKER)
      }
      if (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 100)) {
        return json(400, { error: 'invalid model' }, MARKER)
      }
      const existing = await loadSettings()
      const provider = body.provider ? normalizeProvider(body.provider) : (existing?.provider ?? 'anthropic')
      const apiKey = body.apiKey?.trim() || existing?.apiKey
      if (!apiKey) return json(400, { error: 'APIキーを入力してください' }, MARKER)
      // モデル許可リスト（明示指定時のみ検証。未指定は既定/既存を使う）
      const requestedModel = body.model?.trim()
      if (requestedModel && !ALLOWED_MODELS[provider].includes(requestedModel)) {
        return json(
          400,
          { error: `モデル「${requestedModel}」は使えません。利用可能: ${ALLOWED_MODELS[provider].join(', ')}` },
          MARKER,
        )
      }
      // モデル未指定 かつ プロバイダを変えた場合は、そのプロバイダの既定モデルにする
      const model =
        body.model?.trim() ||
        (provider !== existing?.provider ? DEFAULT_MODEL[provider] : existing?.model) ||
        DEFAULT_MODEL[provider]
      const settings: StoredAiSettings = { provider, apiKey, model }
      await upsertCredentialRow(
        env,
        userId,
        PLATFORM_AI_CREDENTIAL_ID,
        await encryptValue(key, aad, JSON.stringify(settings)),
      )
      return json(200, { ok: true, provider, model }, MARKER)
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
        return json(
          400,
          {
            error: 'AIのAPIキーが未登録です。プラットフォーム右上の「AI設定」から登録してください',
            code: 'ai_not_configured',
          },
          MARKER,
        )
      }
      // レート制限（本人のキー保護）: 直近1時間の回数が上限なら 429
      if ((await countRecentUsage(env, userId)) >= AI_HOURLY_LIMIT) {
        return json(
          429,
          {
            error: `AIの利用が上限に達しました（1時間あたり${AI_HOURLY_LIMIT}回）。しばらく待ってからお試しください。`,
            code: 'ai_rate_limited',
          },
          MARKER,
        )
      }
      const maxTokens =
        typeof aiRequest.maxTokens === 'number' && aiRequest.maxTokens > 0
          ? Math.min(aiRequest.maxTokens, AI_MAX_TOKENS_LIMIT)
          : 1000
      try {
        const text = await callProvider(settings, {
          system: aiRequest.system,
          messages: aiRequest.messages,
          maxTokens,
        })
        const inputChars =
          (aiRequest.system?.length ?? 0) +
          aiRequest.messages.reduce((sum, m) => sum + m.content.length, 0)
        await logUsage(env, userId, settings.provider, settings.model, inputChars, text.length)
        return json(200, { text }, MARKER)
      } catch (error) {
        return json(
          502,
          { error: error instanceof Error ? error.message : 'AI API エラー', code: 'ai_error' },
          MARKER,
        )
      }
    }
  } catch {
    return json(502, { error: 'storage error' }, MARKER)
  }

  return json(400, { error: 'unknown action' }, MARKER)
}
