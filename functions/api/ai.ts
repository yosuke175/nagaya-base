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

// 概算コスト（USD / 100万トークン, in/out）。正確な課金は各社ダッシュボード参照。
// モデル追随は backlog（#7）。未知モデルは既定値でざっくり見積る。
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
}
const EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_PRICE = { in: 1, out: 5 }
// 文字数からの粗いトークン換算（日英混在の中間値）。あくまで「概算」。
const CHARS_PER_TOKEN = 4

function estCostUsd(model: string, inputChars: number, outputChars: number): number {
  const price = PRICE_PER_MTOK[model] ?? DEFAULT_PRICE
  const inTok = inputChars / CHARS_PER_TOKEN
  const outTok = outputChars / CHARS_PER_TOKEN
  return (inTok * price.in + outTok * price.out) / 1_000_000
}

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

/** 利用記録（透明性＋レート制限の根拠＋概算コスト）。best-effort。 */
async function logUsage(
  env: Env,
  userId: string,
  provider: Provider,
  model: string,
  inputChars: number,
  outputChars: number,
  purpose: 'gadget' | 'guide' | 'embed' = 'gadget',
  keyOwner: 'self' | 'platform' = 'self',
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
        purpose,
        key_owner: keyOwner,
        est_cost_usd: estCostUsd(model, inputChars, outputChars),
      }),
    })
  } catch {
    // 記録失敗は無視（AI応答は既に成功している）
  }
}

// 案内AI（段1・ステートレス）の「状態票」。対話のたびシステムが DB から現在状態を
// 引いてシステムプロンプトに添える（AIは覚えない、毎回渡す）。ADR-010。
async function buildStateTicket(env: Env, userId: string): Promise<string> {
  const get = async (path: string): Promise<unknown[]> => {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: serviceHeaders(env),
    })
    return response.ok ? ((await response.json()) as unknown[]) : []
  }
  const profiles = (await get(
    `profiles?id=eq.${userId}&select=display_name,role,visit_count,last_visit_at`,
  )) as Array<{ display_name: string; role: string; visit_count: number; last_visit_at: string | null }>
  const installs = (await get(`installations?user_id=eq.${userId}&select=gadget_id`)) as Array<{
    gadget_id: string
  }>
  const owned = (await get(
    `gadgets?owner_id=eq.${userId}&status=eq.published&select=id`,
  )) as Array<{ id: string }>
  const p = profiles[0]
  return [
    `- 呼び名: ${p?.display_name ?? '入居者'}（役割: ${p?.role ?? 'user'}）`,
    `- 来訪: ${p?.visit_count ?? 0}回目${p?.last_visit_at ? ` / 前回 ${p.last_visit_at.slice(0, 10)}` : ''}`,
    `- 部屋に入れている道具: ${installs.length ? installs.map((i) => i.gadget_id).join(', ') : 'なし'}`,
    `- 公開中の自作道具: ${owned.length}件`,
  ].join('\n')
}

// クエリ埋め込み（プラットフォーム保有キー・OpenAI）。未設定/失敗時は null（RAGスキップ）。
async function embedQuery(env: Env, text: string): Promise<number[] | null> {
  if (!env.PLATFORM_EMBEDDING_KEY) return null
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.PLATFORM_EMBEDDING_KEY}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { data?: Array<{ embedding: number[] }> }
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

