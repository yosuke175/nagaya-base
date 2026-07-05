/**
 * gadget-sdk — the only communication channel between a gadget (sandboxed
 * iframe) and the platform. The public contract for gadget developers is
 * docs/gadget-spec.md; do not change the protocol without updating it.
 *
 * Security model (docs/architecture.md ADR-001):
 * - Gadgets run in <iframe sandbox="allow-scripts"> with an opaque origin.
 * - All platform features are RPC over postMessage + MessageChannel.
 * - No user token or platform credential ever crosses this boundary.
 */

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Protocol types (also imported by the platform-side host)
// ---------------------------------------------------------------------------

export type GadgetPermission =
  | 'storage'
  | 'notify'
  | 'profile'
  | 'microphone'
  | 'ai'
  | 'ai-tools';

/** AIに開ける「道具（ツール）」の宣言（spec §9 / ADR-011）。read=読み取り専用 / act=操作。 */
export interface GadgetAiTool {
  name: string;
  description: string;
  kind: 'read' | 'act';
  /** 引数の最小スキーマ（型と必須）。省略可 */
  params?: Record<string, { type: 'string' | 'number' | 'boolean'; required?: boolean }>;
  /** act は既定で承認必須。read も明示的に承認を求めたいとき true */
  requiresConfirm?: boolean;
}

export type GadgetSize = 'small' | 'medium' | 'large' | 'full';

/** External service declaration — docs/gadget-spec.md §3 */
export interface GadgetExternalService {
  id: string;
  name: string;
  auth: 'byok';
  /** Allowed origins for this service (spec v1.1+). */
  baseUrls?: string[];
  /** Legacy single-URL form (spec v1.0) — still accepted. */
  baseUrl?: string;
  purpose: string;
  /**
   * What to paste into the credential field, in one short line (spec v1.5+).
   * Shown verbatim in the platform's credential dialog so the user knows the
   * exact format. Example: "WebAppのURL␣合言葉（半角スペース区切り）".
   */
  setupHint?: string;
  /** Link to full setup instructions (spec v1.5+). Shown as a dialog link. */
  setupUrl?: string;
}

/** Normalizes baseUrls / legacy baseUrl into one list. */
export function externalServiceBaseUrls(service: GadgetExternalService): string[] {
  if (service.baseUrls && service.baseUrls.length > 0) return service.baseUrls;
  return service.baseUrl ? [service.baseUrl] : [];
}

/** manifest.json schema — docs/gadget-spec.md §3 */
export interface GadgetManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; contact: string };
  entry: string;
  /** Optional catalog card image, relative to the gadget root (spec v1.4+). */
  icon?: string;
  size: { default: GadgetSize; supported: GadgetSize[] };
  permissions: GadgetPermission[];
  externalServices?: GadgetExternalService[];
  /** 案内AIに開けるツール（spec §9 / ADR-011）。宣言＋permission 'ai-tools' ＋ユーザー承認で有効 */
  aiTools?: GadgetAiTool[];
}

export const MSG_HANDSHAKE = 'gadget:handshake';
export const MSG_HANDSHAKE_ACK = 'platform:handshake-ack';
export const MSG_RPC_REQUEST = 'gadget:rpc-request';
export const MSG_RPC_RESPONSE = 'platform:rpc-response';
// ホスト→ガジェットのツール実行（ADR-011）。案内AIの判断でホストが呼び、ガジェットが応答する。
export const MSG_TOOL_INVOKE = 'platform:tool-invoke';
export const MSG_TOOL_RESULT = 'gadget:tool-result';

export interface ToolInvokeMessage {
  type: typeof MSG_TOOL_INVOKE;
  id: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: typeof MSG_TOOL_RESULT;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: { message: string };
}

/** onToolInvoke に渡される呼び出し内容 */
export interface ToolInvocation {
  name: string;
  args: Record<string, unknown>;
}

export interface HandshakeMessage {
  type: typeof MSG_HANDSHAKE;
  protocolVersion: number;
}

export interface HandshakeAckMessage {
  type: typeof MSG_HANDSHAKE_ACK;
  protocolVersion: number;
  gadgetId: string;
  grantedPermissions: GadgetPermission[];
}

