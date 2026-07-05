import {
  MSG_HANDSHAKE,
  MSG_HANDSHAKE_ACK,
  MSG_RPC_REQUEST,
  MSG_RPC_RESPONSE,
  MSG_TOOL_INVOKE,
  MSG_TOOL_RESULT,
  PROTOCOL_VERSION,
  STORAGE_QUOTA_BYTES,
  validateStorageKey,
  type GadgetExternalService,
  type GadgetManifest,
  type GadgetPermission,
  type HandshakeAckMessage,
  type RpcRequestMessage,
  type RpcResponseMessage,
  type ToolInvokeMessage,
  type ToolResultMessage,
} from 'gadget-sdk'
import { validateAiRequest, type AiCompleteRequest } from 'gadget-sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentUserId, supabase } from '../auth/supabaseClient'
import { AI_MAX_TOKENS_LIMIT, getAiSettings } from './aiSettings'
import { getAccessToken, remoteCredentials, useRemoteCredentials } from './credentialsApi'

const REQUIRED_MANIFEST_FIELDS = [
  'manifestVersion',
  'id',
  'name',
  'version',
  'entry',
  'permissions',
] as const

// 既定は本番配信の /gadgets/。ADR-012 Phase 2 のプレビューでは /preview/<owner>/<branch>/
// を渡して、本人 fork の作りかけソースを同じホストで動かす。base は必ず "/" 終わり。
const GADGET_BASE = '/gadgets/'

export async function loadGadgetManifest(
  gadgetDir: string,
  base: string = GADGET_BASE,
): Promise<GadgetManifest> {
  const response = await fetch(`${base}${gadgetDir}/manifest.json`)
  if (!response.ok) {
    throw new Error(`manifest.json の取得に失敗しました (HTTP ${response.status})`)
  }
  const manifest = (await response.json()) as GadgetManifest
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined) {
      throw new Error(`manifest.json に必須フィールド "${field}" がありません`)
    }
  }
  return manifest
}

export function gadgetEntryUrl(
  gadgetDir: string,
  manifest: GadgetManifest,
  base: string = GADGET_BASE,
): string {
  return `${base}${gadgetDir}/${manifest.entry}`
}

class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Per-user × per-gadget KV storage (FR-07) on Supabase `gadget_storage`.
 * RLS is the enforcement layer: only the user's own rows, and only for
 * installed gadgets. The 1MB quota (gadget-spec §4) is enforced only by the
 * local mock for now — the server-side check moves to Workers later.
 */
class SupabaseGadgetStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly gadgetId: string,
  ) {}

  async get(key: string): Promise<unknown> {
    const { data, error } = await this.client
      .from('gadget_storage')
      .select('value')
      .eq('gadget_id', this.gadgetId)
      .eq('key', key)
      .maybeSingle()
    if (error) throw new RpcError('storage_error', error.message)
    return data ? (data.value as unknown) : null
  }

  async set(key: string, value: unknown): Promise<void> {
    const { error } = await this.client
      .from('gadget_storage')
      .upsert(
        { user_id: this.userId, gadget_id: this.gadgetId, key, value },
        { onConflict: 'user_id,gadget_id,key' },
      )
    if (error) throw new RpcError('storage_error', error.message)
  }
}

/**
 * localStorage fallback used when Supabase is not configured / signed out
 * (no-login local dev mode). Same behavior over the postMessage protocol.
 */
class MockGadgetStorage {
  private readonly prefix: string

  constructor(gadgetId: string) {
    this.prefix = `gadget-storage:${gadgetId}:`
  }

  get(key: string): unknown {
    const raw = localStorage.getItem(this.prefix + key)
    return raw === null ? null : (JSON.parse(raw) as unknown)
  }

  set(key: string, value: unknown): void {
    const json = JSON.stringify(value)
    if (this.usedBytes(key) + key.length + json.length > STORAGE_QUOTA_BYTES) {
      throw new RpcError(
        'quota_exceeded',
        'ストレージ上限（1ガジェット×1ユーザーあたり1MB）を超えています',
      )
    }
    localStorage.setItem(this.prefix + key, json)
  }

