import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY_MAX_LENGTH,
  ensureJsonSerializable,
  externalServiceBaseUrls,
  validateAiRequest,
  validateServiceId,
  validateStorageKey,
} from './index';

describe('validateStorageKey', () => {
  it('accepts a normal key', () => {
    expect(() => validateStorageKey('tasks')).not.toThrow();
    expect(() => validateStorageKey('a'.repeat(STORAGE_KEY_MAX_LENGTH))).not.toThrow();
  });

  it('rejects empty and non-string keys', () => {
    expect(() => validateStorageKey('')).toThrow();
    expect(() => validateStorageKey(123)).toThrow();
    expect(() => validateStorageKey(null)).toThrow();
  });

  it('rejects keys longer than the limit', () => {
    expect(() => validateStorageKey('a'.repeat(STORAGE_KEY_MAX_LENGTH + 1))).toThrow();
  });
});

describe('ensureJsonSerializable', () => {
  it('accepts JSON-serializable values', () => {
    expect(() => ensureJsonSerializable(null)).not.toThrow();
    expect(() => ensureJsonSerializable(0)).not.toThrow();
    expect(() => ensureJsonSerializable('text')).not.toThrow();
    expect(() => ensureJsonSerializable([{ title: 'task', done: false }])).not.toThrow();
  });

  it('rejects undefined, functions, and circular references', () => {
    expect(() => ensureJsonSerializable(undefined)).toThrow();
    expect(() => ensureJsonSerializable(() => {})).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => ensureJsonSerializable(circular)).toThrow();
  });
});

describe('externalServiceBaseUrls', () => {
  const base = { id: 'svc', name: 'S', auth: 'byok' as const, purpose: 'p' };

  it('returns baseUrls when declared (spec v1.1)', () => {
    expect(
      externalServiceBaseUrls({ ...base, baseUrls: ['https://a.example', 'https://b.example'] }),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('falls back to legacy baseUrl (spec v1.0)', () => {
    expect(externalServiceBaseUrls({ ...base, baseUrl: 'https://a.example' })).toEqual([
      'https://a.example',
    ]);
  });

  it('prefers baseUrls over baseUrl and returns [] when neither is set', () => {
    expect(
      externalServiceBaseUrls({
        ...base,
        baseUrls: ['https://new.example'],
        baseUrl: 'https://old.example',
      }),
    ).toEqual(['https://new.example']);
    expect(externalServiceBaseUrls(base)).toEqual([]);
  });
});

describe('validateAiRequest', () => {
  it('accepts a valid request', () => {
    expect(() =>
      validateAiRequest({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
      }),
    ).not.toThrow()
    expect(() => validateAiRequest({ messages: [{ role: 'user', content: 'hi' }] })).not.toThrow()
  })

  it('rejects empty or malformed messages', () => {
    expect(() => validateAiRequest({ messages: [] })).toThrow()
    expect(() => validateAiRequest({ messages: [{ role: 'system', content: 'x' }] })).toThrow()
    expect(() => validateAiRequest({ messages: [{ role: 'user', content: '' }] })).toThrow()
    expect(() => validateAiRequest(undefined)).toThrow()
  })

  it('rejects bad system / maxTokens types', () => {
    expect(() =>
      validateAiRequest({ system: 5, messages: [{ role: 'user', content: 'x' }] }),
    ).toThrow()
    expect(() =>
      validateAiRequest({ messages: [{ role: 'user', content: 'x' }], maxTokens: -1 }),
    ).toThrow()
  })
})

describe('validateServiceId', () => {
  it('accepts a non-empty string and rejects everything else', () => {
    expect(() => validateServiceId('gas-webapp')).not.toThrow();
    expect(() => validateServiceId('')).toThrow();
    expect(() => validateServiceId(undefined)).toThrow();
    expect(() => validateServiceId(42)).toThrow();
  });
});
