# URL Filtering Tests Specification

## Objective
Create comprehensive tests for URL filtering functionality in `DOMChangesPluginLite`, ensuring proper SRM (Sample Ratio Mismatch) prevention and exposure tracking.

## File Location
`src/core/__tests__/DOMChangesPluginLite.urlFiltering.test.ts`

## Key Concepts

### SRM Prevention Rule
**Critical**: If ANY variant of an experiment has a URL filter that matches the current URL, then ALL variants must be tracked for exposure (via `context.treatment()`). This prevents Sample Ratio Mismatch in A/B test results.

- If variant 1 has filter `/products/*` and current URL is `/products/123` → Track ALL variants (0, 1, 2, etc.)
- If no variants match the current URL → Don't track ANY variants
- Visual changes only apply if the user's assigned variant's URL filter matches

### URL Filter Formats
```typescript
// Simple string
urlFilter: '/products/*'

// Array of patterns
urlFilter: ['/home', '/landing', '/promo/*']

// Complex config
urlFilter: {
  include: ['/products/*', '/categories/*'],
  exclude: ['/products/hidden/*'],
  matchType: 'path' // or 'full-url', 'domain', 'query', 'hash'
}
```

## Test File Structure

```typescript
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { MockContextFactory, TestDataFactory } from '../../__tests__/test-utils';
import { DOMChange, ExperimentData, DOMChangesConfig } from '../../types';

describe('DOMChangesPluginLite - URL Filtering', () => {
  let plugin: DOMChangesPluginLite;
  let mockContext: any;
  let treatmentSpy: jest.Mock;
  let originalLocation: Location;

  beforeEach(() => {
    document.body.innerHTML = '';

    // Save original location
    originalLocation = window.location;

    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: 'https://example.com/' } as any;
  });

  afterEach(() => {
    // Restore original location
    window.location = originalLocation;
    jest.clearAllMocks();
  });

  // Helper functions here...
});
```

## Helper Functions

### 1. Create Experiment with URL Filters
```typescript
function createExperimentWithURLFilters(config: {
  experimentName: string;
  variants: Array<{
    urlFilter?: string | string[] | any; // URLFilter type
    changes: DOMChange[];
  }>;
}): ExperimentData {
  return {
    name: config.experimentName,
    id: 1,
    unitType: 'user_id',
    trafficSplit: Array(config.variants.length).fill(1 / config.variants.length),
    variants: config.variants.map((v, index) => {
      const domChangesConfig: DOMChangesConfig = {
        changes: v.changes,
      };

      if (v.urlFilter !== undefined) {
        domChangesConfig.urlFilter = v.urlFilter;
      }

      return {
        name: `variant_${index}`,
        variables: {
          __dom_changes: domChangesConfig,
        },
      };
    }),
  };
}
```

### 2. Set Test URL
```typescript
function setTestURL(url: string): void {
  delete (window as any).location;
  window.location = { href: url } as any;
}
```

### 3. Create Treatment Tracker
```typescript
function createTreatmentTracker(experiments: ExperimentData[], assignedVariants: Record<string, number>) {
  const treatmentSpy = jest.fn();
  const mockContext = MockContextFactory.create(experiments);

  // Mock peek to return assigned variants
  (mockContext.peek as jest.Mock).mockImplementation(
    (expName: string) => assignedVariants[expName] ?? 0
  );

  // Mock treatment to track calls
  (mockContext.treatment as jest.Mock).mockImplementation((expName: string) => {
    treatmentSpy(expName);
    return assignedVariants[expName] ?? 0;
  });

  return { mockContext, treatmentSpy };
}
```

## Test Suites

### Suite 1: SRM Prevention - Single Variant with URL Filter

