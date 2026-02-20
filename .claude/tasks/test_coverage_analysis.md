# Comprehensive Test Coverage Analysis
## ABsmartly SDK Plugins

**Analysis Date:** February 2025
**Current Coverage:** 71.21% statements, 65.72% branches, 65.63% functions
**Coverage Threshold:** 70% global minimum (currently failing on branches and functions)

---

## Executive Summary

The codebase has solid test coverage on core DOM manipulation logic (85%+ statements) but critical gaps exist in utility functions and plugin features. The coverage threshold is being met for statements (71.21%) but failing on branches (65.72%) and functions (65.63%), creating blind spots for error handling paths and edge cases.

Key findings:
- Well-tested: Core DOM operations, HTML injection, style sheet management, plugin plugin composition
- Poorly tested: Cookie utilities (16%), WebVitals plugin (10%), URL redirect extraction (varies), BrowserCookieAdapter (20%), overrides utilities (7%)
- Missing tests: Error scenarios, concurrent conditions, edge cases in persistence, plugin registry operations
- Test quality issues: Some tests are brittle, implementation-focused rather than behavior-focused

---

## Critical Gaps (Criticality 8-10)

### 1. WebVitalsPlugin - Almost No Test Coverage (10.2% statements)
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/vitals/WebVitalsPlugin.ts` (lines 22-304)
**Impact:** Production metrics tracking is untested - data collection could fail silently

**Missing Tests:**
- Constructor initialization with different option combinations
- Context setting and validation
- Web Vitals library loading (async promise management)
- All metric tracking methods (CLS, LCP, FCP, INP, TTFB)
- Page metrics tracking (immediate and load-dependent)
- Error handling during library load failure
- Event listener attachment for page load
- State management (metricsTracked flag)
- start/ready/initialize lifecycle methods
- reset() functionality
- Pre-loading optimization path

**Critical Scenarios:**
1. **Web Vitals Library Load Failure** (Criticality: 9)
   - Current: No test for what happens when import('web-vitals') fails
   - Regression Risk: Plugin silently fails, metrics never tracked
   - Test should verify: error logging, graceful degradation, context.track called with error details

2. **Async Promise Race Conditions** (Criticality: 9)
   - Current: No test for concurrent calls to trackWebVitalsMetrics while webVitalsPromise is loading
   - Regression Risk: Duplicate metric callbacks if promise resolves during second call
   - Test should verify: Single promise used across calls, no race conditions

3. **Context Not Available** (Criticality: 8)
   - Current: Code returns early if no context, but never tested
   - Regression Risk: Silent failure without indication
   - Test should verify: Returns without crashing, debug logs warning

4. **Multiple Component Initialization** (Criticality: 8)
   - Current: No test for calling start() multiple times
   - Regression Risk: Event listeners duplicated, memory leaks
   - Test should verify: Idempotent behavior on multiple starts

**Recommended Test File:**
Create `/Users/joalves/git_tree/absmartly-sdk-plugins/src/vitals/__tests__/WebVitalsPlugin.test.ts`

```typescript
describe('WebVitalsPlugin', () => {
  // Comprehensive tests covering all paths
  describe('Constructor & Initialization', () => {
    // Test all option combinations
    // Test pre-loading optimization
    // Test with/without window context
  });

  describe('trackWebVitalsMetrics', () => {
    // Test successful library load and callback registration
    // Test library load failure with proper error handling
    // Test without context provided
    // Test concurrent calls during loading
  });

  describe('trackPageMetricsData', () => {
    // Test immediate metrics extraction
    // Test load event metrics
    // Test document.readyState scenarios
    // Test missing performance entries
  });

  describe('Lifecycle', () => {
    // Test start() idempotency
    // Test ready() as alias
    // Test reset() functionality
  });
});
```

---

### 2. Cookie Utilities - 16.3% Statement Coverage
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/cookies/cookieUtils.ts` (lines 1-101)
**Impact:** Cookie operations could fail without detection; uniqueness guarantees not validated

**Coverage Gaps:**
- getCookie() function completely untested
- setCookie() with all option combinations untested
- deleteCookie() untested
- generateUniqueId() untested
- generateUUID() untested
- isLocalStorageAvailable() untested

**Critical Scenarios:**
1. **getCookie Edge Cases** (Criticality: 9)
   - Multiple cookies with same prefix (e.g., "cookie" vs "cookieName")
   - Empty cookie string
   - Malformed cookie format
   - URL-encoded special characters
   - Test should verify: Correct extraction without false positives

2. **setCookie Domain Validation** (Criticality: 8)
   - Current: Line 44 skips domain for 'localhost' but never tested
   - Regression Risk: Domain set incorrectly in tests/development
   - Test should verify: Domain handling on localhost vs. production domains

