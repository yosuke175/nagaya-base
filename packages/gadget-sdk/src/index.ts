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

export type GadgetPermission = 'storage' | 'notify' | 'profile';

export type GadgetSize = 'small' | 'medium' | 'large' | 'full';

/** manifest.json schema — docs/gadget-spec.md §3 */
export interface GadgetManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; contact: string };
  entry: string;
  size: { default: GadgetSize; supported: GadgetSize[] };
  permissions: GadgetPermission[];
  externalServices?: Array<{
    id: string;
    name: string;
    auth: 'byok';
    baseUrl: string;
    purpose: string;
  }>;
}

export const MSG_HANDSHAKE = 'gadget:handshake';
export const MSG_HANDSHAKE_ACK = 'platform:handshake-ack';
export const MSG_RPC_REQUEST = 'gadget:rpc-request';
export const MSG_RPC_RESPONSE = 'platform:rpc-response';

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

export interface Gadget {
  storage: GadgetStorage;
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
  const call = createRpcClient(port);

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

  port.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<RpcResponseMessage> | undefined;
    if (!data || data.type !== MSG_RPC_RESPONSE || typeof data.id !== 'number') {
      return;
    }
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

  return (method: string, params: Record<string, unknown>): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error(`platform call timed out: ${method}`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      const message: RpcRequestMessage = {
        type: MSG_RPC_REQUEST,
        id,
        method,
        params,
      };
      port.postMessage(message);
    });
}