  /** Approximate bytes used by this gadget, excluding `excludeKey`. */
  private usedBytes(excludeKey: string): number {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(this.prefix) || storageKey === this.prefix + excludeKey) {
        continue
      }
      total += storageKey.length - this.prefix.length
      total += localStorage.getItem(storageKey)?.length ?? 0
    }
    return total
  }
}

// ---------------------------------------------------------------------------
// BYOK credential store (mock)
// ---------------------------------------------------------------------------
//
// TODO(ADR-005): Phase 1 mock, plaintext and per-device. In the Supabase
// iteration, credentials move server-side: AES-GCM-encrypted inside Workers
// (key in a Workers Secret) before storage, decrypted only when handed to
// the owning gadget's execution context. The interface stays the same.
// The keyspace is deliberately separate from MockGadgetStorage
// ('gadget-storage:') so gadgets can never read credentials via
// gadget.storage.*.
const CREDENTIAL_PREFIX = 'gadget-credential:'

function credentialKey(gadgetId: string, serviceId: string): string {
  return `${CREDENTIAL_PREFIX}${gadgetId}:${serviceId}`
}

function credentialRemoteId(gadgetId: string, serviceId: string): string {
  return `gadget:${gadgetId}:${serviceId}`
}

// Account-first (AES-GCM encrypted via /api/credentials, ADR-005) with the
// original localStorage mock as the per-device fallback for local dev.
export const credentialStore = {
  async get(gadgetId: string, serviceId: string): Promise<string | null> {
    if (await useRemoteCredentials()) {
      return remoteCredentials.get(credentialRemoteId(gadgetId, serviceId))
    }
    return localStorage.getItem(credentialKey(gadgetId, serviceId))
  },
  async set(gadgetId: string, serviceId: string, value: string): Promise<void> {
    if (await useRemoteCredentials()) {
      await remoteCredentials.set(credentialRemoteId(gadgetId, serviceId), value)
      return
    }
    localStorage.setItem(credentialKey(gadgetId, serviceId), value)
  },
  async remove(gadgetId: string, serviceId: string): Promise<void> {
    if (await useRemoteCredentials()) {
      await remoteCredentials.remove(credentialRemoteId(gadgetId, serviceId))
      return
    }
    localStorage.removeItem(credentialKey(gadgetId, serviceId))
  },
}

export interface GadgetHost {
  dispose(): void
  /** 案内AI（ADR-011）がガジェットのツールを実行する。gadget 側 onToolInvoke が応答。 */
  invokeTool(tool: string, args: Record<string, unknown>): Promise<unknown>
}

const TOOL_INVOKE_TIMEOUT_MS = 20_000

export interface GadgetRpcHandlerOptions {
  /** Called when the gadget asks to open the credential settings UI. */
  onRequestSetup?: (service: GadgetExternalService) => void
}

/**
 * Platform-side endpoint of the gadget protocol (docs/gadget-spec.md §4).
 * Answers the SDK handshake with a dedicated MessagePort, then serves RPC
 * requests on it, enforcing the permissions declared in the manifest.
 *
 * ADR-001: the iframe runs with sandbox="allow-scripts" only, so its origin
 * is opaque — '*' is the only usable targetOrigin. We compensate by checking
 * event.source, and by never sending secrets or user tokens to the frame.
 */
