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

### 6. URL Filtering & Tracking (SRM Prevention)

**Critical Design Principle**: URL filtering controls **visual changes only**, not tracking. This prevents Sample Ratio Mismatch (SRM).

**Rationale**:
- Each change in `__dom_changes` array can have its own `urlFilter`
- A single change can match multiple URLs: `urlFilter: ["*/products/*", "*/checkout"]`
- When URL changes, re-evaluate ALL changes to see which ones should now be applied
- Don't revert existing changes (abrupt removal = poor UX, elements often not visible anyway)
- Keep it simple - only apply forward, never revert
- **URL filtering works like visibility tracking** - if ANY variant has changes for the URL, ALL variants must be tracked

**Important**: Each individual change can have its own `urlFilter`. Example:

```typescript
// Variant 1 of experiment "header_redesign"
__dom_changes: [
  {
    selector: '.header',
    type: 'style',
    value: { backgroundColor: 'blue' },
    urlFilter: "*/products/*"  // Only on product pages
  },
  {
    selector: '.header',
    type: 'style',
    value: { backgroundColor: 'green' },
    urlFilter: "*/checkout"  // Only on checkout
  },
  {
    selector: '.cta-button',
    type: 'text',
    value: 'Shop Now',
    urlFilter: ["*/products/*", "*/shop/*"]  // On BOTH product and shop pages
  },
  {
    selector: '.footer',
    type: 'text',
    value: 'New Footer'
    // No urlFilter = applies EVERYWHERE
  }
]
```

#### Understanding SRM Prevention

Consider this experiment:
```typescript
// Experiment "cta_test" with 2 variants
// Variant 0 (control): No changes
// Variant 1 (treatment): {
//   urlFilter: "/products/*",
//   changes: [{ selector: '.cta', type: 'text', value: 'Buy Now', onView: true }]
// }
```

**Correct Behavior** (prevents SRM):
```typescript
// User visits /products/shoes

// Variant 0 user:
// - Check: Does ANY variant have changes for /products/*? YES (variant 1)
// - Setup: Create intersection observer for '.cta' tracking (same as variant 1)
// - Visual: No changes applied (variant 0 has no changes)
// - Result: ✅ User tracked when .cta becomes visible

// Variant 1 user:
// - Check: Does ANY variant have changes for /products/*? YES (variant 1)
// - Setup: Create intersection observer for '.cta' tracking
// - Visual: Apply text change to .cta
// - Result: ✅ User tracked when .cta becomes visible
```

Both variants tracked identically → No SRM!

**Implementation**: The plugin must check ALL variants of an experiment to determine if tracking should occur