#### Test 1: Track all variants when one variant's URL filter matches
```typescript
it('should track all variants when only variant 1 has URL filter matching current URL', async () => {
  // Setup: 3 variants, only variant 1 has URL filter
  const experiment = createExperimentWithURLFilters({
    experimentName: 'test_experiment',
    variants: [
      { changes: [] }, // Variant 0: No filter, no changes
      {
        urlFilter: '/products/*',
        changes: [{ selector: '.product', type: 'text', value: 'Treatment A' }]
      }, // Variant 1: Has filter
      { changes: [{ selector: '.other', type: 'text', value: 'Treatment B' }] }, // Variant 2: No filter
    ],
  });

  // Current URL matches variant 1's filter
  setTestURL('https://example.com/products/123');

  // User assigned to variant 0 (control - no changes)
  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
    test_experiment: 0,
  });

  // Create DOM elements
  document.body.innerHTML = '<div class="product">Original</div><div class="other">Other</div>';

  // Initialize plugin
  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // ASSERTIONS
  // 1. Exposure tracking should be triggered (SRM prevention)
  expect(treatmentSpy).toHaveBeenCalledTimes(1);
  expect(treatmentSpy).toHaveBeenCalledWith('test_experiment');

  // 2. Visual changes should NOT be applied (user is in variant 0, which has no changes)
  expect(document.querySelector('.product')?.textContent).toBe('Original');
  expect(document.querySelector('.other')?.textContent).toBe('Other');
});
```

#### Test 2: Don't track when URL doesn't match single filter
```typescript
it('should NOT track any variant when URL does not match the single variant filter', async () => {
  const experiment = createExperimentWithURLFilters({
    experimentName: 'test_experiment',
    variants: [
      { changes: [] },
      {
        urlFilter: '/products/*',
        changes: [{ selector: '.product', type: 'text', value: 'Treatment' }]
      },
      { changes: [] },
    ],
  });

  // URL does NOT match variant 1's filter
  setTestURL('https://example.com/checkout');

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
    test_experiment: 0,
  });

  document.body.innerHTML = '<div class="product">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // ASSERTIONS
  // 1. NO exposure tracking (no variants match URL)
  expect(treatmentSpy).not.toHaveBeenCalled();

  // 2. NO visual changes applied
  expect(document.querySelector('.product')?.textContent).toBe('Original');
});
```

#### Test 3: Apply changes when user is in matching variant
```typescript
it('should apply visual changes AND track when user is in the variant with matching URL filter', async () => {
  const experiment = createExperimentWithURLFilters({
    experimentName: 'test_experiment',
    variants: [
      { changes: [] },
      {
        urlFilter: '/products/*',
        changes: [{ selector: '.product', type: 'text', value: 'Treatment A' }]
      },
      { changes: [] },
    ],
  });

  setTestURL('https://example.com/products/123');

  // User assigned to variant 1 (has matching filter and changes)
  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
    test_experiment: 1,
  });

  document.body.innerHTML = '<div class="product">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // ASSERTIONS
  // 1. Exposure tracked
  expect(treatmentSpy).toHaveBeenCalledWith('test_experiment');

  // 2. Visual changes ARE applied
  expect(document.querySelector('.product')?.textContent).toBe('Treatment A');
});
```

### Suite 2: Multiple URL Filters Per Variant