export interface RpcRequestMessage {
  type: typeof MSG_RPC_REQUEST;
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface RpcResponseMessage {
  type: typeof MSG_RPC_RESPONSE;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Limits and validation (docs/gadget-spec.md §4)
// ---------------------------------------------------------------------------

export const STORAGE_KEY_MAX_LENGTH = 128;
export const STORAGE_QUOTA_BYTES = 1024 * 1024;
export const CALL_TIMEOUT_MS = 10_000;
/** ai.complete goes out to an external AI API — it gets a longer budget. */
export const AI_CALL_TIMEOUT_MS = 30_000;

const HANDSHAKE_RETRY_MS = 100;

export function validateStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('storage key must be a non-empty string');
  }
  if (key.length > STORAGE_KEY_MAX_LENGTH) {
    throw new Error(
      `storage key must be at most ${STORAGE_KEY_MAX_LENGTH} characters`,
    );
  }
}

export function ensureJsonSerializable(value: unknown): void {
  if (value === undefined) {
    throw new Error('storage value must not be undefined');
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error('storage value must be JSON-serializable (no circular references)');
  }
  if (json === undefined) {
    throw new Error('storage value must be JSON-serializable');
  }
}

// ---------------------------------------------------------------------------
// Public gadget API (docs/gadget-spec.md §4)
// ---------------------------------------------------------------------------

export interface GadgetStorage {
  /** Returns the stored value, or null if the key does not exist. */
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

export interface GadgetServices {
  /**
   * Returns the user's credential for a service declared in
   * manifest.externalServices, or null if the user has not set it up yet.
   */
  getCredential(serviceId: string): Promise<string | null>;
  /**
   * Asks the platform to open the credential settings UI for the service.
   * Resolves once the UI is open (not when the user finishes) — call
   * getCredential again after the user completed the setup.
   */
  requestSetup(serviceId: string): Promise<void>;
}

export interface Gadget {
  storage: GadgetStorage;
  services: GadgetServices;
  ai: GadgetAi;
}

export function validateServiceId(serviceId: unknown): asserts serviceId is string {
  if (typeof serviceId !== 'string' || serviceId.length === 0) {
    throw new Error('serviceId must be a non-empty string');
  }
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompleteRequest {
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  /**
   * 用途ヒント（spec v1.6+）。モデル名は指定しない: プラットフォームが
   * `tier × ユーザーのプロバイダ` を具体モデルに解決する（提供元非依存）。
   *   'fast'  … 速い/安い（オートコンプリート等）
   *   'smart' … 賢い（要約・推論等）
   * 省略時はユーザーが AI設定 で選んだモデルを使う。
   */
  tier?: 'fast' | 'smart';
}

export interface GadgetAi {
  /**
   * Text generation via the AI the user registered on the platform.
   * The API key stays on the platform side — it never enters the iframe
   * (ADR-001). Returns the generated text only.
   */
  complete(request: AiCompleteRequest): Promise<string>;
  /**
   * 案内AIからのツール実行に応答するハンドラを登録する（ADR-011）。
   * manifest.aiTools で宣言したツールが呼ばれる。戻り値は JSON 化できる値。
   * 1つ登録すれば全ツールをここで name で分岐して処理する。
   */
  onToolInvoke(handler: (call: ToolInvocation) => Promise<unknown> | unknown): void;
}

export function validateAiRequest(request: unknown): asserts request is AiCompleteRequest {
  const candidate = request as Partial<AiCompleteRequest> | null | undefined;
  if (!candidate || !Array.isArray(candidate.messages) || candidate.messages.length === 0) {
    throw new Error('ai.complete requires a non-empty messages array');
  }
  for (const message of candidate.messages) {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.length === 0
    ) {
      throw new Error('each message needs role ("user"|"assistant") and non-empty content');
    }
  }
  if (candidate.system !== undefined && typeof candidate.system !== 'string') {
    throw new Error('system must be a string');
  }
  if (
    candidate.maxTokens !== undefined &&
    (typeof candidate.maxTokens !== 'number' || candidate.maxTokens <= 0)
  ) {
    throw new Error('maxTokens must be a positive number');
  }
  if (candidate.tier !== undefined && candidate.tier !== 'fast' && candidate.tier !== 'smart') {
    throw new Error("tier must be 'fast' or 'smart'");
  }
}

/**
 * Performs the handshake with the platform and returns the gadget API.
 * Must be called from inside the platform's dashboard iframe; rejects after
 * 10 seconds if the platform does not answer.
 */
export async function createGadget(): Promise<Gadget> {
  if (typeof window === 'undefined' || window.parent === window) {
    throw new Error(
      'createGadget() must run inside the platform dashboard iframe',
    );
  }
  const { port } = await performHandshake();
  const { call, handleResponse } = createRpcClient(port);

  // 案内AIからのツール実行ハンドラ（onToolInvoke で登録）
  let toolHandler: ((call: ToolInvocation) => Promise<unknown> | unknown) | null = null;
  const handleToolInvoke = async (msg: ToolInvokeMessage): Promise<void> => {
    let result: unknown;
    let error: { message: string } | undefined;
    try {
      if (!toolHandler) throw new Error('このガジェットはツールに応答しません（onToolInvoke 未登録）');
      result = await toolHandler({ name: msg.tool, args: msg.args ?? {} });
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }
    const response: ToolResultMessage = { type: MSG_TOOL_RESULT, id: msg.id, ok: !error, result, error };
    port.postMessage(response);
  };

  // gadget→host の応答と、host→gadget のツール実行を1つのハンドラで捌く
  port.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string } | undefined;
    if (data?.type === MSG_TOOL_INVOKE) {
      void handleToolInvoke(event.data as ToolInvokeMessage);
      return;
    }
    handleResponse(event.data as Partial<RpcResponseMessage>);
  };

  return {
    storage: {
      async get<T = unknown>(key: string): Promise<T | null> {
        validateStorageKey(key);
        const result = await call('storage.get', { key });
        return (result ?? null) as T | null;
      },
      async set(key: string, value: unknown): Promise<void> {
        validateStorageKey(key);
        ensureJsonSerializable(value);
        await call('storage.set', { key, value });
      },
    },
    services: {
      async getCredential(serviceId: string): Promise<string | null> {
        validateServiceId(serviceId);
        const result = await call('services.getCredential', { serviceId });
        return (result ?? null) as string | null;
      },
      async requestSetup(serviceId: string): Promise<void> {
        validateServiceId(serviceId);
        await call('services.requestSetup', { serviceId });
      },
    },
    ai: {
      async complete(request: AiCompleteRequest): Promise<string> {
        validateAiRequest(request);
        const result = await call(
          'ai.complete',
          {
            request: {
              system: request.system,
              messages: request.messages,
              maxTokens: request.maxTokens,
              tier: request.tier,
            },
          },
          AI_CALL_TIMEOUT_MS,
        );
        return String(result ?? '');
      },
      onToolInvoke(handler: (call: ToolInvocation) => Promise<unknown> | unknown): void {
        toolHandler = handler;
      },
    },
  };
}