```typescript
// src/core/DOMChangesPluginLite.ts

async ready(): Promise<void> {
  // ... existing initialization

  if (this.config.spa) {
    this.setupMutationObserver();
    this.setupURLChangeListener();
  }

  if (this.config.autoApply) {
    await this.applyChanges();
  }

  // ... rest of initialization
}

setupURLChangeListener(): void {
  if (!this.config.spa) return;

  const handleURLChange = () => {
    this.applyChanges();  // Re-run full logic for new URL
  };

  window.addEventListener('popstate', handleURLChange);

  // Intercept pushState and replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = (...args) => {
    originalPushState.apply(history, args);
    handleURLChange();
  };

  history.replaceState = (...args) => {
    originalReplaceState.apply(history, args);
    handleURLChange();
  };
}

async applyChanges(experimentName?: string): Promise<void> {
  const startTime = performance.now();
  const currentURL = window.location.href;

  logDebug('Starting to apply changes with URL filtering', {
    specificExperiment: experimentName || 'all',
    currentURL,
  });

  await this.config.context.ready();

  this.variantExtractor.clearCache();

  // Get all experiments with variant data
  const allExperimentsData = experimentName
    ? new Map([[experimentName, this.variantExtractor.getAllVariantsData(experimentName)]])
    : this.getAllExperimentsData();

  let totalApplied = 0;
  const experimentStats = new Map<string, { total: number; success: number; pending: number }>();

  for (const [expName, allVariantsData] of allExperimentsData) {
    // Step 1: Check if ANY variant has changes matching current URL
    const anyVariantMatchesURL = this.variantExtractor.anyVariantMatchesURL(expName, currentURL);

    if (!anyVariantMatchesURL) {
      // No variant has changes for this URL - skip entire experiment
      logDebug(`[ABsmartly] Skipping experiment '${expName}' - no variant matches URL ${currentURL}`);
      continue;
    }

    // Step 2: Get user's assigned variant data
    const userVariant = this.config.context.peek(expName) || 0;
    const userVariantData = allVariantsData.get(userVariant);

    if (!userVariantData) {
      logDebug(`[ABsmartly] No data for variant ${userVariant} in experiment '${expName}'`);
      continue;
    }

    // Extract changes array from variant data (handle both formats)
    const userChanges = this.extractChangesFromData(userVariantData);
    const allVariantChanges = this.extractAllVariantChanges(allVariantsData);

    // Step 3: Setup tracking for this experiment
    // This happens because ANY variant matches URL (prevents SRM)
    let hasImmediateTrigger = false;
    let hasViewportTrigger = false;

    // Check ALL variants for trigger types (same as current implementation)
    allVariantChanges.forEach(variantChanges => {
      variantChanges.forEach(change => {
        if (change.trigger_on_view) {
          hasViewportTrigger = true;
        } else {
          hasImmediateTrigger = true;
        }
      });
    });

    if (hasViewportTrigger || hasImmediateTrigger) {
      this.exposureTracker.registerExperiment(
        expName,
        userVariant,
        userChanges,
        allVariantChanges
      );
    }

    // Step 4: Apply visual changes ONLY if user's variant matches URL
    const shouldApplyVisual = this.shouldApplyVisualChanges(userVariantData, currentURL);

    if (shouldApplyVisual) {
      const stats = { total: userChanges.length, success: 0, pending: 0 };

      for (const change of userChanges) {
        const success = this.domManipulator.applyChange(change, expName);

        if (success) {
          totalApplied++;
          stats.success++;
        } else if (change.type !== 'create' && change.type !== 'styleRules') {
          try {
            const elements = document.querySelectorAll(change.selector);
            if (elements.length === 0 && (this.config.spa || change.waitForElement)) {
              stats.pending++;
            }
          } catch (error) {
            // Invalid selector, ignore
          }
        }
      }

      experimentStats.set(expName, stats);
      logExperimentSummary(expName, stats.total, stats.success, stats.pending);
    } else {
      logDebug(`[ABsmartly] Tracking experiment '${expName}' but NOT applying visual changes - URL doesn't match user's variant filter`);
    }

    // Trigger immediate exposure if needed
    if (hasImmediateTrigger && !hasViewportTrigger) {
      await this.config.context.ready();
      this.config.context.treatment(expName);
      this.exposedExperiments.add(expName);
      logDebug(`Triggered immediate exposure for experiment: ${expName}`);
    }
  }

  const duration = performance.now() - startTime;
  logPerformance('Apply changes with URL filtering', duration, {
    totalApplied,
    experiments: experimentStats.size,
    currentURL,
  });

  // Show hidden content after changes are applied
  if (this.config.hideUntilReady) {
    this.showContent();
  }

  this.emit('changes-applied', { count: totalApplied, experimentName });
}

/**
 * Get all experiments with their variant data (including URL filters)
 */
private getAllExperimentsData(): Map<string, Map<number, DOMChangesData>> {
  const allExperimentsData = new Map<string, Map<number, DOMChangesData>>();
  const contextData = this.config.context.data() as ContextData;

  if (contextData?.experiments) {
    for (const experiment of contextData.experiments) {
      const variantsData = this.variantExtractor.getAllVariantsData(experiment.name);
      if (variantsData.size > 0) {
        allExperimentsData.set(experiment.name, variantsData);
      }
    }
  }

  return allExperimentsData;
}

/**
 * Extract changes array from variant data (handles both formats)
 */
private extractChangesFromData(variantData: DOMChangesData): DOMChange[] {
  if (Array.isArray(variantData)) {
    return variantData; // Legacy format
  }
  return variantData.changes; // New format
}

/**
 * Extract all variant changes as array (for ExposureTracker)
 */
private extractAllVariantChanges(allVariantsData: Map<number, DOMChangesData>): DOMChange[][] {
  const maxVariant = Math.max(...allVariantsData.keys());
  const variantArray: DOMChange[][] = [];

  for (let i = 0; i <= maxVariant; i++) {
    const data = allVariantsData.get(i);
    variantArray.push(data ? this.extractChangesFromData(data) : []);
  }

  return variantArray;
}

/**
 * Check if visual changes should be applied for user's variant
 */
private shouldApplyVisualChanges(variantData: DOMChangesData, url: string): boolean {
  // Legacy array format = no filter = apply everywhere
  if (Array.isArray(variantData)) {
    return true;
  }

  // New format - check URL filter
  if (!variantData.urlFilter) {
    return true; // No filter = apply everywhere
  }

  return URLMatcher.matches(variantData.urlFilter, url);
}

/**
 * Check if data is new format with URL filter support
 */
private isNewFormat(data: DOMChangesData): data is DOMChangesConfig {
  return data && typeof data === 'object' && !Array.isArray(data) && 'changes' in data;
}
```

