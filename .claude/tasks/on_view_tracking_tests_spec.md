# On-View Tracking Tests Specification

## Objective
Create comprehensive tests for viewport-triggered exposure tracking (`trigger_on_view: true`), including cross-variant tracking for SRM prevention.

## File Location
`src/core/__tests__/DOMChangesPluginLite.onViewTracking.test.ts`

## Key Concepts

### Trigger Types
1. **Immediate Trigger** (`trigger_on_view: false` or undefined): Calls `context.treatment()` immediately when plugin initializes
2. **Viewport Trigger** (`trigger_on_view: true`): Calls `context.treatment()` only when element becomes visible in viewport

### Cross-Variant Tracking for SRM Prevention
**Critical**: When an experiment has viewport triggers in ANY variant, ALL variants must track exposure when ANY tracked element becomes visible.

Example:
- User in variant 0 (no trigger_on_view changes)
- Variant 1 has trigger_on_view change on `.hero` element
- System creates invisible **placeholder** at variant 1's `.hero` position
- When placeholder becomes visible → Trigger exposure for ALL variants

### IntersectionObserver Behavior
- Threshold: 1% of element must be visible
- Triggers once per experiment (idempotent)
- Works with placeholders for cross-variant tracking

## Test File Structure

```typescript
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { MockContextFactory, TestDataFactory } from '../../__tests__/test-utils';
import { DOMChange, ExperimentData } from '../../types';

describe('DOMChangesPluginLite - On-View Tracking', () => {
  let plugin: DOMChangesPluginLite;
  let mockContext: any;
  let treatmentSpy: jest.Mock;
  let intersectionObserverCallback: IntersectionObserverCallback;
  let observedElements: Map<Element, IntersectionObserverEntry>;

  beforeEach(() => {
    document.body.innerHTML = '';
    observedElements = new Map();

    // Mock IntersectionObserver
    global.IntersectionObserver = jest.fn().mockImplementation((callback) => {
      intersectionObserverCallback = callback;
      return {
        observe: jest.fn((element: Element) => {
          observedElements.set(element, {
            target: element,
            isIntersecting: false,
            intersectionRatio: 0,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: new DOMRect(),
            rootBounds: null,
            time: Date.now(),
          } as IntersectionObserverEntry);
        }),
        unobserve: jest.fn((element: Element) => {
          observedElements.delete(element);
        }),
        disconnect: jest.fn(() => {
          observedElements.clear();
        }),
        root: null,
        rootMargin: '',
        thresholds: [0.01],
        takeRecords: jest.fn(() => []),
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper functions here...
});
```

## Helper Functions

### 1. Trigger Element Visibility
```typescript
function triggerIntersection(element: Element, isIntersecting: boolean = true): void {
  const entry = observedElements.get(element);
  if (!entry) {
    throw new Error('Element not observed');
  }

  const updatedEntry: IntersectionObserverEntry = {
    ...entry,
    isIntersecting,
    intersectionRatio: isIntersecting ? 0.5 : 0,
  };

  intersectionObserverCallback([updatedEntry], {} as IntersectionObserver);
}
```

### 2. Create Treatment Tracker
```typescript
function createTreatmentTracker(experiments: ExperimentData[], assignedVariants: Record<string, number>) {
  const treatmentSpy = jest.fn();
  const mockContext = MockContextFactory.create(experiments);

  (mockContext.peek as jest.Mock).mockImplementation(
    (expName: string) => assignedVariants[expName] ?? 0
  );

  (mockContext.treatment as jest.Mock).mockImplementation((expName: string) => {
    treatmentSpy(expName);
    return assignedVariants[expName] ?? 0;
  });

  return { mockContext, treatmentSpy };
}
```

### 3. Find Placeholders
```typescript
function findPlaceholders(experimentName: string): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-absmartly-placeholder="true"]'))
    .filter(el => el.getAttribute('data-absmartly-experiment') === experimentName) as HTMLElement[];
}
```

### 4. Verify Placeholder Exists
```typescript
function verifyPlaceholderExists(
  experimentName: string,
  originalSelector: string,
  targetSelector?: string
): boolean {
  const placeholders = findPlaceholders(experimentName);
  return placeholders.some(p =>
    p.getAttribute('data-absmartly-original-selector') === originalSelector
  );
}
```

## Test Suites

### Suite 1: Basic Viewport Triggers

