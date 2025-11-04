# Session Context: 2c6054c2-e55f-479f-bab2-caa7e49eb7a3

## Task: Refactor hideUntilReady to Accept CSS Selector

### Status: ✅ COMPLETED

### Summary
Refactored the `hideUntilReady` property in DOMChangesPlugin to accept a CSS selector string instead of a boolean/string union type + separate `hideSelector` parameter. This simplifies the API and provides more flexibility.

### Changes Made

#### 1. Type Definitions (src/types/index.ts)
- **Changed** `hideUntilReady` from `boolean | 'body' | 'elements'` to `string | false`
- **Removed** `hideSelector` property (consolidated into `hideUntilReady`)
- Updated JSDoc comments to reflect new API

**Before:**
```typescript
hideUntilReady?: boolean | 'body' | 'elements';
hideSelector?: string;
```

**After:**
```typescript
hideUntilReady?: string | false; // CSS selector (e.g., 'body', '[data-absmartly-hide]', '[data-absmartly-hide], [data-custom]')
```

#### 2. DOMChangesPluginLite Constructor (src/core/DOMChangesPluginLite.ts:39-59)
- **Removed** `hideSelector` from config initialization
- Anti-flicker CSS is applied **BEFORE** context is ready (line 56-59)
- Added clarifying comment about timing

#### 3. hideContent() Method (src/core/DOMChangesPluginLite.ts:929-977)
- **Removed** mode-based logic (`'body'` vs `'elements'`)
- **Simplified** to use `hideUntilReady` directly as CSS selector
- **Removed** fallback to `hideSelector` (no longer exists)
- Updated debug logging to show actual selector used

#### 4. showContent() Method (src/core/DOMChangesPluginLite.ts:982-1039)
- **Simplified** selector retrieval (cast `hideUntilReady` to string)
- **Removed** mode-based logic
- Updated to work with any CSS selector

#### 5. Documentation (README.md)
- **Updated** all examples to use new API:
  - `hideUntilReady: 'body'` (hide entire page)
  - `hideUntilReady: '[data-absmartly-hide]'` (hide specific elements)
  - `hideUntilReady: '[data-absmartly-hide], [data-custom], .test'` (multiple selectors)
- **Updated** configuration reference section
- **Updated** best practices section with new examples

### Anti-Flicker Behavior (Verified)
✅ Anti-flicker CSS is applied **immediately** in the constructor (BEFORE context.ready())
✅ Elements are shown when:
  - `applyChanges()` completes (after context becomes ready), OR
  - Timeout expires (`hideTimeout` default: 3000ms)

### Examples of New API

**Hide entire page:**
```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  hideUntilReady: 'body',
  hideTransition: '0.3s ease-in'
});
```

**Hide specific elements:**
```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  hideUntilReady: '[data-absmartly-hide]',
  hideTransition: '0.4s ease-out'
});
```

**Hide multiple selectors:**
```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  hideUntilReady: '[data-absmartly-hide], [data-custom-hide], .test-element',
  hideTransition: '0.3s ease-in'
});
```

### Migration Guide
**Old API:**
```javascript
{
  hideUntilReady: 'elements',
  hideSelector: '[data-absmartly-hide]'
}
```

**New API:**
```javascript
{
  hideUntilReady: '[data-absmartly-hide]'
}
```

**Old API:**
```javascript
{
  hideUntilReady: 'body'
}
```

**New API (unchanged):**
```javascript
{
  hideUntilReady: 'body'
}
```

### Benefits
1. **Simpler API**: One property instead of two
2. **More flexible**: Can use any CSS selector or combination
3. **More intuitive**: Direct CSS selector instead of mode + selector
4. **Backwards compatible for `'body'`**: `hideUntilReady: 'body'` still works

---

## Tests Added

Added comprehensive test suite for anti-flicker functionality in `src/core/__tests__/DOMChangesPluginLite.test.ts`:

### Test Coverage (12 new tests)
1. ✅ **should not inject anti-flicker style when hideUntilReady is false**
   - Verifies disabled state works correctly

2. ✅ **should inject anti-flicker style for body selector BEFORE context.ready()**
   - **Critical test**: Verifies anti-flicker is applied in constructor, not after ready()
   - Tests the main requirement: anti-flicker happens BEFORE context.ready()

3. ✅ **should inject anti-flicker style for custom selector**
   - Tests `hideUntilReady: '[data-absmartly-hide]'`

4. ✅ **should inject anti-flicker style for multiple selectors**
   - Tests `hideUntilReady: '[data-absmartly-hide], [data-custom], .test-element'`

5. ✅ **should include opacity when hideTransition is enabled**
   - Verifies both `visibility: hidden` and `opacity: 0` are applied

6. ✅ **should NOT include opacity when hideTransition is false**
   - Verifies only `visibility: hidden` is applied (instant reveal)

7. ✅ **should remove anti-flicker style after applyChanges() completes**
   - Tests the show-on-ready behavior

8. ✅ **should remove anti-flicker style after timeout expires**
   - Tests the show-on-timeout behavior
   - Uses fake timers to fast-forward time

9. ✅ **should handle transition fade-in correctly**
   - Tests 4-step fade-in animation
   - Verifies opacity transition from 0 → 1
   - Verifies style cleanup after transition completes

10. ✅ **should not create duplicate style elements**
    - Tests defensive code that prevents duplicate injection

11. ✅ **should clear timeout when showContent is called before timeout expires**
    - Ensures no memory leaks from dangling timeouts

12. ✅ **should work with real-world selectors**
    - Tests various CSS selector formats:
      - `'body'`
      - `'[data-absmartly-hide]'`
      - `'.hero-section'`
      - `'#main-content'`
      - `'[data-absmartly-hide], [data-custom-hide]'`
      - `'.hero, .cta, #banner'`
      - `'div[data-test="value"]'`

### Test Results
- **Before**: 59 tests passing
- **After**: 71 tests passing (+12 new tests)
- **All tests pass**: ✅ 71/71

### Key Test Patterns Used
- **Fake Timers**: Used `jest.useFakeTimers()` to test timeout behavior without waiting
- **DOM Inspection**: Checked for `#absmartly-antiflicker` style element
- **Content Verification**: Verified CSS contains expected selectors and properties
- **State Verification**: Checked internal `antiFlickerTimeout` state
- **Lifecycle Testing**: Tested constructor → ready() → showContent() lifecycle
