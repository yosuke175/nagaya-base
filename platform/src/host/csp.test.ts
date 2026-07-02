import { describe, expect, it } from 'vitest'
import { buildGadgetCsp, manifestConnectSrc } from './csp'

describe('manifestConnectSrc', () => {
  it('collects baseUrls across services, deduplicated', () => {
    expect(
      manifestConnectSrc({
        externalServices: [
          { baseUrls: ['https://a.example', 'https://b.example/'] },
          { baseUrls: ['https://a.example'] },
        ],
      }),
    ).toEqual(['https://a.example', 'https://b.example'])
  })

  it('accepts the legacy baseUrl form', () => {
    expect(manifestConnectSrc({ externalServices: [{ baseUrl: 'https://a.example' }] })).toEqual([
      'https://a.example',
    ])
  })

  it('drops non-https entries and handles missing externalServices', () => {
    expect(
      manifestConnectSrc({
        externalServices: [{ baseUrls: ['http://insecure.example', 'ftp://x.example'] }],
      }),
    ).toEqual([])
    expect(manifestConnectSrc({})).toEqual([])
  })
})

describe('buildGadgetCsp', () => {
  it('keeps everything closed by default and widens only connect-src', () => {
    const csp = buildGadgetCsp("'self'", ['https://script.google.com'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self' https://script.google.com")
    expect(csp).not.toContain('script-src https://script.google.com')
  })

  it('produces a closed connect-src when nothing is declared', () => {
    const csp = buildGadgetCsp('http://localhost:5173', [])
    expect(csp.endsWith('connect-src http://localhost:5173')).toBe(true)
  })
})