3. **UniqueID Generation Collision Risk** (Criticality: 9)
   - Current: Uses Date.now() + random, no collision test
   - Regression Risk: Duplicate IDs possible in rapid succession
   - Test should verify: 1000+ rapid calls produce unique IDs

4. **LocalStorage Availability Check** (Criticality: 8)
   - Current: No test for various failure scenarios (quota exceeded, disabled, etc.)
   - Regression Risk: Returns false positive when localStorage temporarily unavailable
   - Test should verify: Handles storage quota exceptions, returns false correctly

**Recommended Test File:**
Create `/Users/joalves/git_tree/absmartly-sdk-plugins/src/cookies/__tests__/cookieUtils.test.ts`

---

### 3. BrowserCookieAdapter - 20% Statement Coverage
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/overrides/BrowserCookieAdapter.ts` (lines 1-47)
**Impact:** Cookie adapter is critical for overrides functionality but largely untested

**Coverage Gaps:**
- get() method: Basic implementation only, edge cases untested
- set() method: All option combinations untested
- delete() method: Not tested

**Critical Scenarios:**
1. **Cookie Parsing Accuracy** (Criticality: 8)
   - Malformed cookies in document.cookie
   - Cookie name substrings (e.g., getting "id" when "abid" exists)
   - URL-encoded values with special characters
   - Multiple equals signs in value
   - Test should verify: Robust parsing without false matches

2. **Cookie Option Serialization** (Criticality: 8)
   - All options (path, domain, maxAge, secure, sameSite) set correctly
   - Secure flag behavior in non-HTTPS
   - SameSite values properly formatted
   - Test should verify: Each option produces correct cookie string

3. **Delete Operation** (Criticality: 8)
   - Actual deletion via maxAge=0
   - Options propagated correctly to set()
   - No orphaned cookies
   - Test should verify: Cookie removed completely

**Recommended Test File:**
Create comprehensive tests in existing test pattern

---

### 4. OverridesUtils - 7% Statement Coverage
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/overrides/overridesUtils.ts` (lines 1-226)
**Impact:** Critical utility functions for override parsing untested - could silently fail on malformed input

**Coverage Gaps:**
- getQueryStringOverrides() - 0% coverage
- parseOverrideCookie() - 0% coverage (though partially covered through OverridesPlugin tests indirectly)
- getCookieOverrides() - 0% coverage
- serializeOverrides() - 0% coverage

**Critical Scenarios:**
1. **Query String Parsing Edge Cases** (Criticality: 9)
   - Invalid variant numbers (non-numeric)
   - Missing experiment names after prefix
   - Empty values
   - Special characters in experiment names
   - Complex nested values (env and id provided)
   - Test should verify: Correct parsing or graceful skipping of invalid entries

2. **Cookie Format Variations** (Criticality: 9)
   - Dev environment prefix "devEnv=xxx|experiments" parsing
   - Malformed experiment strings
   - Missing colons or dots
   - URL-encoded experiment names with special characters
   - Test should verify: Correct parsing with all format variations

3. **Override Serialization Round-Trip** (Criticality: 8)
   - Parse -> Serialize -> Parse produces identical results
   - Special characters preserved through encoding
   - Environment and ID parameters correctly serialized
   - Test should verify: Bidirectional compatibility

4. **Cookie Header Parsing** (Criticality: 8)
   - Multiple cookies in single header
   - Trimming and parsing edge cases
   - Cookie without value
   - Test should verify: Correct extraction without false positives

**Recommended Test File:**
Create `/Users/joalves/git_tree/absmartly-sdk-plugins/src/overrides/__tests__/overridesUtils.test.ts`

---

### 5. PendingChangeManager - Key Gap in Error Handling
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/PendingChangeManager.ts`
**Current Coverage:** 90.9% statements, but missing critical error scenarios

**Missing Tests:**
1. **Invalid Observer Root Selector** (Criticality: 8)
   - Line 30: What if querySelector(observerRoot) throws exception?
   - Current behavior: Falls back to undefined, but no test
   - Test should verify: Handles malformed CSS selectors gracefully

2. **MutationObserver Setup Failure** (Criticality: 8)
   - What if observer.observe() throws?
   - Current: No error handling
   - Test should verify: Graceful degradation if observer setup fails

3. **requestAnimationFrame Fallback** (Criticality: 8)
   - Lines 154-162: Fallback for non-browser environments
   - No test for this path in jsdom
   - Test should verify: Immediate processing when rAF unavailable

4. **Concurrent addPending During Batching** (Criticality: 7)
   - Adding new pending while batch processing
   - Could cause race condition
   - Test should verify: Batching handles additions correctly

5. **Duplicate Application Prevention** (Criticality: 8)
   - Lines 184-187: appliedSelectors prevents re-application
   - No test verifying this works with multiple roots
   - Test should verify: Each selector-experiment combo applies only once

---

## Important Improvements (Criticality 5-7)

### 1. DOMManipulatorLite - Error Path Coverage
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/DOMManipulatorLite.ts` (81.3% statements)
**Current:** Basic happy path well tested, error scenarios missing

