export interface URLFilterConfig {
  include?: string[];
  exclude?: string[];
  mode?: 'simple' | 'regex';
  matchType?: 'full-url' | 'path' | 'domain' | 'query' | 'hash';
}

export type URLFilter = string | string[] | URLFilterConfig;

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
    if (!config.include || config.include.length === 0) {
      return true; // No filter = match all
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
      console.error(`[ABsmartly] Failed to parse URL: ${url}`, error);
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
          console.error(`[ABsmartly] Invalid regex pattern: ${pattern}`, error);
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
      console.error(`[ABsmartly] Invalid pattern: ${pattern}`, error);
      return false;
    }
  }

  private static normalizeFilter(filter: URLFilter): Required<URLFilterConfig> {
    if (typeof filter === 'string') {
      return { include: [filter], exclude: [], mode: 'simple', matchType: 'path' };
    }

    if (Array.isArray(filter)) {
      return { include: filter, exclude: [], mode: 'simple', matchType: 'path' };
    }

    return {
      include: filter.include || [],
      exclude: filter.exclude || [],
      mode: filter.mode || 'simple',
      matchType: filter.matchType || 'path',
    };
  }
}
