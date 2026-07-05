import { describe, expect, it } from 'vitest'
import {
  contentTypeFor,
  isHtml,
  manifestConnectSrc,
  parsePreviewPath,
  previewCsp,
  rawSourceUrl,
} from './_parse'

describe('parsePreviewPath', () => {
  it('defaults to index.html when no file given', () => {
    expect(parsePreviewPath(['alice', 'main', 'my-gadget'])).toEqual({
      owner: 'alice',
      branch: 'main',
      gadgetId: 'my-gadget',
      filePath: 'index.html',
    })
  })

  it('accepts a nested file path', () => {
    expect(parsePreviewPath(['alice', 'feat-x', 'my-gadget', 'assets', 'app.js'])?.filePath).toBe(
      'assets/app.js',
    )
  })

  it('rejects path traversal', () => {
    expect(parsePreviewPath(['alice', 'main', 'my-gadget', '..', 'secret'])).toBeNull()
    expect(parsePreviewPath(['alice', 'main', 'my-gadget', '.', 'x'])).toBeNull()
  })

  it('rejects invalid owner / branch / gadgetId', () => {
    expect(parsePreviewPath(['-bad', 'main', 'my-gadget'])).toBeNull() // owner starts with -
    expect(parsePreviewPath(['alice', 'bad branch', 'my-gadget'])).toBeNull() // space in branch
    expect(parsePreviewPath(['alice', 'main', 'AB'])).toBeNull() // gadgetId too short / uppercase
    expect(parsePreviewPath(['alice', 'main', 'Bad_Id'])).toBeNull() // underscore/uppercase not allowed
  })

  it('requires at least owner/branch/gadgetId', () => {
    expect(parsePreviewPath(['alice', 'main'])).toBeNull()
    expect(parsePreviewPath([])).toBeNull()
  })

  it('rejects an overly deep file path', () => {
    const deep = ['alice', 'main', 'my-gadget', ...Array.from({ length: 20 }, (_, i) => `d${i}`)]
    expect(parsePreviewPath(deep)).toBeNull()
  })
})

describe('rawSourceUrl', () => {
  it('maps to the fork raw URL under gadgets/<id>/', () => {
    expect(
      rawSourceUrl('nagaya-base', {
        owner: 'alice',
        branch: 'main',
        gadgetId: 'my-gadget',
        filePath: 'index.html',
      }),
    ).toBe('https://raw.githubusercontent.com/alice/nagaya-base/main/gadgets/my-gadget/index.html')
  })
})

describe('previewCsp', () => {
  it('always sandboxes the document (opaque origin) to protect the platform session', () => {
    const csp = previewCsp([])
    expect(csp).toContain('sandbox allow-scripts')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self'")
  })

  it('widens connect-src with declared https services only', () => {
    expect(previewCsp(['https://script.google.com'])).toContain(
      "connect-src 'self' https://script.google.com",
    )
  })
})

describe('manifestConnectSrc', () => {
  it('extracts https baseUrls and ignores non-https / malformed', () => {
    const manifest = {
      externalServices: [
        { baseUrls: ['https://a.example', 'http://insecure.example'] },
        { baseUrl: 'https://b.example/' },
        { baseUrls: [] },
      ],
    }
    expect(manifestConnectSrc(manifest)).toEqual(['https://a.example', 'https://b.example'])
  })

  it('is safe on garbage input', () => {
    expect(manifestConnectSrc(null)).toEqual([])
    expect(manifestConnectSrc({})).toEqual([])
  })
})

describe('contentTypeFor / isHtml', () => {
  it('maps common extensions', () => {
    expect(contentTypeFor('index.html')).toContain('text/html')
    expect(contentTypeFor('app.js')).toContain('javascript')
    expect(contentTypeFor('style.css')).toContain('text/css')
    expect(contentTypeFor('logo.webp')).toBe('image/webp')
    expect(contentTypeFor('data.bin')).toBe('application/octet-stream')
  })
  it('detects html', () => {
    expect(isHtml('index.html')).toBe(true)
    expect(isHtml('app.js')).toBe(false)
  })
})
