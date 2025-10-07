# URL Filtering Feature Plan

## Overview

Add URL filtering capability to the DOM Changes SDK Plugin to allow DOM changes to be applied only on specific pages/URLs. This is a common requirement for A/B testing tools (e.g., Statsig, Optimizely) where different experiments should run on different pages.

## Current State

Currently, `__dom_changes` is stored as a simple array of DOM changes:

```typescript
__dom_changes: DOMChange[]
```

All changes in this array are applied globally on every page where the SDK is loaded, with no way to control which pages receive which changes.

## Proposed Solution

### 1. New Data Structure

Change `__dom_changes` from an array to an object that supports both the legacy array format (for backward compatibility) and the new object format:

```typescript
// New format (preferred)
__dom_changes: {
  changes: DOMChange[];
  urlFilter?: string | string[] | URLFilterConfig;

  // Global defaults that can be overridden per-change
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

// Legacy format (backward compatible)
__dom_changes: DOMChange[]
```

### 2. URL Filter Options

#### Simple String Pattern
```typescript
urlFilter: "https://example.com/products/*"
```

#### Multiple Patterns
```typescript
urlFilter: [
  "https://example.com/products/*",
  "https://example.com/shop/*"
]
```

#### Advanced Configuration
```typescript
urlFilter: {
  include?: string[];  // Match any of these patterns
  exclude?: string[];  // Exclude these patterns
  mode?: 'simple' | 'regex';  // Pattern matching mode
}
```

### 3. Pattern Matching Rules

#### Simple Mode (Default)
- `*` - wildcard matching any characters
- `?` - matches single character
- Exact string match if no wildcards

Examples:
- `https://example.com/products/*` - matches all product pages
- `https://example.com/products/*/details` - matches product detail pages
- `*/checkout` - matches checkout on any domain
- `*example.com*` - matches any URL containing example.com

#### Regex Mode
Full regex pattern matching for complex requirements:
```typescript
urlFilter: {
  include: ["^https://example\\.com/(products|shop)/.*"],
  mode: 'regex'
}
```

### 4. Implementation Details

#### URLMatcher Utility

Create a new utility class/module for URL matching:

```typescript
// src/utils/URLMatcher.ts

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
        return new RegExp(pattern).test(url);
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
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex chars except * and ?
      .replace(/\*/g, '.*')  // * to .*
      .replace(/\?/g, '.');  // ? to .

    return new RegExp(`^${regexPattern}$`).test(url);
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
      mode: filter.mode || 'simple'
    };
  }
}
```

#### Update DOMChangesPluginLite

```typescript
// src/core/DOMChangesPluginLite.ts

import { URLMatcher } from '../utils/URLMatcher';

async applyChanges(): Promise<void> {
  const changesMap = this.variantExtractor.extractChanges();

  for (const [expName, changesData] of changesMap) {
    // Check if changesData has URL filter
    if (this.isNewFormat(changesData)) {
      // Check URL filter
      if (changesData.urlFilter && !URLMatcher.matches(changesData.urlFilter)) {
        logDebug(`[ABsmartly] Skipping experiment '${expName}' - URL filter doesn't match`);
        continue;
      }

      // Apply global defaults to changes
      const changes = this.applyGlobalDefaults(changesData.changes, changesData);

      // Apply changes...
    } else {
      // Legacy format - apply all changes
      // Apply changes...
    }
  }
}

private isNewFormat(data: any): data is DOMChangesConfig {
  return data && typeof data === 'object' && !Array.isArray(data) && 'changes' in data;
}

private applyGlobalDefaults(changes: DOMChange[], config: DOMChangesConfig): DOMChange[] {
  return changes.map(change => ({
    ...change,
    // Apply global defaults only if not set on change
    waitForElement: change.waitForElement ?? config.waitForElement,
    persistStyle: change.persistStyle ?? config.persistStyle,
    important: change.important ?? config.important,
    observerRoot: change.observerRoot ?? config.observerRoot,
  }));
}
```

#### Update Type Definitions

```typescript
// src/types/index.ts

export interface DOMChangesConfig {
  changes: DOMChange[];
  urlFilter?: URLFilter;

  // Global defaults
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

export type DOMChangesData = DOMChange[] | DOMChangesConfig;

export interface DOMChange {
  selector: string;
  type: ChangeType;
  value?: DOMChangeValue;
  enabled?: boolean;

  // Per-change overrides
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;

