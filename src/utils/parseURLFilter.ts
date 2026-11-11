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
    return withDefaults(sanitizePatterns([raw], 'simple', prefix));
  }

  if (Array.isArray(raw)) {
    return withDefaults(raw.length > 0 ? sanitizePatterns(raw, 'simple', prefix) : undefined);
  }

  if (typeof raw !== 'object') {
    logDebug(`${prefix} expected a string, array or object, matching all URLs:`, raw);
    return withDefaults(undefined);
  }

  const config = raw as Record<string, unknown>;
  const mode = pickAllowed(config.mode, MODES, 'simple', 'mode', prefix);
  const matchType = pickAllowed(config.matchType, MATCH_TYPES, 'path', 'matchType', prefix);

  return {
    include: config.include == null ? undefined : sanitizePatterns(config.include, mode, prefix),
    exclude: config.exclude == null ? [] : sanitizePatterns(config.exclude, mode, prefix),
    mode,
    matchType,
  };
}

function withDefaults(include: string[] | undefined): NormalizedURLFilter {
  return { include, exclude: [], mode: 'simple', matchType: 'path' };
}

function pickAllowed<T extends string>(
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
 * Trim surrounding whitespace from patterns. A parsed URL never contains a
 * literal space (it is encoded as %20), so a padded pattern (easy to paste by
 * accident) could never match. Empty and whitespace-only patterns are
 * dropped, since an empty regex would match every URL and silently turn an
 * exclude into "exclude everything". Non-string patterns are dropped too, as
 * are regex patterns that do not compile.
 */
function sanitizePatterns(patterns: unknown, mode: URLFilterMode, prefix: string): string[] {
  // Untyped JSON may hold a single string where an array is expected
  const list: unknown[] = Array.isArray(patterns) ? patterns : [patterns];
  const sanitized: string[] = [];

  const keep = (pattern: string): void => {
    if (mode === 'regex' && !compiles(pattern)) {
      logDebug(
        `${prefix} Invalid regex in URL filter, pattern ignored: ${JSON.stringify(pattern)}`
      );
      return;
    }
    sanitized.push(pattern);
  };

  for (const pattern of list) {
    if (typeof pattern !== 'string') {
      logDebug(`${prefix} pattern is not a string, ignoring:`, pattern);
      continue;
    }

    const trimmed = pattern.trim();

    if (!trimmed) {
      logDebug(`${prefix} pattern ${JSON.stringify(pattern)} is empty, ignoring`);
      continue;
    }

    if (trimmed === pattern) {
      keep(pattern);
      continue;
    }

    if (mode === 'regex' && trimChangesRegexMeaning(pattern, trimmed)) {
      logDebug(
        `${prefix} regex ${JSON.stringify(pattern)} has surrounding whitespace, ` +
          'but trimming would change its meaning - using it as is'
      );
      keep(pattern);
      continue;
    }

    logDebug(
      `${prefix} pattern ${JSON.stringify(pattern)} has surrounding whitespace - ` +
        `using ${JSON.stringify(trimmed)}`
    );
    keep(trimmed);
  }

  return sanitized;
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Surrounding whitespace can be part of a regex, so only trim when the
 * trimmed regex still compiles and does not newly match the empty string.
 * That keeps ` ?/admin` (would not compile) and `/checkout| ` (would match
 * every URL) as written.
 */
function trimChangesRegexMeaning(pattern: string, trimmed: string): boolean {
  try {
    return new RegExp(trimmed).test('') && !new RegExp(pattern).test('');
  } catch {
    return true;
  }
}
