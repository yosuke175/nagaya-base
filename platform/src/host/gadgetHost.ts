import {
  MSG_HANDSHAKE,
  MSG_HANDSHAKE_ACK,
  MSG_RPC_REQUEST,
  MSG_RPC_RESPONSE,
  PROTOCOL_VERSION,
  STORAGE_QUOTA_BYTES,
  validateStorageKey,
  type GadgetManifest,
  type GadgetPermission,
  type HandshakeAckMessage,
  type RpcRequestMessage,
  type RpcResponseMessage,
} from 'gadget-sdk'

const REQUIRED_MANIFEST_FIELDS = [
  'manifestVersion',
  'id',
  'name',
  'version',
  'entry',
  'permissions',
] as const

export async function loadGadgetManifest(gadgetDir: string): Promise<GadgetManifest> {
  const response = await fetch(`/gadgets/${gadgetDir}/manifest.json`)
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

export function gadgetEntryUrl(gadgetDir: string, manifest: GadgetManifest): string {
  return `/gadgets/${gadgetDir}/${manifest.entry}`
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
 * Mock of the per-user × per-gadget KV storage (FR-07), backed by
 * localStorage so the demo survives reloads. The real implementation moves
 * to Supabase `gadget_storage` behind RLS in a later iteration — the
 * postMessage protocol stays identical, so gadgets won't notice the swap.
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

export interface GadgetHost {
  dispose(): void
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
): GadgetHost {
  const handleRpc = createGadgetRpcHandler(manifest)
  // The SDK re-sends the handshake until acked, so more than one can arrive;
  // each gets its own channel and stale ports simply go unused.
  const ports: MessagePort[] = []

  const onWindowMessage = (event: MessageEvent) => {
    // Only accept messages coming from this frame's own window.
    if (!iframe.contentWindow || event.source !== iframe.contentWindow) return
    const data = event.data as { type?: string } | undefined
    if (data?.type !== MSG_HANDSHAKE) return

    const channel = new MessageChannel()
    channel.port1.onmessage = (rpcEvent: MessageEvent) => {
      const request = rpcEvent.data as RpcRequestMessage | undefined
      if (request?.type !== MSG_RPC_REQUEST) return
      channel.port1.postMessage(handleRpc(request))
    }
    ports.push(channel.port1)

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
): (request: RpcRequestMessage) => RpcResponseMessage {
  const storage = new MockGadgetStorage(manifest.id)
  const granted = new Set<GadgetPermission>(manifest.permissions)

  const dispatch = (request: RpcRequestMessage): unknown => {
    const [namespace] = request.method.split('.')
    if (namespace === 'storage' && !granted.has('storage')) {
      throw new RpcError(
        'permission_denied',
        'manifest.json の permissions に "storage" が宣言されていません',
      )
    }
    switch (request.method) {
      case 'storage.get': {
        return storage.get(requireKey(request.params))
      }
      case 'storage.set': {
        if (request.params.value === undefined) {
          throw new RpcError('invalid_value', 'value が undefined です')
        }
        storage.set(requireKey(request.params), request.params.value)
        return null
      }
      default:
        throw new RpcError('unknown_method', `未対応のメソッドです: ${request.method}`)
    }
  }

  return (request: RpcRequestMessage): RpcResponseMessage => {
    try {
      return { type: MSG_RPC_RESPONSE, id: request.id, ok: true, result: dispatch(request) }
    } catch (error) {
      const code = error instanceof RpcError ? error.code : 'internal_error'
      const message = error instanceof Error ? error.message : String(error)
      return { type: MSG_RPC_RESPONSE, id: request.id, ok: false, error: { code, message } }
    }
  }
}

function requireKey(params: Record<string, unknown>): string {
  try {
    validateStorageKey(params.key)
  } catch (error) {
    throw new RpcError('invalid_key', error instanceof Error ? error.message : 'invalid key')
  }
  return params.key
}