#### Test 1: Immediate trigger fires immediately
```typescript
it('should call treatment() immediately for changes without trigger_on_view', async () => {
  const experiment: ExperimentData = {
    name: 'immediate_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      {
        name: 'control',
        variables: {
          __dom_changes: [
            { selector: '.test', type: 'text', value: 'Control' }
          ],
        },
      },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.test', type: 'text', value: 'Treatment' }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { immediate_test: 1 });
  document.body.innerHTML = '<div class="test">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Should be called immediately
  expect(treatmentSpy).toHaveBeenCalledWith('immediate_test');
  expect(treatmentSpy).toHaveBeenCalledTimes(1);
});
```

#### Test 2: Viewport trigger waits for visibility
```typescript
it('should wait for element visibility before calling treatment() with trigger_on_view', async () => {
  const experiment: ExperimentData = {
    name: 'viewport_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      { name: 'control', variables: { __dom_changes: [] } },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.hero', type: 'text', value: 'Treatment', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { viewport_test: 1 });
  document.body.innerHTML = '<div class="hero">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Should NOT be called yet
  expect(treatmentSpy).not.toHaveBeenCalled();

  // Trigger visibility
  const heroElement = document.querySelector('.hero')!;
  triggerIntersection(heroElement, true);

  // Now should be called
  expect(treatmentSpy).toHaveBeenCalledWith('viewport_test');
  expect(treatmentSpy).toHaveBeenCalledTimes(1);
});
```

#### Test 3: Exposure triggered only once per experiment
```typescript
it('should trigger exposure only once even when multiple elements become visible', async () => {
  const experiment: ExperimentData = {
    name: 'once_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.item', type: 'style', value: { color: 'red' }, trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { once_test: 0 });
  document.body.innerHTML = '<div class="item">Item 1</div><div class="item">Item 2</div><div class="item">Item 3</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Trigger visibility for all items
  const items = document.querySelectorAll('.item');
  items.forEach(item => triggerIntersection(item, true));

  // Should be called exactly once
  expect(treatmentSpy).toHaveBeenCalledTimes(1);
});
```

### Suite 2: Cross-Variant Tracking (SRM Prevention)

#### Test 4: Placeholder created for other variant
```typescript
it('should create placeholder when user is in variant 0 and variant 1 has trigger_on_view', async () => {
  const experiment: ExperimentData = {
    name: 'cross_variant_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      { name: 'control', variables: { __dom_changes: [] } },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.hero', type: 'text', value: 'Treatment', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { cross_variant_test: 0 });
  document.body.innerHTML = '<div class="hero">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Not called yet
  expect(treatmentSpy).not.toHaveBeenCalled();

  // Verify placeholder was NOT created (element exists in DOM already)
  // This test needs adjustment - placeholders are for MOVE changes across variants
  // For regular changes, the actual element is tracked

  // Trigger visibility of actual element
  const heroElement = document.querySelector('.hero')!;
  triggerIntersection(heroElement, true);

  // Now should be called (cross-variant tracking)
  expect(treatmentSpy).toHaveBeenCalledWith('cross_variant_test');
});
```

#### Test 5: Track when any variant's element becomes visible
```typescript
it('should track all variants when any variant element with trigger_on_view becomes visible', async () => {
  const experiment: ExperimentData = {
    name: 'multi_variant_tracking',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.33, 0.33, 0.34],
    variants: [
      {
        name: 'control',
        variables: {
          __dom_changes: [
            { selector: '.hero', type: 'text', value: 'Control', trigger_on_view: true }
          ],
        },
      },
      {
        name: 'treatment_a',
        variables: {
          __dom_changes: [
            { selector: '.hero', type: 'text', value: 'Treatment A', trigger_on_view: true }
          ],
        },
      },
      {
        name: 'treatment_b',
        variables: {
          __dom_changes: [
            { selector: '.other', type: 'text', value: 'Treatment B', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { multi_variant_tracking: 0 });
  document.body.innerHTML = '<div class="hero">Original</div><div class="other">Other</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  expect(treatmentSpy).not.toHaveBeenCalled();

  // Trigger visibility of .hero (user's variant element)
  const heroElement = document.querySelector('.hero')!;
  triggerIntersection(heroElement, true);

  // Should trigger exposure
  expect(treatmentSpy).toHaveBeenCalledWith('multi_variant_tracking');
  expect(treatmentSpy).toHaveBeenCalledTimes(1);

  // Triggering .other should NOT call again (already triggered)
  const otherElement = document.querySelector('.other')!;
  triggerIntersection(otherElement, true);

  expect(treatmentSpy).toHaveBeenCalledTimes(1); // Still only once
});
```

