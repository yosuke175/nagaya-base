import { describe, expect, it } from 'vitest'
import { b64encode, decryptValue, encryptValue, importAesKey } from './credentials'

const randomKeyB64 = () => b64encode(crypto.getRandomValues(new Uint8Array(32)))

describe('credentials encryption (AES-GCM)', () => {
  it('round-trips a value', async () => {
    const key = await importAesKey(randomKeyB64())
    const { ciphertext, iv } = await encryptValue(key, 'user1:platform-ai', 'sk-ant-secret')
    expect(ciphertext).not.toContain('sk-ant')
    expect(await decryptValue(key, 'user1:platform-ai', ciphertext, iv)).toBe('sk-ant-secret')
  })

  it('fails to decrypt with a different AAD (row swap protection)', async () => {
    const key = await importAesKey(randomKeyB64())
    const { ciphertext, iv } = await encryptValue(key, 'user1:platform-ai', 'secret')
    await expect(decryptValue(key, 'user2:platform-ai', ciphertext, iv)).rejects.toThrow()
  })

  it('fails to decrypt with a different key or tampered ciphertext', async () => {
    const key = await importAesKey(randomKeyB64())
    const otherKey = await importAesKey(randomKeyB64())
    const { ciphertext, iv } = await encryptValue(key, 'aad', 'secret')
    await expect(decryptValue(otherKey, 'aad', ciphertext, iv)).rejects.toThrow()
    const tampered = b64encode(
      (() => {
        const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
        bytes[0] = bytes[0] ^ 0xff
        return bytes
      })(),
    )
    await expect(decryptValue(key, 'aad', tampered, iv)).rejects.toThrow()
  })
})
