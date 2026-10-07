import { logDebug } from './debug';
import type { URLFilter, URLFilterConfig } from '../types';

export class URLMatcher {
  /**
   * Check if current URL matches the filter
   */
  static matches(filter: URLFilter, url: string = window.location.href): boolean {
    // Normalize filter to URLFilterConfig
    const config = this.normalizeFilter(filter);

    // Extract the part of URL to match based on matchType
    const urlPart = this.extractURLPart(url, config.matchType);

    // Check exclusions first
    if (config.exclude && this.matchesPatterns(config.exclude, urlPart, config.mode)) {
      return false;
    }

    // Check inclusions
    if (!config.include) {
      return true; // No include property = match all
    }

    if (config.include.length === 0) {
      return false; // Empty include array = match nothing (explicit "include nothing")
    }

    return this.matchesPatterns(config.include, urlPart, config.mode);
  }

  /**
   * Extract the relevant part of the URL based on matchType
   */
  private static extractURLPart(
    url: string,
    matchType: 'full-url' | 'path' | 'domain' | 'query' | 'hash' = 'path'
  ): string {
    try {
      const urlObj = new URL(url);

      switch (matchType) {
        case 'full-url':
          // Complete URL including protocol, domain, path, query, and hash
          return urlObj.href;

        case 'path':
          // Path + hash (default behavior - most common use case)
          return urlObj.pathname + urlObj.hash;

        case 'domain':
          // Just the hostname (e.g., 'example.com' or 'www.example.com')
          return urlObj.hostname;

        case 'query':
          // Just query parameters (e.g., '?id=123&ref=home')
          return urlObj.search;

        case 'hash':
          // Just hash fragment (e.g., '#section')
          return urlObj.hash;

        default:
          return urlObj.pathname + urlObj.hash;
      }
    } catch (error) {
      // If URL parsing fails, return original string
      logDebug(`[ABsmartly] Failed to parse URL: ${url}`, error);
      return url;
    }
  }

  private static matchesPatterns(
    patterns: string[],
    url: string,
    mode: 'simple' | 'regex' = 'simple'
  ): boolean {
    return patterns.some(pattern => {
      if (mode === 'regex') {
        try {
          return new RegExp(pattern).test(url);
        } catch (error) {
          logDebug(
            `[ABsmartly] ⚠️ Invalid regex in URL filter, pattern ignored: ${JSON.stringify(pattern)}`,
            error
          );
          return false;
        }
      }
      return this.matchSimplePattern(pattern, url);
    });
  }

  private static matchSimplePattern(pattern: string, url: string): boolean {
    // Convert simple pattern to regex
    // * becomes .*
    // ? becomes .
    // Escape other regex special chars
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars except * and ?
      .replace(/\*/g, '.*') // * to .*
      .replace(/\?/g, '.'); // ? to .

    try {
      return new RegExp(`^${regexPattern}$`).test(url);
    } catch (error) {
      logDebug(`[ABsmartly] Invalid pattern: ${pattern}`, error);
      return false;
    }
  }

  private static normalizeFilter(filter: URLFilter): URLFilterConfig {
    if (typeof filter === 'string') {
      return {
        include: this.sanitizePatterns([filter]),
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      };
    }

    if (Array.isArray(filter)) {
      return {
        include: filter.length > 0 ? this.sanitizePatterns(filter) : undefined,
        exclude: [],
        mode: 'simple',
        matchType: 'path',
      };
    }

    const mode = filter.mode || 'simple';

    return {
      include: filter.include && this.sanitizePatterns(filter.include, mode),
      exclude: this.sanitizePatterns(filter.exclude || [], mode),
      mode,
      matchType: filter.matchType || 'path',
    };
  }

  /**
   * Trim surrounding whitespace from patterns. A parsed URL never contains a
   * literal space (it is encoded as %20), so a padded pattern (easy to paste by
   * accident) could never match. Patterns that are empty after trimming are
   * dropped: an empty regex would match every URL, while the untrimmed pattern
   * matched none. Non-string patterns are dropped too.
   */
  private static sanitizePatterns(
    patterns: string[] | string,
    mode: 'simple' | 'regex' = 'simple'
  ): string[] {
    // Untyped JSON may hold a single string where an array is expected
    const list: unknown[] = Array.isArray(patterns) ? patterns : [patterns];
    const sanitized: string[] = [];

    for (const pattern of list) {
      if (typeof pattern !== 'string') {
        logDebug(`[ABsmartly] ⚠️ URL filter pattern is not a string, ignoring:`, pattern);
        continue;
      }

      const trimmed = pattern.trim();

      if (trimmed === pattern) {
        sanitized.push(pattern);
        continue;
      }

      if (mode === 'regex' && this.trimChangesRegexMeaning(trimmed)) {
        logDebug(
          `[ABsmartly] ⚠️ URL filter regex ${JSON.stringify(pattern)} has surrounding whitespace, ` +
            'but trimming would change its meaning - using it as is'
        );
        sanitized.push(pattern);
        continue;
      }

      logDebug(
        `[ABsmartly] ⚠️ URL filter pattern ${JSON.stringify(pattern)} has surrounding whitespace - ` +
          (trimmed ? `using ${JSON.stringify(trimmed)}` : 'ignoring empty pattern')
      );

      if (trimmed) {
        sanitized.push(trimmed);
      }
    }

    return sanitized;
  }

  /**
   * Whitespace next to a top-level `|` or after a trailing `\` is part of the
   * regex: `/checkout| ` trimmed to `/checkout|` would match every URL, and
   * `foo\ ` trimmed to `foo\` would not compile.
   */
  private static trimChangesRegexMeaning(trimmed: string): boolean {
    const trailingBackslashes = trimmed.length - trimmed.replace(/\\+$/, '').length;
    const endsWithUnescapedPipe =
      trimmed.endsWith('|') &&
      (trimmed.length - 1 - trimmed.slice(0, -1).replace(/\\+$/, '').length) % 2 === 0;

    return trimmed.startsWith('|') || endsWithUnescapedPipe || trailingBackslashes % 2 === 1;
  }
}
