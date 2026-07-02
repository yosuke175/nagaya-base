import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GadgetManifest } from 'gadget-sdk'
import { LocalStorageStub } from '../testing/localStorageStub'
import { getStoredApproval, isApprovalCurrent, saveApproval } from './approvals'

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
  it('is not current when nothing has been approved yet', () => {
    expect(isApprovalCurrent(baseManifest, getStoredApproval(baseManifest.id))).toBe(false)
  })

  it('is current right after approval', () => {
    saveApproval(baseManifest)
    expect(isApprovalCurrent(baseManifest, getStoredApproval(baseManifest.id))).toBe(true)
  })

  it('requires re-approval when a permission is added (spec §5)', () => {
    saveApproval(baseManifest)
    const updated: GadgetManifest = {
      ...baseManifest,
      permissions: ['storage', 'microphone'],
    }
    expect(isApprovalCurrent(updated, getStoredApproval(updated.id))).toBe(false)
  })

  it('requires re-approval when a baseUrl or service is added', () => {
    saveApproval(baseManifest)

    const moreUrls: GadgetManifest = {
      ...baseManifest,
      externalServices: [
        { ...baseManifest.externalServices![0], baseUrls: ['https://a.example', 'https://b.example'] },
      ],
    }
    expect(isApprovalCurrent(moreUrls, getStoredApproval(moreUrls.id))).toBe(false)

    const moreServices: GadgetManifest = {
      ...baseManifest,
      externalServices: [
        ...baseManifest.externalServices!,
        { id: 'svc2', name: 'S2', auth: 'byok', baseUrls: ['https://c.example'], purpose: 'p' },
      ],
    }
    expect(isApprovalCurrent(moreServices, getStoredApproval(moreServices.id))).toBe(false)
  })

  it('accepts a legacy baseUrl approval matched against the same url', () => {
    const legacy: GadgetManifest = {
      ...baseManifest,
      externalServices: [{ id: 'svc', name: 'Service', auth: 'byok', baseUrl: 'https://a.example', purpose: 'test' }],
    }
    saveApproval(legacy)
    expect(isApprovalCurrent(legacy, getStoredApproval(legacy.id))).toBe(true)
  })
})