  // ... rest of existing fields
}
```

### 5. Backward Compatibility

The plugin must support both formats:

```typescript
// Legacy format (continues to work)
__dom_changes: [
  { selector: '.btn', type: 'text', value: 'Click Me' }
]

// New format
__dom_changes: {
  urlFilter: 'https://example.com/products/*',
  waitForElement: true,  // Applied to all changes by default
  changes: [
    { selector: '.btn', type: 'text', value: 'Click Me' },
    { selector: '.title', type: 'text', value: 'Sale!', waitForElement: false }  // Override
  ]
}
```

### 6. SPA Mode Considerations

For Single Page Applications, URL changes happen without page reloads. The plugin should:

1. Listen to `popstate` and `pushstate` events
2. Re-evaluate URL filters when URL changes
3. Remove changes that no longer match
4. Apply new changes that now match

```typescript
setupURLChangeListener(): void {
  if (!this.config.spa) return;

  const handleURLChange = () => {
    // Re-evaluate all experiments
    this.reapplyChangesForURL();
  };

  window.addEventListener('popstate', handleURLChange);

  // Intercept pushState and replaceState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    handleURLChange();
  };
}

async reapplyChangesForURL(): Promise<void> {
  // Remove all current changes
  this.removeAllChanges();

  // Re-apply with URL filtering
  await this.applyChanges();
}
```

## Migration Path

### Phase 1: Add Support
1. Implement URLMatcher utility
2. Update DOMChangesPluginLite to handle both formats
3. Update type definitions
4. Add comprehensive tests

### Phase 2: Browser Extension Integration
1. Update browser extension to use new format
2. Add URL filter UI to the DOM changes editor
3. Update storage/API to save URL filters

### Phase 3: Documentation
1. Update README with URL filtering examples
2. Add migration guide for existing users
3. Document pattern matching syntax

## Testing Requirements

### Unit Tests
- URLMatcher with various patterns (simple and regex)
- Backward compatibility with array format
- Global defaults application
- URL change detection in SPA mode

### Integration Tests
- End-to-end flow with URL filtering
- SPA navigation scenarios
- Include/exclude pattern combinations

### Test Cases
```typescript
describe('URLMatcher', () => {
  it('matches exact URLs', () => {
    expect(URLMatcher.matches('https://example.com/page', 'https://example.com/page')).toBe(true);
  });

  it('matches wildcard patterns', () => {
    expect(URLMatcher.matches('https://example.com/*', 'https://example.com/any/path')).toBe(true);
  });

  it('handles exclude patterns', () => {
    const filter = {
      include: ['https://example.com/*'],
      exclude: ['https://example.com/admin/*']
    };
    expect(URLMatcher.matches(filter, 'https://example.com/products')).toBe(true);
    expect(URLMatcher.matches(filter, 'https://example.com/admin/users')).toBe(false);
  });

  it('supports regex mode', () => {
    const filter = {
      include: ['^https://example\\.com/(products|shop)/.*'],
      mode: 'regex' as const
    };
    expect(URLMatcher.matches(filter, 'https://example.com/products/123')).toBe(true);
    expect(URLMatcher.matches(filter, 'https://example.com/about')).toBe(false);
  });
});
```

## Benefits

1. **Targeted Experiments**: Run different experiments on different pages
2. **Performance**: Only apply relevant changes on each page
3. **Flexibility**: Support simple wildcards for common cases, regex for complex needs
4. **Clean Architecture**: Move global options out of individual changes
5. **Backward Compatible**: Existing implementations continue to work
6. **SPA Support**: Properly handle URL changes in single-page apps

## Example Use Cases

### E-commerce Site
```typescript
// Product page experiment
__dom_changes: {
  urlFilter: 'https://shop.example.com/products/*',
  waitForElement: true,
  changes: [
    { selector: '.add-to-cart', type: 'text', value: 'Add to Bag' },
    { selector: '.price', type: 'style', value: { color: 'red', fontSize: '24px' } }
  ]
}

// Checkout page experiment (different variant)
__dom_changes: {
  urlFilter: 'https://shop.example.com/checkout',
  changes: [
    { selector: '.checkout-btn', type: 'text', value: 'Complete Purchase' }
  ]
}
```

### Multi-domain Support
```typescript
__dom_changes: {
  urlFilter: {
    include: ['*example.com/*', '*example.net/*'],
    exclude: ['*example.com/admin/*']
  },
  changes: [...]
}
```

## Open Questions

1. Should URL filtering be evaluated per-change or per-experiment?
   - **Recommendation**: Per-experiment (as proposed) for simplicity and performance

2. Should we support hash fragments and query parameters in matching?
   - **Recommendation**: Yes, match against full URL including hash and query

3. How to handle URL filter errors (invalid regex, etc.)?
   - **Recommendation**: Log error and skip the experiment (fail safe)

## Implementation Priority

1. **High Priority**
   - URLMatcher utility with simple pattern matching
   - Basic URL filter support (include only)
   - Backward compatibility
   - Browser extension integration

2. **Medium Priority**
   - Exclude patterns
   - Regex mode
   - SPA URL change handling
   - Global defaults feature

3. **Low Priority**
   - Advanced URL matching features
   - Performance optimizations
   - Detailed analytics/logging
