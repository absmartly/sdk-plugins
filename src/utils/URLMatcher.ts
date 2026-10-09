import { logDebug } from './debug';
import type { NormalizedURLFilter, URLMatchType } from '../types';

interface CompiledFilter {
  include?: RegExp[];
  exclude: RegExp[];
}

// Filters are re-evaluated per variant and on every SPA navigation, so compile
// each one once. Keyed by identity; parsed filters live as long as the cache
// that holds them.
const compiledFilters = new WeakMap<NormalizedURLFilter, CompiledFilter>();

export class URLMatcher {
  /**
   * Check if current URL matches the filter. The filter must come from
   * parseURLFilter, which has already validated and trimmed its patterns.
   */
  static matches(filter: NormalizedURLFilter, url: string = window.location.href): boolean {
    const { include, exclude } = this.compile(filter);

    // Extract the part of URL to match based on matchType
    const urlPart = this.extractURLPart(url, filter.matchType);

    // Check exclusions first
    if (exclude.some(regex => regex.test(urlPart))) {
      return false;
    }

    // Check inclusions
    if (!include) {
      return true; // No include property = match all
    }

    // Empty include array = match nothing (explicit "include nothing")
    return include.some(regex => regex.test(urlPart));
  }

  private static compile(filter: NormalizedURLFilter): CompiledFilter {
    let compiled = compiledFilters.get(filter);

    if (!compiled) {
      const toRegExp = (pattern: string): RegExp =>
        filter.mode === 'regex' ? new RegExp(pattern) : this.simplePatternToRegExp(pattern);

      compiled = {
        include: filter.include?.map(toRegExp),
        exclude: filter.exclude.map(toRegExp),
      };
      compiledFilters.set(filter, compiled);
    }

    return compiled;
  }

  /**
   * Extract the relevant part of the URL based on matchType
   */
  private static extractURLPart(url: string, matchType: URLMatchType): string {
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
