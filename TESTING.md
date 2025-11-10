# Testing Guide for ABSmartly SDK Plugins

## Core Principle: Always Use Real SDK

**CRITICAL RULE**: Never use mock contexts. Always use the real ABSmartly SDK in tests via `createTestSDK()` and `createTestContext()`.

## Why?

- **Accurate behavior**: Tests reflect actual production behavior
- **Type safety**: Real SDK provides proper TypeScript types
- **Reliability**: Catches integration issues that mocks would miss
- **Maintenance**: SDK updates automatically propagate to tests

## Setting Up Tests with Real SDK

### Basic Test Setup

```typescript
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import { createEmptyContextData } from '../../__tests__/fixtures';

describe('MyFeature', () => {
  let context: ABsmartlyContext;

  beforeEach(() => {
    const sdk = createTestSDK();
    context = createTestContext(sdk, createEmptyContextData());
  });
});
```

### Testing with Experiments

```typescript
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import {
  createContextDataWithExperiments,
  extractVariantOverrides,
} from '../../__tests__/fixtures';
import { TestDataFactory } from '../../__tests__/test-utils';

it('should apply style changes', async () => {
  // Create DOM changes using TestDataFactory
  const styleChange = TestDataFactory.createStyleChange(
    '#button',
    { backgroundColor: 'red' },
    { persistStyle: true }
  );

  // Create experiment with changes in variant 1
  const experiment = TestDataFactory.createExperiment(
    'my_experiment',
    [styleChange],
    1  // variant index that has the changes
  );

  // Set up real SDK context
  const sdk = createTestSDK();
  const overrides = extractVariantOverrides([experiment]);
  const context = createTestContext(
    sdk,
    createContextDataWithExperiments([experiment] as any),
    'test-user',
    overrides  // Force user into specific variant
  );

  // Create plugin with real context
  const plugin = new DOMChangesPluginLite({
    context,
    autoApply: false,
  });

  await plugin.ready();
  await plugin.applyChanges();

  // Test the results
  expect(button.style.backgroundColor).toBe('red');
});
```

### Tracking Exposure Events

**CORRECT**: Use `eventLogger` to capture exposure events

```typescript
import { createTestSDK, createTestContext, createEventCapture } from '../../__tests__/sdk-helper';
import type { CapturedEvent } from '../../__tests__/sdk-helper';

describe('ExposureTracking', () => {
  let context: ABsmartlyContext;
  let exposureEvents: CapturedEvent[];

  beforeEach(() => {
    // Create event capture for 'exposure' events
    const { events, eventLogger } = createEventCapture('exposure');
    exposureEvents = events;

    // Pass eventLogger to SDK
    const sdk = createTestSDK(eventLogger);
    context = createTestContext(sdk, createEmptyContextData());
  });

  it('should track exposure when treatment is called', () => {
    // Call treatment (triggers exposure event)
    context.treatment('my_experiment');

    // Check exposure was captured
    expect(exposureEvents).toHaveLength(1);
    expect((exposureEvents[0].data as any).name).toBe('my_experiment');
  });
});
```

**WRONG**: Don't wrap treatment() with jest.fn()

```typescript
// ❌ BAD - Don't do this!
const treatmentSpy = jest.fn();
const originalTreatment = context.treatment.bind(context);
context.treatment = jest.fn((expName: string) => {
  treatmentSpy(expName);
  return originalTreatment(expName);
});

// ✅ GOOD - Use eventLogger instead (see above)
```

## Test Data Factories

Use `TestDataFactory` to create test data:

```typescript
import { TestDataFactory } from '../../__tests__/test-utils';

// Create style change
const styleChange = TestDataFactory.createStyleChange(
  '.button',
  { backgroundColor: 'red', color: 'white' },
  { persistStyle: true }  // Optional flags
);

// Create text change
const textChange = TestDataFactory.createTextChange(
  '.title',
  'New Title',
  { trigger_on_view: true }
);

// Create class change
const classChange = TestDataFactory.createClassChange(
  '.element',
  ['active', 'highlighted'],  // add
  ['disabled'],  // remove
);

// Create move change
const moveChange = TestDataFactory.createMoveChange(
  '.sidebar',
  '.main-content',
  'lastChild'
);

// Create experiment with changes
const experiment = TestDataFactory.createExperiment(
  'experiment_name',
  [styleChange, textChange],
  1  // variant index with changes
);
```

## Checking Event Data

### Exposure Events

Exposure events contain experiment data:

```typescript
// Access experiment name from exposure event
const experimentName = (exposureEvents[0].data as any).name;

// Check if specific experiment was exposed
const wasExposed = exposureEvents.some(
  e => (e.data as any).name === 'my_experiment'
);

// Get all exposed experiment names
const exposedExperiments = exposureEvents.map(
  e => (e.data as any).name
);
```

### Goal Events

Goal events contain goal data:

```typescript
const { events, eventLogger } = createEventCapture('goal');
const goalEvents = events;

// Access goal name
const goalName = (goalEvents[0].data as any).name;
```