function performHandshake(): Promise<{
  ack: HandshakeAckMessage;
  port: MessagePort;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timer = 0;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as Partial<HandshakeAckMessage> | undefined;
      if (!data || data.type !== MSG_HANDSHAKE_ACK) return;
      const port = event.ports[0];
      if (!port) return;
      cleanup();
      resolve({ ack: data as HandshakeAckMessage, port });
    };

    const send = () => {
      if (Date.now() - startedAt > CALL_TIMEOUT_MS) {
        cleanup();
        reject(new Error('handshake with the platform timed out (10s)'));
        return;
      }
      const message: HandshakeMessage = {
        type: MSG_HANDSHAKE,
        protocolVersion: PROTOCOL_VERSION,
      };
      // A sandboxed iframe has an opaque origin, so '*' is the only usable
      // targetOrigin. The message carries no secret; the platform validates
      // event.source on its side.
      window.parent.postMessage(message, '*');
    };

    window.addEventListener('message', onMessage);
    send();
    timer = window.setInterval(send, HANDSHAKE_RETRY_MS);
  });
}

function createRpcClient(port: MessagePort) {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }
  >();

  // gadget→host 呼び出しの応答を処理する（port.onmessage は createGadget 側で
  // ツール実行(host→gadget)と併せて一本化するため、ここでは関数として返す）。
  const handleResponse = (data: Partial<RpcResponseMessage> | undefined): void => {
    if (!data || data.type !== MSG_RPC_RESPONSE || typeof data.id !== 'number') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    window.clearTimeout(entry.timer);
    if (data.ok) {
      entry.resolve(data.result);
    } else {
      entry.reject(new Error(data.error?.message ?? 'unknown platform error'));
    }
  };

  const call = (
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number = CALL_TIMEOUT_MS,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`platform call timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      const message: RpcRequestMessage = {
        type: MSG_RPC_REQUEST,
        id,
        method,
        params,
      };
      port.postMessage(message);
    });

  return { call, handleResponse };
}
