# Test Coverage Implementation Checklist

## Phase 1: Critical Tests (4-6 weeks, 20-25 hours)

### WebVitalsPlugin Tests
**File:** `src/vitals/__tests__/WebVitalsPlugin.test.ts` (CREATE NEW)
**Target:** 90%+ coverage

- [ ] Constructor initialization
  - [ ] Default options behavior
  - [ ] Custom options (debug, trackWebVitals, trackPageMetrics, autoTrack)
  - [ ] Pre-loading optimization path
  - [ ] Window context detection

- [ ] trackWebVitalsMetrics()
  - [ ] All five callbacks registered (CLS, LCP, FCP, INP, TTFB)
  - [ ] Metric data passed to context.track()
  - [ ] Early return when no context
  - [ ] Library load failure handling
  - [ ] Concurrent call handling during async load
  - [ ] Promise caching behavior

- [ ] trackPageMetricsData()
  - [ ] Immediate metrics extraction (DNS, TCP, TTFB, download)
  - [ ] Size metrics (total, header, HTML, compressed)
  - [ ] Compression ratio calculation
  - [ ] Load event handler attachment
  - [ ] Idempotency check (not tracked twice)
  - [ ] Missing performance entries handling

- [ ] Load metrics tracking
  - [ ] DOM processing time
  - [ ] Total load time
  - [ ] DOM element counts (elements, images, scripts, styles, links)
  - [ ] Rating classification (good/needs-improvement/poor)

- [ ] Lifecycle methods
  - [ ] start() invokes tracking when autoTrack=true
  - [ ] ready() as alias for start()
  - [ ] initialize() as alias for start()
  - [ ] reset() resets metricsTracked flag

- [ ] Error scenarios
  - [ ] Library import failure
  - [ ] context.track() exceptions
  - [ ] Missing performance entries
  - [ ] Invalid metric values

**Definition of Done:**
- [ ] All tests passing
- [ ] Coverage: 90%+
- [ ] No implementation-focused assertions
- [ ] Proper mocking of web-vitals library
- [ ] Debug mode tests included

---

### cookieUtils Tests
**File:** `src/cookies/__tests__/cookieUtils.test.ts` (CREATE NEW)
**Target:** 90%+ coverage

- [ ] getCookie()
  - [ ] Returns null for missing cookie
  - [ ] Returns value for existing cookie
  - [ ] Doesn't match partial names
  - [ ] Handles URL-encoded values
  - [ ] Handles multiple cookies
  - [ ] Handles empty values
  - [ ] Handles special characters in names
  - [ ] Handles malformed cookie string

- [ ] setCookie()
  - [ ] Sets basic cookie successfully
  - [ ] Applies all options (domain, path, sameSite, secure)
  - [ ] Skips domain for localhost
  - [ ] Defaults sameSite to 'Lax'
  - [ ] Returns false on error
  - [ ] Handles various expiry days (1, 7, 365)
  - [ ] Encodes value properly
  - [ ] Error logging on failure

- [ ] deleteCookie()
  - [ ] Deletes via maxAge=0
  - [ ] Propagates options
  - [ ] Handles missing cookies gracefully
  - [ ] Cleans up completely

- [ ] generateUniqueId()
  - [ ] Generates unique IDs (1000+ without collision)
  - [ ] Contains timestamp component
  - [ ] Different on each call
  - [ ] Returns alphanumeric string
  - [ ] Consistent format

- [ ] generateUUID()
  - [ ] Generates valid UUIDs
  - [ ] Matches v4 format
  - [ ] Unique across calls
  - [ ] Proper random seed

- [ ] isLocalStorageAvailable()
  - [ ] Returns true when available
  - [ ] Returns false on setItem error
  - [ ] Returns false on removeItem error
  - [ ] Handles QuotaExceededError
  - [ ] Handles SecurityError
  - [ ] Properly cleans up test data

**Definition of Done:**
- [ ] All tests passing
- [ ] Coverage: 90%+
- [ ] Real cookie operations tested (not just mocks)
- [ ] Edge cases covered
- [ ] Error paths covered

