import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageStub } from '../testing/localStorageStub'
import { installGadget, listInstallations, uninstallGadget } from './installations'

// Supabase is unconfigured in tests, so the store runs in localStorage mode.
beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageStub())
})

describe('installations store (local mode)', () => {
  it('starts empty and records each gadget once', async () => {
    expect(await listInstallations()).toEqual([])
    await installGadget('schedule-secretary')
    await installGadget('schedule-secretary')
    expect(await listInstallations()).toEqual(['schedule-secretary'])
  })

  it('uninstall removes only the target gadget', async () => {
    await installGadget('a-gadget')
    await installGadget('b-gadget')
    await uninstallGadget('a-gadget')
    expect(await listInstallations()).toEqual(['b-gadget'])
  })

  it('tolerates corrupted stored data', async () => {
    localStorage.setItem('gadget-installations', '{broken')
    expect(await listInstallations()).toEqual([])
    localStorage.setItem('gadget-installations', JSON.stringify([1, 'ok', null]))
    expect(await listInstallations()).toEqual(['ok'])
  })
})
