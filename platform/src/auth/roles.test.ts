import { describe, expect, it } from 'vitest'
import { roleAtLeast } from './roles'

describe('roleAtLeast', () => {
  it('follows the hierarchy admin ⊃ developer ⊃ user ⊃ guest', () => {
    expect(roleAtLeast('admin', 'user')).toBe(true)
    expect(roleAtLeast('developer', 'user')).toBe(true)
    expect(roleAtLeast('user', 'user')).toBe(true)
    expect(roleAtLeast('guest', 'user')).toBe(false)
    expect(roleAtLeast('user', 'admin')).toBe(false)
  })

  it('treats unknown roles as no permission', () => {
    expect(roleAtLeast('', 'guest')).toBe(false)
    expect(roleAtLeast('superuser', 'guest')).toBe(false)
  })
})