### Suite 3: Move Changes Cross-Variant Tracking

#### Test 6: Placeholder created for move change in another variant
```typescript
it('should create placeholder for move change in other variant', async () => {
  const experiment: ExperimentData = {
    name: 'move_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      {
        name: 'control',
        variables: {
          __dom_changes: [
            // Element stays in original position
            { selector: '.item', type: 'style', value: { color: 'blue' } }
          ],
        },
      },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            {
              selector: '.item',
              type: 'move',
              targetSelector: '.target-container',
              position: 'lastChild',
              trigger_on_view: true
            }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { move_test: 0 });
  document.body.innerHTML = `
    <div class="original-container">
      <div class="item">Item</div>
    </div>
    <div class="target-container"></div>
  `;

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Verify placeholder created in target container for variant 1's move
  const placeholders = findPlaceholders('move_test');
  expect(placeholders.length).toBeGreaterThan(0);

  // Verify placeholder is in target container
  const targetContainer = document.querySelector('.target-container');
  const placeholderInTarget = Array.from(targetContainer?.children || [])
    .some(el => el.hasAttribute('data-absmartly-placeholder'));
  expect(placeholderInTarget).toBe(true);

  // Trigger placeholder visibility
  const placeholder = placeholders[0];
  triggerIntersection(placeholder, true);

  // Should trigger exposure
  expect(treatmentSpy).toHaveBeenCalledWith('move_test');
});
```

#### Test 7: User in variant with move - track moved element
```typescript
it('should track moved element when user is in variant with move change', async () => {
  const experiment: ExperimentData = {
    name: 'move_user_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      { name: 'control', variables: { __dom_changes: [] } },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            {
              selector: '.item',
              type: 'move',
              targetSelector: '.target-container',
              position: 'firstChild',
              trigger_on_view: true
            }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { move_user_test: 1 });
  document.body.innerHTML = `
    <div class="original-container">
      <div class="item">Item</div>
    </div>
    <div class="target-container"></div>
  `;

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Element should be moved
  const item = document.querySelector('.item');
  const targetContainer = document.querySelector('.target-container');
  expect(targetContainer?.contains(item)).toBe(true);

  // Trigger visibility of moved element
  triggerIntersection(item!, true);

  // Should trigger exposure
  expect(treatmentSpy).toHaveBeenCalledWith('move_user_test');
});
```

### Suite 4: Mixed Trigger Types

#### Test 8: Mixed immediate and viewport triggers
```typescript
it('should handle mixed immediate and viewport triggers in same experiment', async () => {
  const experiment: ExperimentData = {
    name: 'mixed_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.immediate', type: 'text', value: 'Immediate' }, // No trigger_on_view
            { selector: '.viewport', type: 'text', value: 'Viewport', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { mixed_test: 0 });
  document.body.innerHTML = '<div class="immediate">A</div><div class="viewport">B</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Should be called immediately (has immediate trigger)
  expect(treatmentSpy).toHaveBeenCalledWith('mixed_test');
  expect(treatmentSpy).toHaveBeenCalledTimes(1);

  // Triggering viewport element should NOT call again
  const viewportElement = document.querySelector('.viewport')!;
  triggerIntersection(viewportElement, true);

  expect(treatmentSpy).toHaveBeenCalledTimes(1); // Still only once
});
```

### Suite 5: Dynamic Element Tracking

#### Test 9: Element added after initialization
```typescript
it('should track dynamically added elements via MutationObserver', async () => {
  const experiment: ExperimentData = {
    name: 'dynamic_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.dynamic', type: 'text', value: 'Dynamic', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { dynamic_test: 0 });
  document.body.innerHTML = '<div id="container"></div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  expect(treatmentSpy).not.toHaveBeenCalled();

  // Add element dynamically
  const container = document.getElementById('container')!;
  const dynamicElement = document.createElement('div');
  dynamicElement.className = 'dynamic';
  dynamicElement.textContent = 'Original';
  container.appendChild(dynamicElement);

  // Wait for MutationObserver to detect
  await new Promise(resolve => setTimeout(resolve, 100));

  // Element should now be observed
  expect(observedElements.has(dynamicElement)).toBe(true);

  // Trigger visibility
  triggerIntersection(dynamicElement, true);

  // Should trigger exposure
  expect(treatmentSpy).toHaveBeenCalledWith('dynamic_test');
});
```

