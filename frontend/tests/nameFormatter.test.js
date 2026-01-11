import { describe, it, expect } from 'vitest';
import { formatNamesForDisplay, resolveFirstNameDuplicates } from '../src/renderer/shared/nameFormatter.js';

describe('nameFormatter', () => {
  describe('formatNamesForDisplay', () => {
    it('should return single name unchanged', () => {
      const result = formatNamesForDisplay(['Anna Svensson']);
      expect(result).toEqual(['Anna Svensson']);
    });

    it('should abbreviate duplicate first names', () => {
      const result = formatNamesForDisplay(['Anna Svensson', 'Anna Berg']);
      expect(result[0]).toMatch(/Anna S/);
      expect(result[1]).toMatch(/Anna B/);
    });

    it('should handle empty array', () => {
      const result = formatNamesForDisplay([]);
      expect(result).toEqual([]);
    });
  });

  describe('resolveFirstNameDuplicates', () => {
    it('should return first names when no duplicates', () => {
      const result = resolveFirstNameDuplicates(['Anna Svensson', 'Erik Berg']);
      expect(result).toEqual(['Anna', 'Erik']);
    });

    it('should add last initial for duplicates', () => {
      const result = resolveFirstNameDuplicates(['Anna Svensson', 'Anna Berg']);
      expect(result).toEqual(['Anna S', 'Anna B']);
    });
  });
});