// 近傍チャンク検索（match_doc_chunks RPC）。失敗時は空配列（RAGなしで続行）。
async function retrieveChunks(
  env: Env,
  embedding: number[],
): Promise<Array<{ source_path: string; content: string }>> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_doc_chunks`, {
      method: 'POST',
      headers: { ...serviceHeaders(env), prefer: 'return=representation' },
      body: JSON.stringify({ query_embedding: `[${embedding.join(',')}]`, match_count: 6 }),
    })
    if (!response.ok) return []
    return (await response.json()) as Array<{ source_path: string; content: string }>
  } catch {
    return []
  }
}

async function buildGuideSystemPrompt(
  env: Env,
  userId: string,
  chunks: Array<{ source_path: string; content: string }>,
  context?: { viewLabel?: string },
): Promise<string> {
  const state = await buildStateTicket(env, userId)
  const docs = chunks.length
    ? [
        '# 長屋の資料（関連する箇所。まずここから答える。該当が無ければ「案内所」を案内する）',
        ...chunks.map((c, i) => `【${i + 1}】(${c.source_path})\n${c.content}`),
      ].join('\n')
    : '# 長屋の資料\n（関連資料は見つかりませんでした。確信が無いことは断定せず、「案内所」を勧めてよい）'
  const now =
    typeof context?.viewLabel === 'string' && context.viewLabel.length <= 20
      ? `# 今の状況\n- ユーザーが今見ている画面: ${context.viewLabel}`
      : ''
  return [
    'あなたは「長屋（NAGAYA-BASE）」の案内AIです。入居者が道具（ガジェット）を活用するのを助ける、親切で簡潔な案内役。',
    '# 役割・態度',
    '- 長屋の使い方のQ&A、道具のインストール伴走（手順は各道具のSETUPに従って案内）。',
    '- やさしく短く。専門用語は避ける。分からないことは正直に「分かりません」と言う。',
    '- ガジェットの操作代行や自動実行はしない。詳しくは「案内所」の記事を見るよう促してよい。',
    '- 下の「長屋の資料」に書かれていることを根拠に答える。資料に無い断定はしない。',
    '# 長屋の語彙',
    '- 自分の部屋=ログイン後の主画面 / 棚=部屋の中の道具置き場 / 道具市=道具のカタログ / 工房=道具をつくる人の作業場 / 入居者=メンバー / 回覧板・長屋暦・案内所=情報レイヤー。',
    '# 操作の提案（任意・段2）',
    '- 画面移動やインストールを勧めたいときは、回答の最後に「1つだけ」操作提案を書ける。形式は次のコードブロック:',
    '  ```nagaya-action',
    '  {"type":"open","view":"道具市"}',
    '  ```',
    '- 使える type: install(gadgetId=道具ID) / open(view=部屋・道具市・入居者・案内所・工房・回覧板・長屋暦) / help(article=記事ID 例05-ai) / ai-settings。',
    '- 該当しなければ書かない。**あなたは実行しない**。ユーザーが承認ボタンを押して初めて実行される。提案は本文でも一言添える（例:「道具市を開きますか？」）。',
    now,
    '# 利用者の状態（システムが毎回渡す。あなたは会話を記憶しない＝このセッション内だけ覚えている）',
    state,
    docs,
  ]
    .filter(Boolean)
    .join('\n')
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
    context?: { viewLabel?: string }
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

    if (body.action === 'guide') {
      // 案内AI（段1・ステートレス）。system は状態票つきでサーバーが組む（クライアントは送らない）。
      const aiRequest = body.request
      if (!aiRequest || !validMessages(aiRequest.messages)) {
        return json(400, { error: 'invalid ai request' }, MARKER)
      }
      const settings = await loadSettings()
      if (!settings) {
        return json(
          400,
          {
            error: 'AIのAPIキーが未登録です。工房の「AI設定」から登録すると案内AIが使えます（任意）',
            code: 'ai_not_configured',
          },
          MARKER,
        )
      }
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
      // RAG: 直近のユーザー発話を埋め込み、長屋の .md から近いチャンクを取り出す。
      // 埋め込みキー未設定/失敗時は RAG なしで続行（案内AIは動く）。
      const lastUser =
        [...aiRequest.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const embedding = await embedQuery(env, lastUser)
      const chunks = embedding ? await retrieveChunks(env, embedding) : []
      if (embedding) {
        // 埋め込みは運営分（プラットフォームキー）として記録
        await logUsage(env, userId, 'openai', EMBEDDING_MODEL, lastUser.length, 0, 'embed', 'platform')
      }
      const system = await buildGuideSystemPrompt(env, userId, chunks, body.context)
      const maxTokens =
        typeof aiRequest.maxTokens === 'number' && aiRequest.maxTokens > 0
          ? Math.min(aiRequest.maxTokens, AI_MAX_TOKENS_LIMIT)
          : 800
      try {
        const text = await callProvider(settings, { system, messages: aiRequest.messages, maxTokens })
        const inputChars =
          system.length + aiRequest.messages.reduce((sum, m) => sum + m.content.length, 0)
        await logUsage(env, userId, settings.provider, settings.model, inputChars, text.length, 'guide')
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