---

### overridesUtils Tests
**File:** `src/overrides/__tests__/overridesUtils.test.ts` (CREATE NEW)
**Target:** 90%+ coverage

- [ ] getQueryStringOverrides()
  - [ ] Parses simple variant
  - [ ] Parses variant with env and id
  - [ ] Ignores non-numeric variants
  - [ ] Ignores empty experiment names
  - [ ] Uses custom prefix
  - [ ] Handles multiple experiments
  - [ ] Handles partial env/id
  - [ ] Falls back to window.location.search
  - [ ] Returns empty object in non-browser env
  - [ ] Handles URL-encoded names
  - [ ] Handles malformed values

- [ ] parseOverrideCookie()
  - [ ] Parses simple variant
  - [ ] Parses with env and id
  - [ ] Handles dev environment prefix
  - [ ] Handles multiple experiments
  - [ ] Handles URL-encoded names
  - [ ] Skips invalid entries
  - [ ] Ignores non-numeric variants
  - [ ] Returns empty for empty string
  - [ ] Handles partial env/id
  - [ ] Handles pipe delimiter variations

- [ ] getCookieOverrides()
  - [ ] Extracts from cookie header
  - [ ] Handles multiple cookies
  - [ ] Uses custom cookie name
  - [ ] Returns empty when not found
  - [ ] Falls back to document.cookie
  - [ ] Handles empty header
  - [ ] Handles spaces around values
  - [ ] Handles cookie without value
  - [ ] Properly decodes URI components

- [ ] serializeOverrides()
  - [ ] Serializes simple variant
  - [ ] Serializes multiple experiments
  - [ ] Serializes with env and id
  - [ ] Omits undefined env/id
  - [ ] URL-encodes special characters
  - [ ] Handles empty overrides
  - [ ] Round-trip: serialize -> parse -> serialize matches
  - [ ] Proper dot/comma delimiters
  - [ ] Colon separator correct

**Definition of Done:**
- [ ] All tests passing
- [ ] Coverage: 90%+
- [ ] Round-trip tests verify bidirectional compatibility
- [ ] All format variations tested
- [ ] Edge cases covered

---

### BrowserCookieAdapter Tests
**File:** `src/overrides/__tests__/BrowserCookieAdapter.test.ts` (CREATE NEW)
**Target:** 90%+ coverage

- [ ] get() method
  - [ ] Returns cookie value
  - [ ] Returns null for missing
  - [ ] Doesn't match partial names
  - [ ] Handles multiple cookies
  - [ ] Handles URL-encoded values
  - [ ] Handles empty values
  - [ ] Handles special characters

- [ ] set() method
  - [ ] Sets cookie with all options
  - [ ] Path option applied
  - [ ] Domain option applied
  - [ ] SameSite option applied
  - [ ] Secure flag added
  - [ ] MaxAge option applied
  - [ ] Value properly encoded
  - [ ] Multiple calls work correctly

- [ ] delete() method
  - [ ] Deletes existing cookie
  - [ ] Propagates options
  - [ ] Sets maxAge=0
  - [ ] Handles missing cookie
  - [ ] Proper option forwarding

- [ ] Cookie string formatting
  - [ ] Semicolon separators
  - [ ] Option formatting
  - [ ] Special characters encoded
  - [ ] No extra spaces

**Definition of Done:**
- [ ] All tests passing
- [ ] Coverage: 90%+
- [ ] Proper cookie string format validated
- [ ] All options tested

---

## Phase 2: High Priority Tests (2-3 weeks, 15-20 hours)

### DOMManipulatorLite Error Paths
**File:** `src/core/__tests__/DOMManipulatorLite.test.ts` (ENHANCE)
**Target:** 90%+ coverage (currently 81.3%)

- [ ] JavaScript execution errors
  - [ ] Syntax error handling
  - [ ] Runtime error handling
  - [ ] Logs error details
  - [ ] Doesn't modify element on error
  - [ ] Continues execution
  - [ ] Debug mode logging