**Missing Tests:**
1. **JavaScript Execution Errors** (Criticality: 7)
   - Lines 175-185: Catch block for Function() evaluation
   - No test for syntax errors, runtime errors in user code
   - Test should verify: Logs error, continues without crashing

2. **Move Element Target Not Found** (Criticality: 7)
   - Lines 207-214: Target selector not found
   - Debug mode tested, but not core functionality
   - Test should verify: Change marked as failed, not applied

3. **Invalid Style Properties** (Criticality: 6)
   - Lines 391-396: Setting styles on malformed values
   - No test for non-string values, invalid CSS
   - Test should verify: Handles gracefully or skips invalid values

4. **Disabled Change Flag** (Criticality: 6)
   - Lines 26-32: change.enabled can be undefined or false
   - No test for undefined case
   - Test should verify: Treats undefined as enabled (truthy), false as disabled

5. **Create Change Multiple Elements** (Criticality: 7)
   - Lines 304-332: createElement supports multiple elements from HTML
   - Only basic create scenario tested
   - Test should verify: Multiple elements created and positioned correctly

**Tests to Add:**
```typescript
describe('JavaScript Execution Error Handling', () => {
  // Syntax errors in user code
  // Runtime errors during execution
  // Verify logging and continuation
  // Verify element is not modified on error
});

describe('Move Operation Edge Cases', () => {
  // Target not found
  // Target is null
  // Position values edge cases (before/after with no siblings)
});
```

---

### 2. ExposureTracker - Concurrent Exposure Testing
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/ExposureTracker.ts` (80.3% statements)
**Current:** Basic logic covered, concurrent scenarios missing

**Missing Tests:**
1. **Rapid Concurrent Exposures** (Criticality: 7)
   - Multiple exposures added simultaneously
   - Could cause list modifications during iteration
   - Test should verify: All exposures tracked correctly without race conditions

2. **Re-Exposure Prevention** (Criticality: 6)
   - Same experiment exposed multiple times
   - Should track once, not duplicate
   - Test should verify: Deduplication works correctly

3. **Exposure with Non-Control Variants** (Criticality: 7)
   - Test interaction between control and non-control exposures
   - Verify correct prioritization

---

### 3. URL Redirect Plugin - Extraction Logic
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/url-redirect/URLRedirectExtractor.ts` (82.7% statements)

**Missing Tests:**
1. **Malformed URL Patterns** (Criticality: 7)
   - Invalid regex patterns
   - Missing capture groups referenced
   - Test should verify: Graceful handling

2. **Redirect URL Template Substitution** (Criticality: 7)
   - Missing captured groups in template
   - Out of bounds group references
   - Test should verify: Fallback or skip on invalid substitution

3. **Base URL Resolution** (Criticality: 6)
   - Relative vs absolute URLs
   - Protocol handling
   - Test should verify: Correct resolution logic

---

### 4. DOMChangesPluginLite - SPA and Hydration Recovery
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/DOMChangesPluginLite.ts` (83.2% statements)

**Missing Tests:**
1. **Cross-Variant Exposure Tracking** (Criticality: 6)
   - File: `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts`
   - Exists but may have gaps in error scenarios

2. **View Tracking Edge Cases** (Criticality: 6)
   - Multiple view changes rapidly
   - View tracking with dynamically loaded changes
   - Verify correct exposure logging

---

## Test Quality Issues (Impact on Maintainability)

### 1. Implementation-Focused Tests (Criticality: 5)
**Issue:** Some tests verify implementation details rather than behavior

**Examples:**
- Tests checking `appliedChanges` Map structure directly instead of testing effects
- Tests verifying internal mock calls rather than final DOM state
- Tests accessing private members extensively

**Recommendation:**
- Focus tests on observable behavior (DOM changes, tracking calls)
- Reduce dependency on implementation details
- Use behavioral assertions instead of state inspection

### 2. Hard-coded Timeouts in Async Tests (Criticality: 5)
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/core/__tests__/PendingChangeManager.test.ts` (lines 126, 150, 180)
**Issue:** 150ms timeouts in tests for batch processing

**Regression Risk:** CI flakiness in slow environments
**Recommendation:**
- Use proper async/await utilities
- Consider batch process triggers rather than timing
- Increase timeout to 500ms for CI stability

### 3. Mock Brittleness (Criticality: 4)
**File:** `/Users/joalves/git_tree/absmartly-sdk-plugins/src/cookies/__tests__/CookiePlugin.test.ts`
**Issue:** Deep mocking of cookieUtils with specific implementations

