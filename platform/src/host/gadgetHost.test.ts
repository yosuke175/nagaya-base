import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MSG_RPC_REQUEST,
  STORAGE_KEY_MAX_LENGTH,
  type GadgetExternalService,
  type GadgetManifest,
  type RpcRequestMessage,
} from 'gadget-sdk'
import { LocalStorageStub } from '../testing/localStorageStub'
import { createGadgetRpcHandler, credentialStore } from './gadgetHost'

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
  it('storage.set then storage.get round-trips the value', async () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))
    const tasks = [{ title: '資料作成', done: false }]

    const setResponse = await handle(request(1, 'storage.set', { key: 'tasks', value: tasks }))
    expect(setResponse.ok).toBe(true)

    const getResponse = await handle(request(2, 'storage.get', { key: 'tasks' }))
    expect(getResponse.ok).toBe(true)
    expect(getResponse.result).toEqual(tasks)
  })

  it('storage.get returns null for a missing key', async () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))
    const response = await handle(request(1, 'storage.get', { key: 'missing' }))
    expect(response.ok).toBe(true)
    expect(response.result).toBeNull()
  })

  it('isolates storage between gadget ids', async () => {
    const handleA = createGadgetRpcHandler(manifest(['storage']))
    const handleB = createGadgetRpcHandler({ ...manifest(['storage']), id: 'other-gadget' })

    await handleA(request(1, 'storage.set', { key: 'shared', value: 'A' }))
    const response = await handleB(request(2, 'storage.get', { key: 'shared' }))
    expect(response.result).toBeNull()
  })

  it('rejects storage calls when "storage" is not declared in the manifest', async () => {
    const handle = createGadgetRpcHandler(manifest([]))
    const response = await handle(request(1, 'storage.get', { key: 'tasks' }))
    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe('permission_denied')
  })

  it('rejects invalid keys and unknown methods', async () => {
    const handle = createGadgetRpcHandler(manifest(['storage']))

    const tooLong = await handle(
      request(1, 'storage.get', { key: 'a'.repeat(STORAGE_KEY_MAX_LENGTH + 1) }),
    )
    expect(tooLong.ok).toBe(false)
    expect(tooLong.error?.code).toBe('invalid_key')

    const unknown = await handle(request(2, 'storage.list', {}))
    expect(unknown.ok).toBe(false)
    expect(unknown.error?.code).toBe('unknown_method')
  })
})

describe('createGadgetRpcHandler — services (BYOK)', () => {
  const gasService: GadgetExternalService = {
    id: 'gas-webapp',
    name: 'GAS WebApp',
    auth: 'byok',
    baseUrls: ['https://script.google.com', 'https://script.googleusercontent.com'],
    purpose: 'test',
  }
  const withService = (): GadgetManifest => ({
    ...manifest(['storage']),
    externalServices: [gasService],
  })

  it('getCredential returns null before setup and the stored value after', async () => {
    const handle = createGadgetRpcHandler(withService())

    const before = await handle(request(1, 'services.getCredential', { serviceId: 'gas-webapp' }))
    expect(before.ok).toBe(true)
    expect(before.result).toBeNull()

    credentialStore.set('test-gadget', 'gas-webapp', 'https://example.invalid token')
    const after = await handle(request(2, 'services.getCredential', { serviceId: 'gas-webapp' }))
    expect(after.result).toBe('https://example.invalid token')
  })

  it('isolates credentials from gadget.storage and between gadgets', async () => {
    credentialStore.set('test-gadget', 'gas-webapp', 'secret')
    const handle = createGadgetRpcHandler(withService())

    // Not readable through the storage namespace
    const viaStorage = await handle(request(1, 'storage.get', { key: 'gas-webapp' }))
    expect(viaStorage.result).toBeNull()

    // Not readable by another gadget id
    expect(credentialStore.get('other-gadget', 'gas-webapp')).toBeNull()
  })

  it('rejects undeclared service ids', async () => {
    const handle = createGadgetRpcHandler(withService())
    const response = await handle(request(1, 'services.getCredential', { serviceId: 'not-declared' }))
    expect(response.ok).toBe(false)
    expect(response.error?.code).toBe('unknown_service')
  })

  it('requestSetup notifies the host callback with the declared service', async () => {
    let requested: string | null = null
    const handle = createGadgetRpcHandler(withService(), {
      onRequestSetup: (service) => {
        requested = service.id
      },
    })
    const response = await handle(request(1, 'services.requestSetup', { serviceId: 'gas-webapp' }))
    expect(response.ok).toBe(true)
    expect(requested).toBe('gas-webapp')
  })
})