- [ ] Move operation failures
  - [ ] Target not found
  - [ ] Handle null target
  - [ ] Position edge cases
  - [ ] Proper error logging

- [ ] Disabled change flag
  - [ ] Undefined treated as enabled
  - [ ] False skips change
  - [ ] Returns false for disabled

- [ ] Create element variations
  - [ ] Multiple elements from HTML
  - [ ] Empty HTML handling
  - [ ] Invalid HTML handling
  - [ ] Position application

**Coverage Gap Lines:** 21, 83, 94, 145, 167, 213, 228, 242, 266, 287, 306, 312, 323, 345-354, 360-361, 370-373, 426-427, 446-476, 480-495, 511-514, 529, 533-536, 541

---

### PendingChangeManager Error Scenarios
**File:** `src/core/__tests__/PendingChangeManager.test.ts` (ENHANCE)
**Target:** 95%+ coverage (currently 90.9%)

- [ ] Invalid observer root handling
  - [ ] Invalid CSS selector
  - [ ] Falls back to document
  - [ ] Doesn't throw
  - [ ] Proper logging

- [ ] Observer setup failures
  - [ ] MutationObserver exception
  - [ ] Graceful degradation
  - [ ] Error logging

- [ ] RequestAnimationFrame fallback
  - [ ] Immediate processing when unavailable
  - [ ] Fallback works correctly
  - [ ] No timing issues

- [ ] Concurrent operations
  - [ ] Additions during batch
  - [ ] Deletions during batch
  - [ ] No lost changes
  - [ ] Proper cleanup

- [ ] Duplicate prevention
  - [ ] Same selector-experiment not reapplied
  - [ ] Multiple roots tracked separately
  - [ ] Clean tracking

**Coverage Gap Lines:** 32, 40, 85, 114, 162, 173, 186, 190, 211, 228, 254, 267-269, 286, 295-296

---

### CookiePlugin Coverage
**File:** `src/cookies/__tests__/CookiePlugin.test.ts` (ENHANCE)
**Target:** 80%+ coverage (currently 30.6%)

- [ ] Constructor options
  - [ ] All default values
  - [ ] Custom cookie names
  - [ ] Domain/path handling
  - [ ] SameSite/secure flags

- [ ] getUnitId() scenarios
  - [ ] Cookie available
  - [ ] LocalStorage fallback
  - [ ] Neither available
  - [ ] Caching behavior

- [ ] setUnitId() variations
  - [ ] Cookie setting
  - [ ] LocalStorage setting
  - [ ] Both available
  - [ ] Neither available
  - [ ] Expiry update

- [ ] generateAndSetUnitId()
  - [ ] Creates and sets ID
  - [ ] Returns generated ID

- [ ] needsServerSideCookie()
  - [ ] No unitId
  - [ ] Stale expiry
  - [ ] Fresh expiry
  - [ ] No storage available

**Coverage Gap Lines:** 70, 75-85, 89, 97, 121-138, 142-144, 148-151, 156-176, 181-212, 216-237, 242-270, 274-289, 294-306, 310-329, 334, 338-339, 366-396

---

### URLRedirectPlugin Edge Cases
**File:** `src/url-redirect/__tests__/URLRedirectPlugin.test.ts` (ENHANCE)
**Target:** 90%+ coverage (currently 78.9%)

- [ ] Invalid regex patterns
  - [ ] Malformed patterns
  - [ ] Syntax errors
  - [ ] Capture group errors

- [ ] Redirect URL substitution
  - [ ] Missing groups in template
  - [ ] Out of bounds references
  - [ ] Proper fallback

- [ ] Base URL resolution
  - [ ] Relative URLs
  - [ ] Absolute URLs
  - [ ] Protocol handling
  - [ ] Query string handling

**Coverage Gap Lines:** 48-49, 59-60, 66-68, 72, 86, 96-97, 107, 117, 135, 149, 168, 173, 190-193, 198, 202, 215-216, 228, 236, 257, 267

---

## Phase 3: Quality Improvements (10-15 hours)