**Problem:** Tests tightly coupled to mock behavior, not real behavior
**Recommendation:**
- Consider testing with real cookie operations when possible
- Use more flexible mock matchers
- Test integration scenarios with minimal mocking

---

## Test Coverage by Module

| Module | Statements | Branches | Functions | Priority |
|--------|-----------|----------|-----------|----------|
| WebVitalsPlugin | 10.2% | 0% | 5% | CRITICAL |
| cookieUtils | 16.3% | 0% | 0% | CRITICAL |
| BrowserCookieAdapter | 20% | 0% | 25% | CRITICAL |
| overridesUtils | 7.1% | 0% | 0% | CRITICAL |
| OverridesPluginLite | 71.8% | 57.1% | 92.3% | HIGH |
| CookiePlugin | 30.6% | 41% | 20.8% | HIGH |
| URLRedirectPlugin | 78.9% | 66.7% | 93.3% | HIGH |
| DOMManipulatorLite | 81.3% | 66.1% | 85% | MEDIUM |
| ExposureTracker | 80.3% | 59.3% | 83% | MEDIUM |
| DOMChangesPluginLite | 83.2% | 82.7% | 81.4% | MEDIUM |
| HTMLInjector | 99.4% | 95.6% | 100% | GOOD |
| StyleSheetManager | 100% | 100% | 100% | GOOD |

---

## Specific File-Line Recommendations

### High Priority Tests to Add

1. **WebVitalsPlugin (Lines 47-304):**
   - Add tests for debugLog() method
   - Test all 5 metric callback handlers
   - Test trackPageMetricsData() with various performance entries
   - Test lifecycle methods (start, ready, initialize)

2. **cookieUtils.ts:**
   - Lines 17-25: getCookie with edge cases
   - Lines 30-61: setCookie with all option combinations
   - Lines 73-75: generateUniqueId collision test
   - Lines 91-100: isLocalStorageAvailable edge cases

3. **overridesUtils.ts:**
   - Lines 27-62: getQueryStringOverrides with 20+ test cases
   - Lines 68-110: parseOverrideCookie with format variations
   - Lines 117-137: getCookieOverrides with multiple cookies
   - Lines 142-157: serializeOverrides round-trip

4. **PendingChangeManager.ts:**
   - Lines 30-35: Invalid observerRoot handling
   - Lines 102-115: Observer setup error handling
   - Lines 154-162: requestAnimationFrame fallback path
   - Lines 184-217: Duplicate prevention across multiple roots

5. **DOMManipulatorLite.ts:**
   - Lines 143-185: JavaScript execution error handling
   - Lines 207-214: Move target not found
   - Lines 304-332: Multiple element creation
   - Lines 26-32: Undefined enabled flag behavior

---

## Mock Usage Assessment

### Current Mocking Strategy
**Positives:**
- Good isolation of units with SDK/context mocks
- Plugin composition tested with actual instances
- Good mock setup/teardown patterns

**Concerns:**
- cookieUtils mocks make cookie tests brittle (jest.mock at module level)
- Deep internal state mocking (appliedChanges Map) couples tests to implementation
- Some tests mock performance API in ways that don't reflect real behavior

### Recommendations
1. Reduce reliance on module-level jest.mock() for cookieUtils
2. Use more integration-style tests for cookie functionality
3. Focus mock assertions on external behavior (context.track calls) not internal state
4. Consider creating test doubles that behave more realistically

---

## Summary of Action Items

### Phase 1 - Critical (Must Complete for Release)
- [ ] Create WebVitalsPlugin test file with 90%+ coverage
- [ ] Create cookieUtils test file with 90%+ coverage
- [ ] Create overridesUtils test file with 90%+ coverage
- [ ] Add BrowserCookieAdapter tests

### Phase 2 - High Priority (Next Sprint)
- [ ] Add CookiePlugin missing scenarios (30%+ -> 80%+)
- [ ] Add error path tests to DOMManipulatorLite
- [ ] Add concurrent scenario tests to PendingChangeManager
- [ ] Add edge case tests to URLRedirectPlugin

### Phase 3 - Quality (Refactoring)
- [ ] Refactor brittle cookie mocks to integration tests
- [ ] Convert implementation-focused assertions to behavioral ones
- [ ] Replace hard-coded timeouts with proper async utilities
- [ ] Improve test readability and reduce test duplication

---

## Conclusion

The test suite has good coverage of core DOM manipulation features but significant gaps in utility functions and plugin edge cases. The most critical gaps are WebVitalsPlugin (10% coverage), cookieUtils (16%), and overridesUtils (7%) - these should be addressed before next release. The DOMManipulatorLite and PendingChangeManager need error scenario coverage to prevent silent failures in production.

Estimated effort: 40-60 hours to reach 85%+ coverage threshold across all modules.
