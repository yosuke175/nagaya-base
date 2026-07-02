import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY_MAX_LENGTH,
  ensureJsonSerializable,
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