export function createGadgetHost(
  iframe: HTMLIFrameElement,
  manifest: GadgetManifest,
  options?: GadgetRpcHandlerOptions,
): GadgetHost {
  const handleRpc = createGadgetRpcHandler(manifest, options)
  // The SDK re-sends the handshake until acked, so more than one can arrive;
  // each gets its own channel and stale ports simply go unused.
  const ports: MessagePort[] = []
  let activePort: MessagePort | null = null
  let nextInvokeId = 1
  const pendingInvokes = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }
  >()

  const onWindowMessage = (event: MessageEvent) => {
    // Only accept messages coming from this frame's own window.
    if (!iframe.contentWindow || event.source !== iframe.contentWindow) return
    const data = event.data as { type?: string } | undefined
    if (data?.type !== MSG_HANDSHAKE) return

    const channel = new MessageChannel()
    channel.port1.onmessage = (portEvent: MessageEvent) => {
      const message = portEvent.data as { type?: string } | undefined
      // gadget→host RPC 要求
      if (message?.type === MSG_RPC_REQUEST) {
        void handleRpc(portEvent.data as RpcRequestMessage).then((response) =>
          channel.port1.postMessage(response),
        )
        return
      }
      // host→gadget ツール実行の結果（ADR-011）
      if (message?.type === MSG_TOOL_RESULT) {
        const result = portEvent.data as ToolResultMessage
        const entry = pendingInvokes.get(result.id)
        if (!entry) return
        pendingInvokes.delete(result.id)
        window.clearTimeout(entry.timer)
        if (result.ok) entry.resolve(result.result)
        else entry.reject(new Error(result.error?.message ?? 'tool error'))
      }
    }
    ports.push(channel.port1)
    activePort = channel.port1

    const ack: HandshakeAckMessage = {
      type: MSG_HANDSHAKE_ACK,
      protocolVersion: PROTOCOL_VERSION,
      gadgetId: manifest.id,
      grantedPermissions: manifest.permissions,
    }
    iframe.contentWindow.postMessage(ack, '*', [channel.port2])
  }

  window.addEventListener('message', onWindowMessage)
  return {
    dispose() {
      window.removeEventListener('message', onWindowMessage)
      for (const port of ports) port.close()
      ports.length = 0
      activePort = null
      for (const entry of pendingInvokes.values()) {
        window.clearTimeout(entry.timer)
        entry.reject(new Error('gadget closed'))
      }
      pendingInvokes.clear()
    },
    invokeTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (!activePort) {
          reject(new Error('ガジェットが接続されていません'))
          return
        }
        const id = nextInvokeId++
        const timer = window.setTimeout(() => {
          pendingInvokes.delete(id)
          reject(new Error(`ツール実行がタイムアウトしました: ${tool}`))
        }, TOOL_INVOKE_TIMEOUT_MS)
        pendingInvokes.set(id, { resolve, reject, timer })
        const message: ToolInvokeMessage = { type: MSG_TOOL_INVOKE, id, tool, args }
        activePort.postMessage(message)
      })
    },
  }
}

/**
 * Builds the RPC handler for one gadget, enforcing the permissions declared
 * in its manifest. Exported separately so the dispatch logic is testable
 * without a real iframe/postMessage pair.
 */
export function createGadgetRpcHandler(
  manifest: GadgetManifest,
  options?: GadgetRpcHandlerOptions,
): (request: RpcRequestMessage) => Promise<RpcResponseMessage> {
  const granted = new Set<GadgetPermission>(manifest.permissions)

  // Backend chosen lazily on first storage call: Supabase (RLS) when signed
  // in, localStorage mock otherwise.
  let storagePromise: Promise<SupabaseGadgetStorage | MockGadgetStorage> | null = null
  const getStorage = () => {
    storagePromise ??= (async () => {
      const userId = await currentUserId()
      return supabase && userId
        ? new SupabaseGadgetStorage(supabase, userId, manifest.id)
        : new MockGadgetStorage(manifest.id)
    })()
    return storagePromise
  }

  // The externalServices declaration itself is what the user approves
  // (docs/gadget-spec.md §5) — undeclared service ids are rejected here.
  const requireService = (params: Record<string, unknown>): GadgetExternalService => {
    const serviceId = typeof params.serviceId === 'string' ? params.serviceId : ''
    const service = (manifest.externalServices ?? []).find((entry) => entry.id === serviceId)
    if (!service) {
      throw new RpcError(
        'unknown_service',
        `manifest.json の externalServices に "${serviceId}" が宣言されていません`,
      )
    }
    return service
  }

  const dispatch = async (request: RpcRequestMessage): Promise<unknown> => {
    const [namespace] = request.method.split('.')
    if (namespace === 'storage' && !granted.has('storage')) {
      throw new RpcError(
        'permission_denied',
        'manifest.json の permissions に "storage" が宣言されていません',
      )
    }
    if (namespace === 'ai') {
      if (!granted.has('ai')) {
        throw new RpcError(
          'permission_denied',
          'manifest.json の permissions に "ai" が宣言されていません',
        )
      }
      if (request.method === 'ai.complete') {
        try {
          validateAiRequest(request.params.request)
        } catch (error) {
          throw new RpcError(
            'invalid_request',
            error instanceof Error ? error.message : 'invalid ai request',
          )
        }
        return completeWithPlatformAi(request.params.request)
      }
      throw new RpcError('unknown_method', `未対応のメソッドです: ${request.method}`)
    }
    if (namespace === 'services') {
      const service = requireService(request.params)
      switch (request.method) {
        case 'services.getCredential':
          return credentialStore.get(manifest.id, service.id)
        case 'services.requestSetup':
          // Resolves immediately after notifying the UI; the gadget calls
          // getCredential again once the user finished the setup.
          options?.onRequestSetup?.(service)
          return null
        default:
          throw new RpcError('unknown_method', `未対応のメソッドです: ${request.method}`)
      }
    }
    switch (request.method) {
      case 'storage.get': {
        return (await getStorage()).get(requireKey(request.params))
      }
      case 'storage.set': {
        if (request.params.value === undefined) {
          throw new RpcError('invalid_value', 'value が undefined です')
        }
        await (await getStorage()).set(requireKey(request.params), request.params.value)
        return null
      }
      default:
        throw new RpcError('unknown_method', `未対応のメソッドです: ${request.method}`)
    }
  }

  return async (request: RpcRequestMessage): Promise<RpcResponseMessage> => {
    try {
      return { type: MSG_RPC_RESPONSE, id: request.id, ok: true, result: await dispatch(request) }
    } catch (error) {
      const code = error instanceof RpcError ? error.code : 'internal_error'
      const message = error instanceof Error ? error.message : String(error)
      return { type: MSG_RPC_RESPONSE, id: request.id, ok: false, error: { code, message } }
    }
  }
}

