import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GadgetManifest } from 'gadget-sdk'
import { LocalStorageStub } from '../testing/localStorageStub'
import { isApprovalCurrent, loadApproval, persistApproval } from './approvals'

const baseManifest: GadgetManifest = {
  manifestVersion: 1,
  id: 'test-gadget',
  name: 'テスト',
  version: '0.1.0',
  description: 'test',
  author: { name: 'test', contact: 'test@example.com' },
  entry: 'index.html',
  size: { default: 'medium', supported: ['medium'] },
  permissions: ['storage'],
  externalServices: [
    {
      id: 'svc',
      name: 'Service',
      auth: 'byok',
      baseUrls: ['https://a.example'],
      purpose: 'test',
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageStub())
})

describe('approvals', () => {
  it('is not current when nothing has been approved yet', async () => {
    expect(isApprovalCurrent(baseManifest, await loadApproval(baseManifest.id))).toBe(false)
  })

  it('is current right after approval', async () => {
    await persistApproval(baseManifest)
    expect(isApprovalCurrent(baseManifest, await loadApproval(baseManifest.id))).toBe(true)
  })

  it('requires re-approval when a permission is added (spec §5)', async () => {
    await persistApproval(baseManifest)
    const updated: GadgetManifest = {
      ...baseManifest,
      permissions: ['storage', 'microphone'],
    }
    expect(isApprovalCurrent(updated, await loadApproval(updated.id))).toBe(false)
  })

  it('requires re-approval when a baseUrl or service is added', async () => {
    await persistApproval(baseManifest)

    const moreUrls: GadgetManifest = {
      ...baseManifest,
      externalServices: [
        { ...baseManifest.externalServices![0], baseUrls: ['https://a.example', 'https://b.example'] },
      ],
    }
    expect(isApprovalCurrent(moreUrls, await loadApproval(moreUrls.id))).toBe(false)

    const moreServices: GadgetManifest = {
      ...baseManifest,
      externalServices: [
        ...baseManifest.externalServices!,
        { id: 'svc2', name: 'S2', auth: 'byok', baseUrls: ['https://c.example'], purpose: 'p' },
      ],
    }
    expect(isApprovalCurrent(moreServices, await loadApproval(moreServices.id))).toBe(false)
  })

  it('accepts a legacy baseUrl approval matched against the same url', async () => {
    const legacy: GadgetManifest = {
      ...baseManifest,
      externalServices: [{ id: 'svc', name: 'Service', auth: 'byok', baseUrl: 'https://a.example', purpose: 'test' }],
    }
    await persistApproval(legacy)
    expect(isApprovalCurrent(legacy, await loadApproval(legacy.id))).toBe(true)
  })
})