## Testing Async Behavior

When testing async operations (like exposure tracking):

```typescript
it('should trigger async operation', async () => {
  // Perform operation
  tracker.registerExperiment(...);

  // Wait for async trigger
  await new Promise(resolve => setTimeout(resolve, 0));

  // Now assert
  expect(exposureEvents).toHaveLength(1);
});
```

## Testing DOM Manipulation

Create test DOM before testing:

```typescript
it('should manipulate DOM', async () => {
  // Set up test DOM
  document.body.innerHTML = `
    <div class="container">
      <button class="cta">Click me</button>
    </div>
  `;

  // Perform operations
  await plugin.applyChanges();

  // Assert DOM state
  const button = document.querySelector('.cta');
  expect(button?.textContent).toBe('Updated');
});
```

## Mocking Guidelines

### ✅ Appropriate Mocks

- **External dependencies**: `global.fetch`, network calls
- **Browser APIs not in JSDOM**: `IntersectionObserver`, `MutationObserver` (if needed)
- **Console output**: `console.log`, `console.error` (to reduce noise)
- **Debug logging**: `logDebug` (when testing other behavior)

```typescript
// ✅ GOOD - Mock external network call
(global.fetch as jest.Mock).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ result: 'success' }),
});

// ✅ GOOD - Mock browser API not in JSDOM
global.IntersectionObserver = jest.fn().mockImplementation(callback => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// ✅ GOOD - Suppress debug logs
const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();
// ... test code ...
logDebugSpy.mockRestore();
```

### ❌ Never Mock

- **SDK Context**: Always use real context from `createTestContext()`
- **Context methods**: Don't mock `context.treatment()`, `context.peek()`, etc.
- **Plugin instances**: Use real plugin instances, not mocks

```typescript
// ❌ BAD - Never do this!
const mockContext = {
  treatment: jest.fn(),
  peek: jest.fn().mockReturnValue(1),
} as any;

// ✅ GOOD - Use real SDK
const sdk = createTestSDK();
const context = createTestContext(sdk, createEmptyContextData());
```

## Testing Patterns

### Pattern 1: Basic Feature Test

```typescript
it('should apply changes', async () => {
  const change = TestDataFactory.createTextChange('.title', 'New Title');
  const experiment = TestDataFactory.createExperiment('test_exp', [change], 1);

  const sdk = createTestSDK();
  const overrides = extractVariantOverrides([experiment]);
  const context = createTestContext(
    sdk,
    createContextDataWithExperiments([experiment] as any),
    'test-user',
    overrides
  );

  const plugin = new DOMChangesPluginLite({ context });
  await plugin.ready();

  // Assert
  expect(element.textContent).toBe('New Title');
});
```

### Pattern 2: Exposure Tracking Test

```typescript
it('should track exposure', async () => {
  const { events, eventLogger } = createEventCapture('exposure');

  const sdk = createTestSDK(eventLogger);
  const context = createTestContext(sdk, createEmptyContextData());

  // Trigger exposure
  context.treatment('my_experiment');

  // Assert
  expect(events).toHaveLength(1);
  expect((events[0].data as any).name).toBe('my_experiment');
});
```

### Pattern 3: Multi-Variant Test

```typescript
it('should handle multiple variants', async () => {
  const v0Changes = [TestDataFactory.createTextChange('.title', 'V0')];
  const v1Changes = [TestDataFactory.createTextChange('.title', 'V1')];

  const experiment = TestDataFactory.createMultiVariantExperiment(
    'multi_test',
    [v0Changes, v1Changes]
  );

  // Test with variant 0
  let context = createTestContext(
    createTestSDK(),
    createContextDataWithExperiments([experiment] as any),
    'user1',
    { multi_test: 0 }
  );
  // Assert variant 0 behavior...

  // Test with variant 1
  context = createTestContext(
    createTestSDK(),
    createContextDataWithExperiments([experiment] as any),
    'user2',
    { multi_test: 1 }
  );
  // Assert variant 1 behavior...
});
```

## Common Mistakes

### ❌ Mistake 1: Using Mock Context

```typescript
// DON'T DO THIS
const context = {
  treatment: jest.fn(),
  peek: jest.fn(),
} as any;
```

### ❌ Mistake 2: Wrapping SDK Methods

```typescript
// DON'T DO THIS
const spy = jest.fn();
context.treatment = jest.fn(exp => {
  spy(exp);
  return originalTreatment(exp);
});
```

### ❌ Mistake 3: Not Using Test Factories

```typescript
// DON'T DO THIS - manually creating experiment objects
const experiment = {
  id: 1,
  name: 'test',
  // ... lots of boilerplate
};

// DO THIS - use factories
const experiment = TestDataFactory.createExperiment('test', [change], 1);
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

## Summary

1. **Always use real SDK** via `createTestSDK()` and `createTestContext()`
2. **Use eventLogger** to capture events, don't mock SDK methods
3. **Use TestDataFactory** to create test data
4. **Only mock external dependencies** (network, browser APIs)
5. **Test behavior, not implementation details**