### Refactor Implementation-Focused Tests
- [ ] Replace internal state assertions with behavior assertions
- [ ] Remove direct Map/Set structure checks
- [ ] Focus on final DOM state instead
- [ ] Use behavioral matchers

### Remove Hard-coded Timeouts
- [ ] Replace setTimeout(resolve, 150) with proper async utilities
- [ ] Increase to 500ms for CI stability
- [ ] Use deterministic triggers where possible

### Improve Mock Realism
- [ ] Reduce module-level jest.mock() usage
- [ ] More realistic mock behaviors
- [ ] Better mock cleanup

### Test Maintainability
- [ ] Reduce test duplication
- [ ] Better helper functions
- [ ] More readable assertions
- [ ] Clear test documentation

---

## Coverage Verification

### After Phase 1
Run: `npm test -- --coverage`
Verify:
- [ ] WebVitalsPlugin: 90%+
- [ ] cookieUtils: 90%+
- [ ] overridesUtils: 90%+
- [ ] BrowserCookieAdapter: 90%+
- [ ] Overall branches: 75%+ (improvement from 65.72%)

### After Phase 2
Run: `npm test -- --coverage`
Verify:
- [ ] DOMManipulatorLite: 90%+
- [ ] PendingChangeManager: 95%+
- [ ] CookiePlugin: 80%+
- [ ] URLRedirectPlugin: 90%+
- [ ] Overall: 80%+ branches

### After Phase 3
Run: `npm test -- --coverage`
Verify:
- [ ] All modules: 85%+
- [ ] Statements: 85%+
- [ ] Branches: 85%+
- [ ] Functions: 85%+

---

## Testing Tips & Tricks

### For Async Tests
Use proper async/await patterns instead of hard-coded timeouts:
```typescript
// Wait for batch processing
await new Promise(resolve => setTimeout(resolve, 100));

// Better: use async utilities from jest
await expect(promise).resolves.toBeDefined();
```

### For Cookie Tests
Isolate cookie state between tests:
```typescript
beforeEach(() => {
  // Clear all cookies
  document.cookie = '';
});

afterEach(() => {
  // Cleanup
  document.cookie = '';
});
```

### For DOM Tests
Proper cleanup to prevent test pollution:
```typescript
beforeEach(() => {
  document.body.textContent = '';
});

afterEach(() => {
  document.body.textContent = '';
});
```

### Mock Pattern
Verify correct behavior with focused expectations:
```typescript
const mockContext = {
  track: jest.fn(),
};

// Verify function called with correct arguments
expect(mockContext.track).toHaveBeenCalledWith('metric_name', {
  value: expectedValue,
});
```

---

## Definition of Done (Per Test File)

For each test file created or enhanced:

- [ ] All happy path scenarios covered
- [ ] All error scenarios covered
- [ ] All edge cases covered
- [ ] Coverage target met (90%+)
- [ ] No implementation-focused assertions
- [ ] Tests are maintainable and readable
- [ ] Proper setup/teardown
- [ ] No hard-coded timeouts
- [ ] All tests pass locally
- [ ] All tests pass in CI
- [ ] Code review approved
- [ ] No linting errors

---

## Success Criteria

**Phase 1 Complete When:**
- All critical tests created
- Coverage improved to 75%+ branches
- All new tests passing in CI
- Code review approved

**Phase 2 Complete When:**
- All high priority tests created
- Coverage improved to 80%+ branches
- All tests passing in CI
- Performance acceptable

**Phase 3 Complete When:**
- All refactoring complete
- Coverage at 85%+ across all metrics
- Tests are maintainable
- CI passes consistently

---

## Resources

- Jest Documentation: https://jestjs.io/docs/getting-started
- Testing Library: https://testing-library.com/
- Current test examples: `src/**/__tests__/**/*.test.ts`
- Test utilities: `src/__tests__/test-utils.ts`
- Test fixtures: `src/__tests__/fixtures.ts`

---

**Last Updated:** February 2025
**Next Review:** After Phase 1 completion
