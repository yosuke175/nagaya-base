import { describe, expect, it } from 'vitest'
import checks from './checks.js'

const { validateGadgetId, parseMajorVersion } = checks

describe('validateGadgetId (gadget-spec §2)', () => {
  it('accepts valid ids', () => {
    expect(validateGadgetId('my-first-gadget').ok).toBe(true)
    expect(validateGadgetId('abc').ok).toBe(true)
    expect(validateGadgetId('a'.repeat(40)).ok).toBe(true)
  })
  it('rejects invalid ids', () => {
    expect(validateGadgetId('ab').ok).toBe(false) // too short
    expect(validateGadgetId('a'.repeat(41)).ok).toBe(false) // too long
    expect(validateGadgetId('MyGadget').ok).toBe(false) // uppercase
    expect(validateGadgetId('my_gadget').ok).toBe(false) // underscore
    expect(validateGadgetId('日本語').ok).toBe(false)
    expect(validateGadgetId('').ok).toBe(false)
  })
})

describe('parseMajorVersion', () => {
  it('parses node-style versions', () => {
    expect(parseMajorVersion('v20.11.1')).toBe(20)
    expect(parseMajorVersion('v18.19.0')).toBe(18)
    expect(parseMajorVersion('git version 2.44.0.windows.1')).toBe(2)
    expect(parseMajorVersion('nonsense')).toBeNull()
  })
})
