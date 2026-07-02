import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MSG_RPC_REQUEST,
  STORAGE_KEY_MAX_LENGTH,
  type GadgetManifest,
  type RpcRequestMessage,
} from 'gadget-sdk'
import { createGadgetRpcHandler } from './gadgetHost'

class LocalStorageStub {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

const manifest = (permissions: GadgetManifest['permissions']): GadgetManifest => ({
  manifestVersion: 1,
  id: 'test-gadget',
  name: 'テスト',
  version: '0.1.0',
  description: 'test',
  author: { name: 'test', contact: 'test@example.com' },
  entry: 'index.html',
  size: { default: 'medium', supported: ['medium'] },
  permissions,
})

const request = (id: number, method: string, params: Record<string, unknown>): RpcRequestMessage => ({
  type: MSG_RPC_REQUEST,
  id,
  method,
  params,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageStub())
})

describe('createGadgetRpcHandler', () => {
  it('storage.set then storage.get round-trips the value', () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))
    const tasks = [{ title: '資料作成', done: false }]

    const setResponse = handle(request(1, 'storage.set', { key: 'tasks', value: tasks }))
    expect(setResponse.ok).toBe(true)

    const getResponse = handle(request(2, 'storage.get', { key: 'tasks' }))
    expect(getResponse.ok).toBe(true)
    expect(getResponse.result).toEqual(tasks)
  })

  it('storage.get returns null for a missing key', () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))
    const response = handle(request(1, 'storage.get', { key: 'missing' }))
    expect(response.ok).toBe(true)
    expect(response.result).toBeNull()
  })

  it('isolates storage between gadget ids', () => {
    const handleA = createGadgetRpcHandler(manifest(['storage']))
    const handleB = createGadgetRpcHandler({ ...manifest(['storage']), id: 'other-gadget' })

    handleA(request(1, 'storage.set', { key: 'shared', value: 'A' }))
    const response = handleB(request(2, 'storage.get', { key: 'shared' }))
    expect(response.result).toBeNull()
  })

  it('rejects storage calls when "storage" is not declared in the manifest', () => {
    const handle = createGadgetRpcHandler(manifest([]))
    const response = handle(request(1, 'storage.get', { key: 'tasks' }))
    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe('permission_denied')
  })

  it('rejects invalid keys and unknown methods', () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))

    const tooLong = handle(
      request(1, 'storage.get', { key: 'a'.repeat(STORAGE_KEY_MAX_LENGTH + 1) }),
    )
    expect(tooLong.ok).toBe(false)
    expect(tooLong.error?.code).toBe('invalid_key')

    const unknown = handle(request(2, 'storage.list', {}))
    expect(unknown.ok).toBe(false)
    expect(unknown.error?.code).toBe('unknown_method')
  })
})