**Behavior**:
- Initial page load: Setup tracking if ANY variant matches URL, apply visual changes only for user's variant if it matches
- URL changes in SPA: Re-evaluate everything - setup tracking and apply visuals as needed
- Existing changes: Persist (don't remove, even if URL no longer matches)
- Full page reload: Re-evaluate everything from scratch

**Example Scenario**:
```typescript
// Experiment "hero_banner" has 2 variants:
// Variant 0 (control): No changes
// Variant 1: { urlFilter: "*/products/*", changes: [{ selector: '.hero', onView: true, ... }] }

// User assigned to variant 0
// 1. Load /home → No tracking (no variant matches /home)
// 2. Navigate to /products/shoes → Setup intersection observer for .hero (variant 1 matches)
//                                  → No visual changes (variant 0 has no changes)
//                                  → Track when .hero visible ✅
// 3. Navigate to /cart → Tracking persists, no new setup

// User assigned to variant 1
// 1. Load /home → No tracking (variant 1 doesn't match /home)
// 2. Navigate to /products/shoes → Setup intersection observer for .hero
//                                  → Apply visual changes
//                                  → Track when .hero visible ✅
// 3. Navigate to /cart → Visual changes persist, tracking persists
```

**Key Points**:
- URL filtering is just another dimension of visibility tracking
- Tracking happens when ANY variant matches URL (prevents SRM)
- Visual changes apply only when user's variant matches URL
- Reuses existing visibility tracking infrastructure (observers, placeholders)
- No separate tracking system needed

## Implementation Gaps & Required Changes

### Files That Need Modification

#### 1. **src/types/index.ts** - Type Definitions
**Changes:**
- Add `URLFilter` and `URLFilterConfig` types (lines 95-99 in plan)
- Add `DOMChangesConfig` interface (lines 219-228 in plan)
- Add `DOMChangesData` union type (line 230 in plan)

**Status:** ⚠️ Types don't exist yet

#### 2. **src/utils/URLMatcher.ts** - NEW FILE
**Changes:**
- Create complete URLMatcher utility class (lines 93-166 in plan)
- Implement simple pattern matching (wildcards)
- Implement regex mode
- Handle include/exclude patterns

**Status:** ⚠️ File doesn't exist

#### 3. **src/parsers/VariantExtractor.ts** - Major Changes
**Current Issues:**
- Only extracts user's assigned variant
- No access to other variants' URL filters
- No cross-variant URL checking

**Changes Needed:**
- Add `getAllVariantsData(experimentName: string): Map<number, DOMChangesData>` method (lines 701-718)
- Add `anyVariantMatchesURL(experimentName: string, url: string): boolean` method (lines 723-744)
- Modify `extractAllVariantsForExperiment()` to handle wrapped format (line 119)
- Add helper `extractVariantData(variant)` to handle both array and object formats

**Status:** ⚠️ Major refactor required

#### 4. **src/core/DOMChangesPluginLite.ts** - Complete Rewrite of applyChanges()
**Current Issues:**
- No URL change detection for SPA mode
- Only works with user's variant (no cross-variant logic)
- No URL filter evaluation

**Changes Needed:**
- Replace `applyChanges()` method entirely (lines 388-509 - new implementation)
- Add `setupURLChangeListener()` method (lines 364-386)
- Add `getAllExperimentsData()` helper (lines 514-528)
- Add `extractChangesFromData()` helper (lines 533-538)
- Add `extractAllVariantChanges()` helper (lines 543-553)
- Add `shouldApplyVisualChanges()` method (lines 558-570)
- Update `ready()` to call URL listener setup (add line 84-85: `if (this.config.spa) { this.setupURLChangeListener(); }`)

**Status:** ⚠️ Critical - Largest change required

#### 5. **src/core/ExposureTracker.ts** - No Changes
**Status:** ✅ ExposureTracker can remain unchanged (URL filtering happens before calling it)

### Summary of Implementation Effort

**Easy (< 1 hour):**
- URLMatcher utility (well-defined, self-contained)
- Type definitions updates

**Medium (2-4 hours):**
- VariantExtractor methods (need careful handling of both formats)
- URL change listener setup

**Hard (4-8 hours):**
- DOMChangesPluginLite.applyChanges() rewrite (complex logic, many dependencies)
- Comprehensive testing (SRM scenarios, cross-variant tracking)
- Backward compatibility verification

**Total Estimated Effort:** 8-15 hours development + 4-6 hours testing

### Testing Requirements (Updated)

**Critical Test Scenarios:**

1. **SRM Prevention**
   - Variant 0 (control): No changes
   - Variant 1: Changes on `/products/*` with `trigger_on_view: true`
   - Visit `/products/shoes`
   - Assert: BOTH variants tracked when element visible

2. **Cross-Variant URL Matching**
   - Variant 0: Changes on `/checkout`
   - Variant 1: Changes on `/products/*`
   - User assigned to variant 0
   - Visit `/products/shoes`
   - Assert: Tracking setup (variant 1 matches), NO visual changes (variant 0 doesn't match)

3. **Backward Compatibility**
   - Legacy array format: `__dom_changes: [...]`
   - Assert: Works identically to before (no URL filtering)

4. **SPA URL Changes**
   - Initial URL: `/home`
   - Navigate to `/products/*` (SPA navigation)
   - Assert: New tracking setup, changes applied

5. **Global Defaults**
   - `__dom_changes: { waitForElement: true, changes: [...] }`
   - Assert: All changes inherit `waitForElement: true`

## Migration Path

### Phase 1: Foundation (2-3 hours)
1. ✅ Create URLMatcher utility (`src/utils/URLMatcher.ts`)
2. ✅ Update type definitions (`src/types/index.ts`)
3. ✅ Add unit tests for URLMatcher

### Phase 2: Data Layer (3-4 hours)
1. ✅ Update VariantExtractor to handle new format
2. ✅ Add `getAllVariantsData()` method
3. ✅ Add `anyVariantMatchesURL()` method
4. ✅ Add integration tests for VariantExtractor

### Phase 3: Application Logic (4-6 hours)
1. ✅ Rewrite DOMChangesPluginLite.applyChanges()
2. ✅ Add URL change listener for SPA mode
3. ✅ Add helper methods for data extraction
4. ✅ Ensure backward compatibility

### Phase 4: Testing & Validation (4-6 hours)
1. ✅ Add comprehensive SRM prevention tests
2. ✅ Add cross-variant tracking tests
3. ✅ Add backward compatibility tests
4. ✅ Add SPA URL change tests
5. ✅ Manual testing with real experiments

### Phase 5: Browser Extension Integration (Future)
1. Update browser extension types to support new format
2. Add URL filter UI to the DOM changes editor
3. Update storage/API to save new format

### Phase 6: Documentation (Future)
1. Update README with URL filtering examples
2. Add migration guide for existing users
3. Document pattern matching syntax

## Testing Requirements

### Unit Tests
- URLMatcher with various patterns (simple and regex)
- Backward compatibility with array format
- Global defaults application
- Format detection (array vs object)

### Integration Tests
- End-to-end flow with URL filtering
- Multiple experiments with different URL filters
- Include/exclude pattern combinations
- Legacy array format still works

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
2. **Performance**: Only apply relevant changes on each page - skip experiments that don't match
3. **Flexibility**: Support simple wildcards for common cases, regex for complex needs
4. **Clean Architecture**: Move global options out of individual changes
5. **Backward Compatible**: Existing implementations continue to work
6. **Lightweight**: Simple one-time evaluation, no state tracking overhead

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

## Critical Implementation Analysis

### Current Implementation Review

After analyzing the existing codebase (`DOMChangesPluginLite`, `VariantExtractor`, `ExposureTracker`), several **critical gaps** between this plan and the actual implementation have been identified.

### Key Architectural Considerations

#### 1. **Data Structure Decision** ⚠️ **DECISION REQUIRED**

**The Plan Shows Two Conflicting Approaches:**

**Option A: Per-Variant URL Filtering** (Main plan, lines 25-34)
```typescript
__dom_changes: {
  urlFilter: "https://example.com/products/*",  // Variant-level
  changes: [...]
}
```

**Option B: Per-Change URL Filtering** (Example, lines 284-310)
```typescript
__dom_changes: [
  {
    selector: '.header',
    urlFilter: "*/products/*",  // Change-level
    // ...
  }
]
```

**Current Implementation:**
- `DOMChange` interface has NO `urlFilter` field
- `VariantExtractor` expects: `variant.variables.__dom_changes` = `DOMChange[]` (simple array)
- No wrapper object support currently exists

**✅ RECOMMENDATION: Option A (Per-Variant) + Backward Compatibility**

**Rationale:**
1. **Simpler mental model** - "This variant applies on these URLs"
2. **Better performance** - Single filter check per variant, not per change
3. **Matches existing architecture** - ExposureTracker already works at variant level
4. **Cleaner for users** - Most experiments target specific pages as a whole
5. **Backward compatible** - Can still support array format

**Implementation:**
```typescript
// New format (preferred)
__dom_changes: {
  changes: DOMChange[];
  urlFilter?: string | string[] | URLFilterConfig;
  // Global defaults
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

// Legacy format (backward compatible)
__dom_changes: DOMChange[]
```

**Type updates needed:**
```typescript
// src/types/index.ts
export interface DOMChangesConfig {
  changes: DOMChange[];
  urlFilter?: URLFilter;
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

export type DOMChangesData = DOMChange[] | DOMChangesConfig;
```

### 2. **Missing Cross-Variant Access Methods**

**Current Problem:**
- `applyChanges()` only accesses user's assigned variant via `this.config.context.peek(expName)`
- No way to check if OTHER variants have URL filters matching current URL
- ExposureTracker needs ALL variants' data but has no URL awareness

**Methods That Don't Exist But Are Needed:**

```typescript
// In VariantExtractor
getAllVariantsDataWithMetadata(experimentName: string): Map<number, DOMChangesData>
// Returns all variants' data (not just changes), including URL filters

checkAnyVariantMatchesURL(experimentName: string, url: string): boolean
// Cross-variant check: does ANY variant have changes for this URL?
```

**✅ RECOMMENDATION: Add Helper Methods to VariantExtractor**

```typescript
// src/parsers/VariantExtractor.ts

/**
 * Get all variants' data including URL filters (not just the user's variant)
 */
getAllVariantsData(experimentName: string): Map<number, DOMChangesData> {
  const contextData = this.context.data() as ContextData;
  const experiment = contextData?.experiments?.find(e => e.name === experimentName);

  if (!experiment?.variants) return new Map();

  const variantsData = new Map<number, DOMChangesData>();

  for (let i = 0; i < experiment.variants.length; i++) {
    const variant = experiment.variants[i];
    const data = this.extractVariantData(variant); // Extract with URL filter
    if (data) {
      variantsData.set(i, data);
    }
  }

  return variantsData;
}

/**
 * Check if ANY variant has changes that match the given URL
 */
anyVariantMatchesURL(experimentName: string, url: string): boolean {
  const allVariantsData = this.getAllVariantsData(experimentName);

  for (const [_, variantData] of allVariantsData) {
    if (this.isNewFormat(variantData)) {
      // Has URL filter - check if it matches
      if (variantData.urlFilter) {
        if (URLMatcher.matches(variantData.urlFilter, url)) {
          return true;
        }
      } else {
        // No filter = matches all URLs
        return true;
      }
    } else {
      // Legacy array format = no filter = matches all URLs
      return true;
    }
  }

  return false;
}
```

### 3. **ExposureTracker Integration**

**Current Implementation:**
- ExposureTracker.registerExperiment() already takes `allVariantsChanges: DOMChange[][]`
- Already implements cross-variant tracking (creates placeholders for non-matching variants)
- **BUT**: Has no concept of URLs - assumes all selectors need tracking

**✅ RECOMMENDATION: Keep ExposureTracker URL-Agnostic**

**Rationale:**
- ExposureTracker's job is visibility tracking, not URL filtering
- URL filtering is a higher-level concern
- Simpler to handle URL filtering in `applyChanges()` before calling ExposureTracker

**Approach:**
```typescript
// In DOMChangesPluginLite.applyChanges()

// Only call registerExperiment if ANY variant matches current URL
if (anyVariantMatchesURL) {
  this.exposureTracker.registerExperiment(
    expName,
    currentVariant,
    currentChanges,
    allVariantChanges
  );
}
```

This keeps URL logic separate from visibility tracking logic.

## Design Decisions

1. **URL filtering controls visual changes only, not tracking**
   - Prevents Sample Ratio Mismatch (SRM)
   - If ANY variant has changes for URL, ALL variants tracked
   - Visual changes applied only to matching variants
   - Same principle as visibility tracking with `onView`

2. **✅ URL filtering is per-variant** (**RECOMMENDED**)
   - Simpler, more performant
   - Cleaner mental model for users
   - Matches existing architecture
   - Backward compatible with array format

3. **URL matching includes hash and query parameters**
   - Match against full `window.location.href`
   - More precise control

4. **Track URL changes, apply forward only (no reversal)**
   - Listen for URL changes in SPA mode
   - Setup tracking when ANY variant matches new URL
   - Apply visual changes only for user's variant if it matches
   - Never remove existing changes
   - Simple: apply forward only, no complex state tracking

5. **Reuse existing visibility tracking infrastructure**
   - URL filtering integrates with existing observers/placeholders
   - No separate tracking system needed
   - Consistent behavior with `onView` tracking
   - **ExposureTracker remains URL-agnostic** - URL filtering happens before calling it

6. **Error handling: fail safe**
   - Invalid regex → log error and skip experiment
   - Invalid pattern → log error and skip experiment
   - Better to skip than to crash or apply incorrectly

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
