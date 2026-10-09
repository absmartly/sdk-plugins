# Parse-Time URL Filter Validation Implementation Plan [FT-2338]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ticket:** FT-2338 - Validate and normalize URL filters at parse time instead of in URLMatcher
**PR Title Format:** `refactor(url-filter): validate and normalize URL filters at parse time (FT-2338)`
**Base:** stacked on `feat/FT-2326/trim-url-filter-patterns` (PR #12). Open the PR against that branch and retarget it to `main` after #12 merges.

**Goal:** Raw `urlFilter` JSON is validated and normalized once, at the point the variant config is parsed, so `URLMatcher` only ever receives a well-formed `NormalizedURLFilter`.

**Architecture:** A new pure function `parseURLFilter(raw, experimentName)` in `src/utils/parseURLFilter.ts` takes over the runtime guards and whitespace trimming that FT-2326 added to `URLMatcher` (`normalizeFilter`, `sanitizePatterns`, `trimChangesRegexMeaning`). It also validates `mode`, `matchType` and regex syntax, and logs one debug warning per problem, naming the experiment. The three extraction points (`VariantExtractor.getAllVariantsData`, `VariantExtractor.extractInjectHTMLForExperiment`, `URLRedirectExtractor.parseConfig`) call it. `URLMatcher.matches` is narrowed to `NormalizedURLFilter` and compiles each filter's regexes once, cached in a `WeakMap`.

**Tech Stack:** TypeScript, Jest (ts-jest, jsdom).

**Spec:** JIRA FT-2338 (the description is quoted in the Acceptance criteria below). Prior art: PR #12 / FT-2326.

## Acceptance criteria (from FT-2338)

1. One parse function turns raw urlFilter JSON into a URLFilterConfig (string | string[] | object to normalized include/exclude arrays, mode, matchType). All three consumers call it at parse time.
2. Invalid input (wrong types, unknown mode/matchType, invalid regex) is reported once at parse time, with a debug warning that names the experiment, instead of on every match.
3. URLMatcher only accepts a normalized URLFilterConfig. The runtime type guards added in FT-2326 move into the parser. Whitespace trimming behavior from FT-2326 does not change.
4. Optional: compile regexes once per filter instead of on every matches() call.

## Global Constraints

- **Matching must not change for any input.** Every existing test in `src/utils/__tests__/URLMatcher.test.ts` must still pass after it is routed through `parseURLFilter`. That includes all of the "Whitespace in patterns" cases.
- Falsy raw filters (`undefined`, `null`, `''`, `0`, `false`) mean "no filter", which is how consumers already treat them (`if (urlFilter)`).
- A truthy raw filter that is not a string, array or plain object (for example `5` or `true`) is treated as "match all", as it is today, but now with a warning.
- `include` that is `undefined` or `null` means match all. `include: []`, or an `include` whose patterns were all dropped, means match nothing. A top-level `[]` means match all.
- An invalid regex is dropped at parse time. That matches today's results, where an invalid regex never matches. Keep the existing warning text `Invalid regex in URL filter, pattern ignored`.
- Unknown `mode` falls back to `'simple'` and unknown `matchType` falls back to `'path'`, as today, but now with a warning.
- Warnings use `logDebug` from `src/utils/debug.ts` with the `[ABsmartly] ⚠️` prefix and include `experiment "<name>"`.
- `URLMatcher`, `VariantExtractor` and `HTMLInjector` are internal (not exported from `src/index.ts`). `URLRedirectConfig` and everything in `src/types/index.ts` is public, so new types are additive and the only public narrowing is `URLRedirectConfig.urlFilter`.
- Regexes have no flags (no `g`/`y`), so reusing a compiled `RegExp` across `.test()` calls is safe. Do not add flags.

## Review Focus

1. **Warning spam on SPA navigation.** `getAllVariantsData` runs on every apply and every navigation. Without a cache, "reported once" turns into "reported on every navigation". Task 2 adds a per-experiment cache that `clearCache()` empties, with a test.
2. **Regex whose trim changes meaning** (`' ?/admin'`, `'/checkout| '`). It must be kept as written, not trimmed. The parser tests pin this.
3. **Mixed-validity include list** (`['/ok', 5, '', '([']` in regex mode). The valid patterns survive and each invalid one gets its own warning.
4. **Filter object reused across calls**: the compiled-regex cache must key on object identity and must never return another filter's regexes. Task 4 tests two filters with the same shape and different patterns.
5. **Public `URLRedirectConfig` consumers** that build configs by hand with a raw `urlFilter` get a type error. That is acceptable (the config is produced by the extractor), but call it out in the PR description.

---

## File Structure

- Create `src/utils/parseURLFilter.ts`: raw JSON → `NormalizedURLFilter | undefined`. Owns all validation, trimming and warnings.
- Create `src/utils/__tests__/parseURLFilter.test.ts`.
- Modify `src/types/index.ts`: add `URLMatchType`, `URLFilterMode`, `NormalizedURLFilter`, `ParsedDOMChangesConfig`, `ParsedDOMChangesData`. Narrow `InjectionDataWithFilter.urlFilter`.
- Modify `src/parsers/VariantExtractor.ts`: parse filters in `getAllVariantsData` (cached) and `extractInjectHTMLForExperiment`. Simplify `anyVariantMatchesURL`.
- Modify `src/core/DOMChangesPluginLite.ts`: remove the `any` and the casts around `urlFilter`.
- Modify `src/url-redirect/URLRedirectExtractor.ts` and `src/url-redirect/types.ts`: parse `urlFilter` in `parseConfig`.
- Modify `src/utils/URLMatcher.ts`: accept only `NormalizedURLFilter`, delete the guards, add compiled-pattern cache.
- Modify tests: `src/utils/__tests__/URLMatcher.test.ts`, `src/core/__tests__/HTMLInjector.test.ts`, `src/url-redirect/__tests__/URLRedirectExtractor.test.ts`, plus any others the type checker flags.

Commands: `npx jest <path>` for one file, `npm test` for everything, `npm run lint`, `npx tsc -p tsconfig.json --noEmit`.

---

### Task 1: `parseURLFilter` and normalized types

**Files:**
- Modify: `src/types/index.ts:15-23`
- Create: `src/utils/parseURLFilter.ts`
- Test: `src/utils/__tests__/parseURLFilter.test.ts`

**Interfaces:**
- Produces:
  - `export type URLFilterMode = 'simple' | 'regex'`
  - `export type URLMatchType = 'full-url' | 'path' | 'domain' | 'query' | 'hash'`
  - `export interface NormalizedURLFilter { include?: string[]; exclude: string[]; mode: URLFilterMode; matchType: URLMatchType }`
  - `export function parseURLFilter(raw: unknown, experimentName: string): NormalizedURLFilter | undefined`

- [ ] **Step 1: Add types.** In `src/types/index.ts`, replace the URL filtering block with:

```ts
// URL filtering types
export type URLFilterMode = 'simple' | 'regex';
export type URLMatchType = 'full-url' | 'path' | 'domain' | 'query' | 'hash';

// Raw shape customers write in the variant config
export interface URLFilterConfig {
  include?: string[];
  exclude?: string[];
  mode?: URLFilterMode;
  matchType?: URLMatchType;
}

export type URLFilter = string | string[] | URLFilterConfig;

// Validated output of parseURLFilter - the only shape URLMatcher accepts.
// include undefined = match all, include [] = match nothing.
export interface NormalizedURLFilter {
  include?: string[];
  exclude: string[];
  mode: URLFilterMode;
  matchType: URLMatchType;
}
```

- [ ] **Step 2: Write the failing tests** in `src/utils/__tests__/parseURLFilter.test.ts`:

```ts
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
      expect(parseURLFilter({ include: ['/a'], matchType: 'host' }, 'exp')?.matchType).toBe(
        'path'
      );
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
      expect(parseURLFilter({ exclude: ['/checkout| '], mode: 'regex' }, 'exp')?.exclude).toEqual(
        ['/checkout| ']
      );
    });

    it('keeps inner whitespace', () => {
      expect(parseURLFilter({ include: ['^/a b$'], mode: 'regex' }, 'exp')?.include).toEqual([
        '^/a b$',
      ]);
    });
  });
});
```

- [ ] **Step 3: Run and confirm failure.** `npx jest src/utils/__tests__/parseURLFilter.test.ts` → FAIL, "Cannot find module '../parseURLFilter'".

- [ ] **Step 4: Implement** `src/utils/parseURLFilter.ts`. Move `sanitizePatterns` and `trimChangesRegexMeaning` from `URLMatcher.ts`, unchanged except for the experiment name in messages and the regex validation step. Keep their doc comments. Do **not** delete them from `URLMatcher` yet (Task 4 does that).

```ts
import { logDebug } from './debug';
import type { NormalizedURLFilter, URLFilterMode, URLMatchType } from '../types';

const MODES: readonly URLFilterMode[] = ['simple', 'regex'];
const MATCH_TYPES: readonly URLMatchType[] = ['full-url', 'path', 'domain', 'query', 'hash'];

/**
 * Validate and normalize a urlFilter read from variant config JSON. Customers
 * write it by hand, so nothing guarantees its shape. Problems are reported
 * here, once per parse, so URLMatcher only ever sees a NormalizedURLFilter.
 * Returns undefined when there is no filter.
 */
export function parseURLFilter(
  raw: unknown,
  experimentName: string
): NormalizedURLFilter | undefined {
  if (!raw) {
    return undefined;
  }

  const prefix = `[ABsmartly] ⚠️ URL filter in experiment "${experimentName}":`;

  if (typeof raw === 'string') {
    return defaults(sanitizePatterns([raw], 'simple', prefix));
  }

  if (Array.isArray(raw)) {
    return defaults(raw.length > 0 ? sanitizePatterns(raw, 'simple', prefix) : undefined);
  }

  if (typeof raw !== 'object') {
    logDebug(`${prefix} expected a string, array or object, matching all URLs:`, raw);
    return defaults(undefined);
  }

  const config = raw as Record<string, unknown>;
  const mode = pick(config.mode, MODES, 'simple', 'mode', prefix);
  const matchType = pick(config.matchType, MATCH_TYPES, 'path', 'matchType', prefix);

  return {
    include: config.include == null ? undefined : sanitizePatterns(config.include, mode, prefix),
    exclude: config.exclude == null ? [] : sanitizePatterns(config.exclude, mode, prefix),
    mode,
    matchType,
  };
}

function defaults(include: string[] | undefined): NormalizedURLFilter {
  return { include, exclude: [], mode: 'simple', matchType: 'path' };
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
  prefix: string
): T {
  if (value == null) {
    return fallback;
  }
  if (allowed.includes(value as T)) {
    return value as T;
  }
  logDebug(`${prefix} unknown ${field} ${JSON.stringify(value)}, using "${fallback}"`);
  return fallback;
}

/**
 * <keep the existing sanitizePatterns doc comment from URLMatcher.ts, and add:>
 * Regex patterns that do not compile are dropped as well.
 */
function sanitizePatterns(patterns: unknown, mode: URLFilterMode, prefix: string): string[] {
  // Untyped JSON may hold a single string where an array is expected
  const list: unknown[] = Array.isArray(patterns) ? patterns : [patterns];
  const sanitized: string[] = [];

  for (const pattern of list) {
    // Same branches as URLMatcher.sanitizePatterns (non-string, empty, unchanged,
    // trimChangesRegexMeaning, trimmed). Message text is the same, with `${prefix}`
    // in place of "[ABsmartly] ⚠️" - e.g.
    //   `${prefix} pattern is not a string, ignoring:`
    //   `${prefix} pattern ${JSON.stringify(pattern)} is empty, ignoring`
    // Each branch that would push a candidate goes through keep() instead.
  }

  return sanitized;

  function keep(candidate: string): void {
    if (mode === 'regex' && !compiles(candidate)) {
      logDebug(
        `${prefix} Invalid regex in URL filter, pattern ignored: ${JSON.stringify(candidate)}`
      );
      return;
    }
    sanitized.push(candidate);
  }
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** <keep the existing trimChangesRegexMeaning doc comment> */
function trimChangesRegexMeaning(pattern: string, trimmed: string): boolean {
  try {
    return new RegExp(trimmed).test('') && !new RegExp(pattern).test('');
  } catch {
    return true;
  }
}
```

Copy the loop body from `URLMatcher.sanitizePatterns` (src/utils/URLMatcher.ts, the `for` loop) as described in the comment. Every `sanitized.push(x); continue;` becomes `keep(x); continue;`. The note "simple mode is never regex-validated" holds because `keep` checks `mode === 'regex'`.

- [ ] **Step 5: Run.** `npx jest src/utils/__tests__/parseURLFilter.test.ts` → PASS. Then `npx tsc -p tsconfig.json --noEmit` → clean.

- [ ] **Step 6: Commit.**

```bash
git add src/types/index.ts src/utils/parseURLFilter.ts src/utils/__tests__/parseURLFilter.test.ts
git commit -m "feat(url-filter): add parseURLFilter to validate filters at parse time (FT-2338)"
```

---

### Task 2: Parse DOM-changes filters in `getAllVariantsData` (cached)

**Files:**
- Modify: `src/types/index.ts` (after `DOMChangesData`)
- Modify: `src/parsers/VariantExtractor.ts:19-30, 396-491`
- Modify: `src/core/DOMChangesPluginLite.ts:594-610, 776-860, 958-981`
- Test: `src/parsers/__tests__/VariantExtractor.test.ts`

**Interfaces:**
- Consumes: `parseURLFilter(raw, experimentName)`, `NormalizedURLFilter` (Task 1).
- Produces:
  - `export interface ParsedDOMChangesConfig extends Omit<DOMChangesConfig, 'urlFilter'> { urlFilter?: NormalizedURLFilter }`
  - `export type ParsedDOMChangesData = DOMChange[] | ParsedDOMChangesConfig`
  - `VariantExtractor.getAllVariantsData(experimentName): Map<number, ParsedDOMChangesData>`, cached per experiment until `clearCache()`.

- [ ] **Step 1: Write failing tests.** Add a `describe('URL filter parsing', ...)` block to `VariantExtractor.test.ts`. Build the experiments with `createTestExperiment` / `createTestContext` as the file already does, and spy on `debugModule.logDebug` (already imported):

```ts
describe('URL filter parsing', () => {
  const buildExtractor = (urlFilter: unknown) => {
    const experiment = createTestExperiment('exp1', [
      { config: { __dom_changes: [] } },
      {
        config: {
          __dom_changes: { changes: [{ selector: '.a', type: 'text', value: 'x' }], urlFilter },
        },
      },
    ]);
    context = createTestContext(sdk, { experiments: [experiment] });
    return new VariantExtractor(context, '__dom_changes', false);
  };

  it('normalizes urlFilter in getAllVariantsData', () => {
    const data = buildExtractor(' /checkout ').getAllVariantsData('exp1').get(1) as any;

    expect(data.urlFilter).toEqual({
      include: ['/checkout'],
      exclude: [],
      mode: 'simple',
      matchType: 'path',
    });
  });

  it('reports an invalid filter once across repeated reads and URL checks', () => {
    const logSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation(() => {});
    const extractor = buildExtractor({ include: ['(['], mode: 'regex' });

    extractor.getAllVariantsData('exp1');
    extractor.anyVariantMatchesURL('exp1', 'https://example.com/a');
    extractor.anyVariantMatchesURL('exp1', 'https://example.com/b');

    const regexWarnings = logSpy.mock.calls.filter(c => String(c[0]).includes('Invalid regex'));
    expect(regexWarnings).toHaveLength(1);
    expect(String(regexWarnings[0][0])).toContain('experiment "exp1"');
    logSpy.mockRestore();
  });

  it('re-parses after clearCache', () => {
    const logSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation(() => {});
    const extractor = buildExtractor({ include: ['(['], mode: 'regex' });

    extractor.getAllVariantsData('exp1');
    extractor.clearCache();
    extractor.getAllVariantsData('exp1');

    expect(logSpy.mock.calls.filter(c => String(c[0]).includes('Invalid regex'))).toHaveLength(2);
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run** `npx jest src/parsers/__tests__/VariantExtractor.test.ts -t "URL filter parsing"` → FAIL (`urlFilter` is the raw string, and the warning is logged more than once or names no experiment).

- [ ] **Step 3: Implement.**
  1. In `src/types/index.ts`, add after `DOMChangesData`:

     ```ts
     // DOMChangesData after VariantExtractor has parsed its urlFilter
     export interface ParsedDOMChangesConfig extends Omit<DOMChangesConfig, 'urlFilter'> {
       urlFilter?: NormalizedURLFilter;
     }

     export type ParsedDOMChangesData = DOMChange[] | ParsedDOMChangesConfig;
     ```

  2. In `VariantExtractor`, add `private cachedVariantsData = new Map<string, Map<number, ParsedDOMChangesData>>();`. In `clearCache()`, also call `this.cachedVariantsData.clear();`. At the top of `getAllVariantsData`, return the cached map if there is one. Store the result just before `return variantsData` (store only on success, not inside the `catch`).
  3. Where the variant data is stored (`variantsData.set(i, changesData as DOMChangesData)`), parse wrapped configs first:

     ```ts
     if (changesData && typeof changesData === 'object' && !Array.isArray(changesData)) {
       const { urlFilter, ...config } = changesData as DOMChangesConfig;
       changesData = { ...config, urlFilter: parseURLFilter(urlFilter, experimentName) };
     }
     variantsData.set(i, changesData as ParsedDOMChangesData);
     ```

  4. Simplify `anyVariantMatchesURL`: the loop becomes `if (!Array.isArray(data) && data?.urlFilter) { hasAnyURLFilter = true; if (URLMatcher.matches(data.urlFilter, url)) return true; }`. Keep the SRM comments.
  5. In `DOMChangesPluginLite`:
     - In the loop around line 594, replace the `{ urlFilter?: unknown }` cast and the `{ include?: string[]; exclude?: string[] }` cast with `if (variantData && !Array.isArray(variantData) && variantData.urlFilter) { variantMatchesURL = URLMatcher.matches(variantData.urlFilter, currentURL); ... }`.
     - In `getAllExperimentsData`, change the return type's `urlFilter: any` to `urlFilter: NormalizedURLFilter | undefined` and `variantData: DOMChangesData | null` to `ParsedDOMChangesData | null`. Change `let urlFilter = null` to `let urlFilter: NormalizedURLFilter | undefined`, and `const config = variantData as DOMChangesConfig` to `ParsedDOMChangesConfig`.
     - In `shouldApplyVisualChanges`, use `variantData: ParsedDOMChangesData | null, urlFilter: NormalizedURLFilter | undefined`.
     - Fix whatever else `tsc` flags (for example around line 906 `extractAllVariantChanges` and the caller at line 435). Use the parsed types. Do not add casts.

  `URLMatcher.matches` still takes `URLFilter`. `NormalizedURLFilter` is assignable to `URLFilterConfig`, so this compiles before Task 4.

- [ ] **Step 4: Run** `npx tsc -p tsconfig.json --noEmit && npx jest src/parsers src/core` → all PASS (including `DOMChangesPluginLite.urlFiltering` and `crossVariantExposure`).

- [ ] **Step 5: Commit.**

```bash
git add src/types/index.ts src/parsers src/core
git commit -m "refactor(url-filter): parse DOM changes urlFilter once per experiment (FT-2338)"
```

---

### Task 3: Parse `__inject_html` and URL-redirect filters

**Files:**
- Modify: `src/types/index.ts` (`InjectionDataWithFilter`)
- Modify: `src/parsers/VariantExtractor.ts:580-590`
- Modify: `src/url-redirect/types.ts:14-18`, `src/url-redirect/URLRedirectExtractor.ts:92, 102-150`
- Test: `src/parsers/__tests__/VariantExtractor.test.ts`, `src/url-redirect/__tests__/URLRedirectExtractor.test.ts`, `src/core/__tests__/HTMLInjector.test.ts`

**Interfaces:**
- Consumes: `parseURLFilter`, `NormalizedURLFilter`.
- Produces: `InjectionDataWithFilter.urlFilter?: NormalizedURLFilter` and `URLRedirectConfig.urlFilter?: NormalizedURLFilter`. `URLRedirectExtractor.parseConfig(data: unknown, experimentName: string)` stays private.

- [ ] **Step 1: Write failing tests.**
  - `VariantExtractor.test.ts`: an experiment whose variant config has `__inject_html: { headEnd: '<script></script>', urlFilter: [' /a '] }`. `extractAllInjectHTML().get('exp1')?.get(0)?.urlFilter` equals `{ include: ['/a'], exclude: [], mode: 'simple', matchType: 'path' }`. Spy on `logDebug` with an `include: ['(['], mode: 'regex'` filter and expect one warning containing `experiment "exp1"`.
  - `URLRedirectExtractor.test.ts`: update `'should parse urlFilter'` (line ~218). The expected value becomes `{ include: ['https://old.com/*'], exclude: [], mode: 'simple', matchType: 'path' }`. Add a test that `urlFilter: { include: ['/x'], mode: 'nope' }` yields `mode: 'simple'` plus one warning naming the experiment.
- [ ] **Step 2: Run** both files → the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `src/types/index.ts`: `InjectionDataWithFilter.urlFilter?: NormalizedURLFilter`.
  - `VariantExtractor.extractInjectHTMLForExperiment`: `urlFilter: parseURLFilter(urlFilter, experiment.name)`. `hasUrlFilter` in the debug log stays `!!urlFilter`.
  - `src/url-redirect/types.ts`: import `NormalizedURLFilter` instead of `URLFilter` and set `urlFilter?: NormalizedURLFilter`.
  - `URLRedirectExtractor`: give `parseConfig` an `experimentName: string` parameter, pass `experiment.name` from `extractConfigsForExperiment` (check that this method receives the experiment object, it does at line ~42), and set `urlFilter: parseURLFilter(obj.urlFilter, experimentName)`.
  - `HTMLInjector.test.ts` and any test that builds `InjectionDataWithFilter` / `URLRedirectConfig` by hand with a raw filter: wrap the filter as `parseURLFilter({...}, 'test')`. Find them with `npx tsc -p tsconfig.json --noEmit` and `grep -rn "urlFilter:" src --include='*.test.ts'`. Do not change any assertion about matching results.
- [ ] **Step 4: Run** `npx tsc -p tsconfig.json --noEmit && npm test` → all PASS.
- [ ] **Step 5: Commit.**

```bash
git add src
git commit -m "refactor(url-filter): parse inject_html and redirect urlFilter at extraction (FT-2338)"
```

---

### Task 4: Narrow `URLMatcher` to `NormalizedURLFilter` and compile once

**Files:**
- Modify: `src/utils/URLMatcher.ts` (whole file)
- Test: `src/utils/__tests__/URLMatcher.test.ts`

**Interfaces:**
- Consumes: `NormalizedURLFilter`, `URLMatchType`, `parseURLFilter`.
- Produces: `URLMatcher.matches(filter: NormalizedURLFilter, url?: string): boolean`.

- [ ] **Step 1: Route the existing tests through the parser.** At the top of `URLMatcher.test.ts`, add:

```ts
import { URLMatcher as RawURLMatcher } from '../URLMatcher';
import { parseURLFilter } from '../parseURLFilter';

// Tests describe matching for raw customer filters, so parse them the way consumers do
const URLMatcher = {
  matches: (raw: unknown, url?: string) =>
    RawURLMatcher.matches(parseURLFilter(raw, 'test') ?? { exclude: [], mode: 'simple', matchType: 'path' }, url),
};
```

Remove the old `import { URLMatcher } from '../URLMatcher';`. Leave every existing test body as it is. Run Prettier on the file afterwards. (`?? match-all` mirrors how consumers skip a falsy filter.)

Then add new tests:

```ts
describe('Normalized input', () => {
  const filter = (include: string[], mode: 'simple' | 'regex' = 'regex') => ({
    include,
    exclude: [],
    mode,
    matchType: 'path' as const,
  });

  it('does not log per match for a parsed filter with a dropped regex', () => {
    const logSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation(() => {});
    const parsed = parseURLFilter({ include: ['([', '^/ok$'], mode: 'regex' }, 'exp')!;
    logSpy.mockClear();

    for (let i = 0; i < 3; i++) RawURLMatcher.matches(parsed, 'https://example.com/ok');

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('keeps compiled patterns separate for filters with the same shape', () => {
    const a = filter(['^/a$']);
    const b = filter(['^/b$']);

    expect(RawURLMatcher.matches(a, 'https://example.com/a')).toBe(true);
    expect(RawURLMatcher.matches(b, 'https://example.com/a')).toBe(false);
    expect(RawURLMatcher.matches(b, 'https://example.com/b')).toBe(true);
    expect(RawURLMatcher.matches(a, 'https://example.com/b')).toBe(false);
  });

  it('gives the same result on repeated calls with a reused filter', () => {
    const f = filter(['^/x/\\d+$']);
    expect([1, 2, 3].map(() => RawURLMatcher.matches(f, 'https://example.com/x/1'))).toEqual([
      true,
      true,
      true,
    ]);
  });
});
```

Add `import * as debugModule from '../debug';`.

- [ ] **Step 2: Run** `npx jest src/utils/__tests__/URLMatcher.test.ts` → the existing tests PASS (the parser is equivalent), and `does not log per match` most likely FAILS: today's matcher re-sanitizes and logs whitespace and regex warnings on every call. If it already passes, note that and continue. The refactor in Step 3 is still required by AC3.

- [ ] **Step 3: Rewrite `URLMatcher`.**

```ts
import { logDebug } from './debug';
import type { NormalizedURLFilter, URLMatchType } from '../types';

interface CompiledFilter {
  include?: RegExp[];
  exclude: RegExp[];
}

// Filters are re-evaluated per variant and on every SPA navigation, so compile
// each one once. Keyed by identity; parsed filters live as long as the cache
// that holds them.
const compiled = new WeakMap<NormalizedURLFilter, CompiledFilter>();

export class URLMatcher {
  /**
   * Check if current URL matches the filter. The filter must come from
   * parseURLFilter, which has already validated and trimmed its patterns.
   */
  static matches(filter: NormalizedURLFilter, url: string = window.location.href): boolean {
    const { include, exclude } = this.compile(filter);
    const urlPart = this.extractURLPart(url, filter.matchType);

    // Check exclusions first
    if (exclude.some(re => re.test(urlPart))) {
      return false;
    }

    if (!include) {
      return true; // No include property = match all
    }

    // Empty include array = match nothing (explicit "include nothing")
    return include.some(re => re.test(urlPart));
  }

  private static compile(filter: NormalizedURLFilter): CompiledFilter {
    let result = compiled.get(filter);
    if (!result) {
      const toRegExp = (pattern: string) =>
        filter.mode === 'regex' ? new RegExp(pattern) : this.simplePatternToRegExp(pattern);
      result = { include: filter.include?.map(toRegExp), exclude: filter.exclude.map(toRegExp) };
      compiled.set(filter, result);
    }
    return result;
  }

  // extractURLPart: unchanged, except the parameter type becomes `matchType: URLMatchType`
  // with no default (normalized filters always carry one). Keep the switch's default branch.

  private static simplePatternToRegExp(pattern: string): RegExp {
    // Convert simple pattern to regex
    // * becomes .*
    // ? becomes .
    // Escape other regex special chars
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars except * and ?
      .replace(/\*/g, '.*') // * to .*
      .replace(/\?/g, '.'); // ? to .

    return new RegExp(`^${regexPattern}$`);
  }
}
```

Delete `matchesPatterns`, `matchSimplePattern`, `normalizeFilter`, `sanitizePatterns`, `trimChangesRegexMeaning`, and the `URLFilter`/`URLFilterConfig` import. The escaped simple pattern always compiles, so the old try/catch around it goes away. Parse-time validation guarantees that regex-mode patterns compile.

- [ ] **Step 4: Run** `npx tsc -p tsconfig.json --noEmit && npm test && npm run lint` → all PASS. Then confirm nothing outside `parseURLFilter.ts` still sanitizes: `grep -rn "sanitizePatterns\|trimChangesRegexMeaning" src` should only hit `src/utils/parseURLFilter.ts`.

- [ ] **Step 5: Commit.**

```bash
git add src/utils
git commit -m "refactor(url-filter): URLMatcher takes normalized filters and compiles once (FT-2338)"
```

---

### Task 5: Docs touch-up

**Files:**
- Modify: `URL_FILTERING_FEATURE.md` (only if it describes the runtime normalization, matchType defaults or invalid-input handling)

- [ ] **Step 1:** `grep -n "normaliz\|invalid\|whitespace\|trim" URL_FILTERING_FEATURE.md`. If the doc says invalid patterns are handled during matching, update that to "validated when the config is parsed; invalid patterns are dropped with a debug warning naming the experiment". Otherwise skip this task.
- [ ] **Step 2:** If anything changed, commit `docs(url-filter): note parse-time validation (FT-2338)`.
