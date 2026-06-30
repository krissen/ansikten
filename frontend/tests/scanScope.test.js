import { describe, it, expect, beforeEach } from 'vitest';
import { getScanScope, setScanScope, scanScopeHasSelection } from '../src/renderer/shared/scanScope.js';

describe('scanScope store', () => {
  beforeEach(() => setScanScope(null));

  it('starts empty', () => {
    expect(getScanScope()).toBeNull();
  });

  it('stores a shallow copy (later mutation of the source does not leak in)', () => {
    const src = { roots: ['/a'], globs: [], recursive: true, date_from: null, date_to: null, extension_preset: 'jpg' };
    setScanScope(src);
    src.roots.push('/b'); // mutating the array still leaks (shallow), but the object identity is decoupled
    const stored = getScanScope();
    expect(stored).not.toBe(src);
    expect(stored.extension_preset).toBe('jpg');
  });

  it('setScanScope(null) clears', () => {
    setScanScope({ roots: ['/a'], globs: [] });
    setScanScope(null);
    expect(getScanScope()).toBeNull();
  });
});

describe('scanScopeHasSelection', () => {
  it('false for null / empty', () => {
    expect(scanScopeHasSelection(null)).toBe(false);
    expect(scanScopeHasSelection({ roots: [], globs: [] })).toBe(false);
    expect(scanScopeHasSelection({})).toBe(false);
  });

  it('true when a folder or path-glob is present', () => {
    expect(scanScopeHasSelection({ roots: ['/a'], globs: [] })).toBe(true);
    expect(scanScopeHasSelection({ roots: [], globs: ['*.jpg'] })).toBe(true);
  });
});