#### Test 4-7: Different variants match different URLs
```typescript
describe('Multiple URL filters per variant', () => {
  let experiment: ExperimentData;

  beforeEach(() => {
    experiment = createExperimentWithURLFilters({
      experimentName: 'multi_filter_test',
      variants: [
        {
          urlFilter: '/home',
          changes: [{ selector: '.hero', type: 'text', value: 'Home Treatment' }]
        },
        {
          urlFilter: '/products/*',
          changes: [{ selector: '.product', type: 'style', value: { color: 'red' } }]
        },
        {
          urlFilter: '/checkout',
          changes: [{ selector: '.cart', type: 'class', add: ['highlight'] }]
        },
      ],
    });
  });

  it('should track all variants on /home URL when variant 0 matches', async () => {
    setTestURL('https://example.com/home');

    // User in variant 1
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      multi_filter_test: 1,
    });

    document.body.innerHTML = '<div class="hero">Original</div><div class="product">Product</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // ALL variants tracked (variant 0 matches)
    expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

    // Variant 1's changes NOT applied (URL doesn't match variant 1's filter)
    expect(document.querySelector('.product')?.style.color).toBe('');
  });

  it('should track all variants on /products/* URL when variant 1 matches', async () => {
    setTestURL('https://example.com/products/widget');

    // User in variant 0
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      multi_filter_test: 0,
    });

    document.body.innerHTML = '<div class="hero">Hero</div><div class="product">Product</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // ALL variants tracked (variant 1 matches)
    expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

    // Variant 0's changes NOT applied (URL doesn't match variant 0's filter)
    expect(document.querySelector('.hero')?.textContent).toBe('Hero');
  });

  it('should apply changes when user variant matches current URL', async () => {
    setTestURL('https://example.com/checkout');

    // User in variant 2 (matches /checkout)
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      multi_filter_test: 2,
    });

    document.body.innerHTML = '<div class="cart">Cart</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // Tracked
    expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

    // Variant 2's changes ARE applied
    expect(document.querySelector('.cart')?.classList.contains('highlight')).toBe(true);
  });

  it('should NOT track when URL matches none of the variant filters', async () => {
    setTestURL('https://example.com/about');

    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      multi_filter_test: 0,
    });

    document.body.innerHTML = '<div class="hero">Hero</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // NO tracking (no variants match)
    expect(treatmentSpy).not.toHaveBeenCalled();
  });
});
```

### Suite 3: Complex URL Filters

#### Test 8: URLFilterConfig with include/exclude
```typescript
it('should handle URLFilterConfig with include and exclude arrays', async () => {
  const experiment = createExperimentWithURLFilters({
    experimentName: 'complex_filter',
    variants: [
      { changes: [] },
      {
        urlFilter: {
          include: ['/products/*', '/categories/*'],
          exclude: ['/products/hidden/*'],
        },
        changes: [{ selector: '.content', type: 'text', value: 'Filtered' }]
      },
    ],
  });

  const { mockContext: ctx1, treatmentSpy: spy1 } = createTreatmentTracker([experiment], { complex_filter: 0 });

  // Test included path
  setTestURL('https://example.com/products/123');
  document.body.innerHTML = '<div class="content">Original</div>';

  plugin = new DOMChangesPluginLite({ context: ctx1, autoApply: true, spa: false });
  await plugin.initialize();

  expect(spy1).toHaveBeenCalled();

  // Reset for excluded path
  document.body.innerHTML = '';
  const { mockContext: ctx2, treatmentSpy: spy2 } = createTreatmentTracker([experiment], { complex_filter: 0 });

  setTestURL('https://example.com/products/hidden/secret');
  document.body.innerHTML = '<div class="content">Original</div>';

  plugin = new DOMChangesPluginLite({ context: ctx2, autoApply: true, spa: false });
  await plugin.initialize();

  expect(spy2).not.toHaveBeenCalled();
});
```

#### Test 9: Array of URL patterns
```typescript
it('should handle array of URL patterns', async () => {
  const experiment = createExperimentWithURLFilters({
    experimentName: 'array_filter',
    variants: [
      { changes: [] },
      {
        urlFilter: ['/home', '/landing', '/promo/*'],
        changes: [{ selector: '.banner', type: 'text', value: 'Promo' }]
      },
    ],
  });

  // Test each pattern matches
  const testURLs = [
    'https://example.com/home',
    'https://example.com/landing',
    'https://example.com/promo/special',
  ];

  for (const url of testURLs) {
    setTestURL(url);
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { array_filter: 0 });
    document.body.innerHTML = '<div class="banner">Original</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    expect(treatmentSpy).toHaveBeenCalled();

    // Clear for next iteration
    document.body.innerHTML = '';
  }

  // Test non-matching URL
  setTestURL('https://example.com/about');
  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { array_filter: 0 });
  document.body.innerHTML = '<div class="banner">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  expect(treatmentSpy).not.toHaveBeenCalled();
});
```

### Suite 4: Legacy Format Compatibility

