import { parseURLFilter } from '../parseURLFilter';
import * as debugModule from '../debug';

describe('parseURLFilter', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const warnings = () => logSpy.mock.calls.map(call => String(call[0]));

  describe('absent filters', () => {
    it.each([undefined, null, '', 0, false])('returns undefined for %p', raw => {
      expect(parseURLFilter(raw, 'exp')).toBeUndefined();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('shapes', () => {
    it('normalizes a string', () => {
      expect(parseURLFilter('/checkout', 'exp')).toEqual({
        include: ['/checkout'],
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      });
    });

    it('normalizes an array', () => {
      expect(parseURLFilter(['/a', '/b'], 'exp')).toEqual({
        include: ['/a', '/b'],
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      });
    });

    it('treats an empty top-level array as match all', () => {
      expect(parseURLFilter([], 'exp')).toEqual({
        include: undefined,
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      });
    });

    it('normalizes an object and fills defaults', () => {
      expect(parseURLFilter({ exclude: ['/admin/*'] }, 'exp')).toEqual({
        include: undefined,
        exclude: ['/admin/*'],
        mode: 'simple',
        matchType: 'path',
      });
    });

    it('keeps an explicit empty include as match nothing', () => {
      expect(parseURLFilter({ include: [] }, 'exp')?.include).toEqual([]);
    });

    it('treats include: null as match all', () => {
      expect(parseURLFilter({ include: null }, 'exp')?.include).toBeUndefined();
    });

    it('accepts a single string where an array is expected', () => {
      expect(parseURLFilter({ include: '/a', exclude: '/b' }, 'exp')).toMatchObject({
        include: ['/a'],
        exclude: ['/b'],
      });
    });

    it('keeps valid mode and matchType', () => {
      expect(
        parseURLFilter({ include: ['^/x$'], mode: 'regex', matchType: 'full-url' }, 'exp')
      ).toMatchObject({ mode: 'regex', matchType: 'full-url' });
    });
  });

  describe('invalid input', () => {
    it('treats a non-string, non-array, non-object filter as match all and warns', () => {
      expect(parseURLFilter(5, 'exp')).toEqual({
        include: undefined,
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      });
      expect(warnings()).toEqual([expect.stringContaining('experiment "exp"')]);
    });

    it('falls back to simple for an unknown mode and warns', () => {
      expect(parseURLFilter({ include: ['/a'], mode: 'glob' }, 'exp')?.mode).toBe('simple');
      expect(warnings()).toEqual([expect.stringMatching(/experiment "exp".*mode.*"glob"/)]);
    });

    it('falls back to path for an unknown matchType and warns', () => {
      expect(parseURLFilter({ include: ['/a'], matchType: 'host' }, 'exp')?.matchType).toBe('path');
      expect(warnings()).toEqual([expect.stringMatching(/experiment "exp".*matchType.*"host"/)]);
    });

    it('drops non-string, empty and invalid-regex patterns, keeping the rest', () => {
      const result = parseURLFilter({ include: ['^/ok$', 5, '  ', '(['], mode: 'regex' }, 'exp');

      expect(result?.include).toEqual(['^/ok$']);
      expect(warnings()).toHaveLength(3);
      expect(warnings().every(w => w.includes('experiment "exp"'))).toBe(true);
      expect(warnings().some(w => w.includes('Invalid regex in URL filter, pattern ignored'))).toBe(
        true
      );
    });

    it('does not regex-validate simple-mode patterns', () => {
      expect(parseURLFilter({ include: ['(['] }, 'exp')?.include).toEqual(['([']);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('turns an include whose patterns are all invalid into match nothing', () => {
      expect(parseURLFilter({ include: [5] }, 'exp')?.include).toEqual([]);
    });
  });

  describe('whitespace (FT-2326 behavior)', () => {
    it('trims simple patterns', () => {
      expect(parseURLFilter([' /a ', '\t/b'], 'exp')?.include).toEqual(['/a', '/b']);
    });

    it('trims regex patterns when the meaning is unchanged', () => {
      expect(
        parseURLFilter({ include: ['\t^/products/\\d+$ \n'], mode: 'regex' }, 'exp')?.include
      ).toEqual(['^/products/\\d+$']);
    });

    it('keeps a regex as written when trimming would break compilation', () => {
      expect(parseURLFilter({ include: [' ?/admin'], mode: 'regex' }, 'exp')?.include).toEqual([
        ' ?/admin',
      ]);
    });

    it('keeps a regex as written when trimming would make it match everything', () => {
      expect(parseURLFilter({ exclude: ['/checkout| '], mode: 'regex' }, 'exp')?.exclude).toEqual([
        '/checkout| ',
      ]);
    });

    it('keeps inner whitespace', () => {
      expect(parseURLFilter({ include: ['^/a b$'], mode: 'regex' }, 'exp')?.include).toEqual([
        '^/a b$',
      ]);
    });
  });
});