/**
 * gadget.ai backend. The key never enters any gadget iframe (ADR-001), and
 * on the account scope it never enters the browser at all: /api/ai decrypts
 * and calls Anthropic server-side (backlog #4, first step toward the ADR-008
 * gateway). The device path below remains for no-login local dev only.
 */
async function completeWithPlatformAi(request: AiCompleteRequest): Promise<string> {
  if (await useRemoteCredentials()) {
    return remoteAiComplete(request)
  }
  return deviceAiComplete(request)
}

/** Production path: server-side proxy — plaintext key stays in the Function. */
async function remoteAiComplete(request: AiCompleteRequest): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new RpcError('ai_error', 'ログインが必要です')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'complete', request }),
  })
  const data = (await response.json()) as { text?: string; error?: string; code?: string }
  if (!response.ok) {
    throw new RpcError(
      data.code === 'ai_not_configured' ? 'ai_not_configured' : 'ai_error',
      data.error ?? `AI APIエラー (HTTP ${response.status})`,
    )
  }
  return String(data.text ?? '')
}

/**
 * Local-dev fallback (no Supabase): key from this device's localStorage,
 * browser-direct call. Anthropic と Google はブラウザ直呼び可。OpenAI は
 * CORS 上ブラウザから直接呼べないため、本番（ログイン環境・/api/ai 経由）を
 * 使ってもらう。※開発用の分岐で、本番はサーバー側 /api/ai が全社対応。
 */
async function deviceAiComplete(request: AiCompleteRequest): Promise<string> {
  const settings = getAiSettings()
  if (!settings.apiKey) {
    throw new RpcError(
      'ai_not_configured',
      'AIのAPIキーが未登録です。プラットフォーム右上の「AI設定」から登録してください',
    )
  }
  const maxTokens = Math.min(request.maxTokens ?? 1000, AI_MAX_TOKENS_LIMIT)

  if (settings.provider === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      settings.model,
    )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: request.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    })
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
    }
    if (!response.ok) throw new RpcError('ai_error', data.error?.message ?? 'Gemini API エラー')
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  }

  if (settings.provider === 'openai') {
    throw new RpcError(
      'ai_error',
      'ローカル開発モードでは OpenAI を直接呼べません（ログイン環境で利用してください）',
    )
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for browser-direct calls; the key owner (the user) opted in.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      ...(request.system ? { system: request.system } : {}),
      messages: request.messages,
    }),
  })
  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new RpcError('ai_error', data.error?.message ?? `AI APIエラー (HTTP ${response.status})`)
  }
  return (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
}

function requireKey(params: Record<string, unknown>): string {
  try {
    validateStorageKey(params.key)
  } catch (error) {
    throw new RpcError('invalid_key', error instanceof Error ? error.message : 'invalid key')
  }
  return params.key
}