#### Test 10: Legacy array format always matches
```typescript
it('should track and apply changes for legacy array format (no URL filter)', async () => {
  const experiment: ExperimentData = {
    name: 'legacy_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      {
        name: 'control',
        variables: {
          __dom_changes: [{ selector: '.test', type: 'text', value: 'Control' }],
        },
      },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [{ selector: '.test', type: 'text', value: 'Treatment' }],
        },
      },
    ],
  };

  setTestURL('https://example.com/any/path');

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { legacy_test: 1 });
  document.body.innerHTML = '<div class="test">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Always tracked (no URL filter)
  expect(treatmentSpy).toHaveBeenCalled();

  // Changes applied
  expect(document.querySelector('.test')?.textContent).toBe('Treatment');
});
```

### Suite 5: Edge Cases

#### Test 11-13: Empty/missing URL filters
```typescript
describe('Edge cases', () => {
  it('should match all URLs when urlFilter is empty string', async () => {
    const experiment = createExperimentWithURLFilters({
      experimentName: 'empty_filter',
      variants: [
        { urlFilter: '', changes: [{ selector: '.test', type: 'text', value: 'Test' }] },
      ],
    });

    setTestURL('https://example.com/any/path');
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { empty_filter: 0 });
    document.body.innerHTML = '<div class="test">Original</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    expect(treatmentSpy).toHaveBeenCalled();
    expect(document.querySelector('.test')?.textContent).toBe('Test');
  });

  it('should match all URLs when urlFilter is missing in wrapped config', async () => {
    const experiment = createExperimentWithURLFilters({
      experimentName: 'no_filter',
      variants: [
        { changes: [{ selector: '.test', type: 'text', value: 'Test' }] },
      ],
    });

    setTestURL('https://example.com/any/path');
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { no_filter: 0 });
    document.body.innerHTML = '<div class="test">Original</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    expect(treatmentSpy).toHaveBeenCalled();
    expect(document.querySelector('.test')?.textContent).toBe('Test');
  });
});
```

### Suite 6: Exposure Tracking Validation

#### Test 14-15: Treatment call validation
```typescript
describe('Exposure tracking validation', () => {
  it('should call treatment() exactly once per matched experiment', async () => {
    const experiment = createExperimentWithURLFilters({
      experimentName: 'tracking_test',
      variants: [
        { changes: [] },
        { urlFilter: '/products/*', changes: [{ selector: '.test', type: 'text', value: 'Test' }] },
        { changes: [] },
        { changes: [] },
        { changes: [] },
      ],
    });

    setTestURL('https://example.com/products/123');
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { tracking_test: 0 });
    document.body.innerHTML = '<div class="test">Original</div>';

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // Called exactly once
    expect(treatmentSpy).toHaveBeenCalledTimes(1);
    expect(treatmentSpy).toHaveBeenCalledWith('tracking_test');
  });

  it('should NOT call treatment() when no variants match URL', async () => {
    const experiment = createExperimentWithURLFilters({
      experimentName: 'no_match_test',
      variants: [
        { urlFilter: '/products/*', changes: [] },
        { urlFilter: '/checkout', changes: [] },
      ],
    });

    setTestURL('https://example.com/about');
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { no_match_test: 0 });

    plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
    await plugin.initialize();

    // NOT called
    expect(treatmentSpy).not.toHaveBeenCalled();
  });
});
```

## Implementation Notes

1. **Isolation**: Each test must be fully isolated - reset DOM, mocks, and window.location
2. **SRM Focus**: Every test should have explicit assertions about exposure tracking
3. **Visual Changes**: Verify DOM changes are applied only when appropriate
4. **Test Names**: Use descriptive names that explain the scenario
5. **Comments**: Add comments explaining the SRM prevention logic where relevant

## Expected Test Count

Approximately **25-30 tests** covering:
- 5 tests for single variant URL filter (SRM prevention)
- 8 tests for multiple filters per variant
- 4 tests for complex URL filters
- 2 tests for legacy format
- 3 tests for edge cases
- 3 tests for exposure tracking validation
- Additional tests for combinations and edge cases

## Success Criteria

✅ All tests pass independently
✅ SRM prevention logic validated comprehensively
✅ Visual change application verified
✅ Exposure tracking (`context.treatment()`) validated
✅ Both legacy and new formats tested
✅ Edge cases covered
✅ Tests are readable and well-documented
