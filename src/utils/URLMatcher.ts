export interface URLFilterConfig {
  include?: string[];
  exclude?: string[];
  mode?: 'simple' | 'regex';
}

export type URLFilter = string | string[] | URLFilterConfig;

export class URLMatcher {
  /**
   * Check if current URL matches the filter
   */
  static matches(filter: URLFilter, url: string = window.location.href): boolean {
    // Normalize filter to URLFilterConfig
    const config = this.normalizeFilter(filter);

    // Check exclusions first
    if (config.exclude && this.matchesPatterns(config.exclude, url, config.mode)) {
      return false;
    }

    // Check inclusions
    if (!config.include || config.include.length === 0) {
      return true; // No filter = match all
    }

    return this.matchesPatterns(config.include, url, config.mode);
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
      return { include: [filter], exclude: [], mode: 'simple' };
    }

    if (Array.isArray(filter)) {
      return { include: filter, exclude: [], mode: 'simple' };
    }

    return {
      include: filter.include || [],
      exclude: filter.exclude || [],
      mode: filter.mode || 'simple',
    };
  }
}