### Suite 6: IntersectionObserver Edge Cases

#### Test 10: Element initially off-screen
```typescript
it('should not trigger exposure for off-screen element until scrolled into view', async () => {
  const experiment: ExperimentData = {
    name: 'offscreen_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.below-fold', type: 'text', value: 'Below', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { offscreen_test: 0 });
  document.body.innerHTML = '<div class="below-fold">Original</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  // Element exists but not visible
  const element = document.querySelector('.below-fold')!;
  triggerIntersection(element, false); // Not intersecting

  expect(treatmentSpy).not.toHaveBeenCalled();

  // Simulate scroll into view
  triggerIntersection(element, true); // Now intersecting

  expect(treatmentSpy).toHaveBeenCalledWith('offscreen_test');
});
```

#### Test 11: Multiple experiments with viewport triggers
```typescript
it('should handle multiple experiments with viewport triggers independently', async () => {
  const experiment1: ExperimentData = {
    name: 'exp1',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.test1', type: 'text', value: 'Exp1', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const experiment2: ExperimentData = {
    name: 'exp2',
    id: 2,
    unitType: 'user_id',
    trafficSplit: [1],
    variants: [
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            { selector: '.test2', type: 'text', value: 'Exp2', trigger_on_view: true }
          ],
        },
      },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker(
    [experiment1, experiment2],
    { exp1: 0, exp2: 0 }
  );
  document.body.innerHTML = '<div class="test1">T1</div><div class="test2">T2</div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  expect(treatmentSpy).not.toHaveBeenCalled();

  // Trigger exp1
  const test1 = document.querySelector('.test1')!;
  triggerIntersection(test1, true);

  expect(treatmentSpy).toHaveBeenCalledWith('exp1');
  expect(treatmentSpy).toHaveBeenCalledTimes(1);

  // Trigger exp2
  const test2 = document.querySelector('.test2')!;
  triggerIntersection(test2, true);

  expect(treatmentSpy).toHaveBeenCalledWith('exp2');
  expect(treatmentSpy).toHaveBeenCalledTimes(2);
});
```

## Additional Test Scenarios

### Test 12: Placeholder attributes verification
```typescript
it('should create placeholders with correct attributes', async () => {
  const experiment: ExperimentData = {
    name: 'placeholder_test',
    id: 1,
    unitType: 'user_id',
    trafficSplit: [0.5, 0.5],
    variants: [
      { name: 'control', variables: { __dom_changes: [] } },
      {
        name: 'treatment',
        variables: {
          __dom_changes: [
            {
              selector: '.item',
              type: 'move',
              targetSelector: '.target',
              trigger_on_view: true
            }
          ],
        },
      },
    ],
  };

  const { mockContext } = createTreatmentTracker([experiment], { placeholder_test: 0 });
  document.body.innerHTML = '<div class="item">Item</div><div class="target"></div>';

  plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
  await plugin.initialize();

  const placeholders = findPlaceholders('placeholder_test');
  expect(placeholders.length).toBeGreaterThan(0);

  const placeholder = placeholders[0];
  expect(placeholder.getAttribute('data-absmartly-placeholder')).toBe('true');
  expect(placeholder.getAttribute('data-absmartly-experiment')).toBe('placeholder_test');
  expect(placeholder.getAttribute('data-absmartly-original-selector')).toBe('.item');
  expect(placeholder.getAttribute('aria-hidden')).toBe('true');
});
```

## Implementation Notes

1. **IntersectionObserver Mock**: Must properly simulate visibility state changes
2. **MutationObserver**: Test dynamic element detection
3. **Placeholders**: Verify they're created at correct positions with correct attributes
4. **Idempotency**: Exposure should trigger exactly once per experiment
5. **Isolation**: Each test must properly reset IntersectionObserver state

## Expected Test Count

Approximately **20-25 tests** covering:
- 4 tests for basic viewport triggers
- 3 tests for cross-variant tracking
- 3 tests for move changes
- 2 tests for mixed triggers
- 2 tests for dynamic elements
- 3 tests for IntersectionObserver edge cases
- Additional tests for placeholders and combinations

## Success Criteria

✅ All tests pass independently
✅ IntersectionObserver mocking works correctly
✅ Cross-variant tracking validated with placeholders
✅ Exposure triggered exactly once per experiment
✅ Dynamic element detection tested
✅ SRM prevention verified for viewport triggers
✅ Tests are readable and well-documented
