import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageStub } from '../testing/localStorageStub'
import { installGadget, listInstallations, uninstallGadget } from './installations'

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageStub())
})

describe('installations store', () => {
  it('starts empty and records each gadget once', () => {
    expect(listInstallations()).toEqual([])
    installGadget('schedule-secretary')
    installGadget('schedule-secretary')
    expect(listInstallations()).toEqual(['schedule-secretary'])
  })

  it('uninstall removes only the target gadget', () => {
    installGadget('a-gadget')
    installGadget('b-gadget')
    uninstallGadget('a-gadget')
    expect(listInstallations()).toEqual(['b-gadget'])
  })

  it('tolerates corrupted stored data', () => {
    localStorage.setItem('gadget-installations', '{broken')
    expect(listInstallations()).toEqual([])
    localStorage.setItem('gadget-installations', JSON.stringify([1, 'ok', null]))
    expect(listInstallations()).toEqual(['ok'])
  })
})
