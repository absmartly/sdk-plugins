# Complete Codebase Review & Remediation Checklist

**Start Date:** February 20, 2026
**Target:** 100% completion of all phases

---

## PHASE 1: CRITICAL SECURITY & RESOURCE LEAKS (7/7) ✅

- [x] Fix duplicate URLFilter type definitions
- [x] Fix MutationObserver memory leak in ExposureTracker
- [x] Fix history.pushState/replaceState patch leaks
- [x] Fix broken HTML injection deduplication logic
- [x] Fix unreachable code in URLRedirectExtractor
- [x] Verify all critical fixes compile
- [x] Verify all tests pass (703/703)

---

## PHASE 2: CODE QUALITY ISSUES

### 2A: forEach → for...of Replacement (44 total)

**Completed (10/10):**
- [x] DOMChangesPluginLite.ts - 4 forEach calls
- [x] ExposureTracker.ts - 6 forEach calls
- [x] HTMLInjector.ts - 1 forEach call (in destroy)

**Remaining (34/34):**

**DOMManipulatorLite.ts:**
- [ ] Line 104: elements.forEach()
- [ ] Line 157: mutations.forEach()
- [ ] Line 160: mutation.addedNodes.forEach()
- [ ] Line 166: appliedChanges.forEach()
- [ ] Line 167: changes.forEach()
- [ ] Line 174: matchingElements.forEach()

**ExposureTracker.ts (13 more):**
- [ ] Line 338: elements.forEach()
- [ ] Line 434: selectors.forEach()
- [ ] Line 439: elements.forEach()
- [ ] Line 483: entries.forEach()
- [ ] Line 501: mutations.forEach()
- [ ] Line 502: mutation.addedNodes.forEach()
- [ ] Line 521: this.experiments.forEach()
- [ ] Line 522: tracking.allPossibleSelectors.forEach()
- [ ] Line 528: element.querySelectorAll().forEach()
- [ ] Line 542: tracked.experiments.forEach()
- [ ] Line 606: this.trackedElements.forEach()
- [ ] Line 616: this.placeholders.forEach()
- [ ] Line 677: this.placeholders.forEach()

**CookiePlugin.ts:**
- [ ] Line 184: this.utmParams.forEach()
- [ ] Line 194: this.utmParams.forEach()
- [ ] Line 286: Object.entries().forEach()

**PendingChangeManager.ts:**
- [ ] Check for forEach calls

**persistence.ts:**
- [ ] Line 111: mutations.forEach()

**Other files:**
- [ ] URL matching utilities
- [ ] Override utilities
- [ ] Parser utilities
- [ ] Any remaining forEach calls

### 2B: Remove Excessive Comments (50+ instances)

**DOMChangesPluginLite.ts:**
- [ ] Remove obvious operation comments
- [ ] Keep business logic comments (SRM prevention, anti-flicker)

**DOMManipulatorLite.ts:**
- [ ] Line 39: "Get user's variant" - remove (obvious)
- [ ] Line 320: "Move all children" - evaluate (could be kept as note)
- [ ] Other obvious comments

**HTMLInjector.ts:**
- [ ] Review and remove obvious comments
- [ ] Keep important injection position info

**ExposureTracker.ts:**
- [ ] Review all comments for necessity
- [ ] Keep complex viewport tracking explanations

**All other files:**
- [ ] Systematic review of comment necessity
- [ ] Target: Remove ~50+ unnecessary comments

### 2C: Consolidate Duplicate Code

**Cookie Parsing (4 locations):**
- [ ] BrowserCookieAdapter.ts - Replace custom parsing with getCookie()
- [ ] OverridesPlugin.ts - Replace custom parsing with getCookie()
- [ ] OverridesPluginLite.ts - Replace custom parsing with getCookie()
- [ ] Verify all tests still pass

**Cookie Value Parsing (2 locations):**
- [ ] OverridesPluginLite.ts - Use parseOverrideCookie from overridesUtils
- [ ] OverridesPlugin.ts - Use parseOverrideCookie from overridesUtils

**Query String Override Parsing (3 locations):**
- [ ] OverridesPluginLite.ts - Use getQueryStringOverrides from overridesUtils
- [ ] OverridesPlugin.ts - Use getQueryStringOverrides from overridesUtils
- [ ] Remove duplicate implementations

### 2D: Performance Optimizations

- [ ] Guard expensive debug logging (VariantExtractor.ts)
- [ ] Move JSON.stringify inside debug guard
- [ ] Prevent argument evaluation in non-debug builds

### 2E: Phase 2 Verification
- [ ] All code compiles
- [ ] All 703+ tests pass
- [ ] No new lint warnings
- [ ] No performance regressions

---

## PHASE 3: ERROR HANDLING IMPROVEMENTS (27 issues)

### 3A: Silent Error Handlers (7 issues)

**DOMManipulatorLite.ts:**
- [ ] Line 264-275: Add error event for DOM change failures
- [ ] Line 369-375: Add error event for style rule failures
- [ ] Line 175-185: Add error event for JavaScript execution
- [ ] Include error context in events

**DOMChangesPluginLite.ts:**
- [ ] Line 148-151: Improve initialization error message
- [ ] Add error callback option

**HTMLInjector.ts:**
- [ ] Line 188-192: Add return value indicating failure
- [ ] Notify caller of injection failure

### 3B: Unhandled Promise Rejections (3 issues)

**DOMChangesPluginLite.ts:**
- [ ] Line 1028: Add .catch() handler to refresh promise
- [ ] Handle refresh failures gracefully

**OverridesPlugin.ts:**
- [ ] Find and fix unhandled promise rejections
- [ ] Add proper .catch() or await error handling

**ExposureTracker.ts:**
- [ ] Find and fix unhandled promise rejections

### 3C: Silent API Failures (2 issues)

**OverridesPlugin.ts:**
- [ ] Add error event for API fetch failures
- [ ] Add error event for dev SDK fetch failures
- [ ] Notify app of API availability issues

### 3D: Silent Exposure Tracking Failures (2 issues)

**ExposureTracker.ts:**
- [ ] Add error logging for exposure trigger failures
- [ ] Add error event for tracking issues

**URLRedirectPlugin.ts:**
- [ ] Add error logging for redirect exposure tracking

### 3E: Event Handler Errors (2+ issues)

**DOMChangesPluginLite.ts:**
- [ ] Line 968-977: Wrap event listener callbacks
- [ ] Propagate errors from event handlers
- [ ] Log handler errors

**Other event emitters:**
- [ ] Review all emit() implementations
- [ ] Add error handling for listener callbacks

### 3F: Improve Error Messages (6+ issues)

- [ ] Add specific error messages for different failure types
- [ ] Include context (selector, change type, experiment name)
- [ ] Help users debug issues
- [ ] Distinguish expected vs unexpected errors

### 3G: Phase 3 Verification
- [ ] All error handlers implemented
- [ ] Error events emitted for critical failures
- [ ] All promises properly handled
- [ ] All tests pass (including new error scenarios)
- [ ] No unhandled promise rejection warnings

---

## PHASE 4: TEST COVERAGE GAPS

### 4A: WebVitalsPlugin Tests (10.2% → 80%+)

**Create: src/vitals/__tests__/WebVitalsPlugin.test.ts**
- [ ] Constructor with various options
- [ ] Context setting and validation
- [ ] Web Vitals library loading (success/failure)
- [ ] All metric tracking methods (CLS, LCP, FCP, INP, TTFB)
- [ ] Page metrics (immediate and load-dependent)
- [ ] Async promise race conditions
- [ ] Error handling during library load
- [ ] Event listener attachment
- [ ] Multiple initialization calls (idempotency)
- [ ] start(), ready(), initialize() lifecycle
- [ ] reset() functionality
- [ ] Pre-loading optimization path

### 4B: cookieUtils Tests (16.3% → 80%+)

**Create: src/cookies/__tests__/cookieUtils.test.ts**
- [ ] getCookie() with various scenarios
- [ ] Edge cases (empty, missing, malformed)
- [ ] Cookie parsing with spaces/special chars
- [ ] Cookie collision detection
- [ ] getAllCookies() functionality
- [ ] Cookie deletion/clearing
- [ ] Performance with many cookies

### 4C: overridesUtils Tests (7.1% → 80%+)

**Create: src/overrides/__tests__/overridesUtils.test.ts**
- [ ] getQueryStringOverrides() - all patterns
- [ ] parseOverrideCookie() - all formats
- [ ] Cookie collision detection
- [ ] Invalid data handling
- [ ] Edge cases and boundary conditions
- [ ] Serialization/deserialization

### 4D: BrowserCookieAdapter Tests (20% → 80%+)

**Create: src/overrides/__tests__/BrowserCookieAdapter.test.ts**
- [ ] Constructor initialization
- [ ] get() method with various cookies
- [ ] set() method functionality
- [ ] Error handling
- [ ] Integration with cookieUtils

### 4E: Additional Coverage

**DOMManipulatorLite.ts:**
- [ ] Error paths for DOM operations
- [ ] Invalid selector handling
- [ ] Style application edge cases
- [ ] JavaScript execution failures

**PendingChangeManager.ts:**
- [ ] Error scenarios
- [ ] Concurrent operations
- [ ] Timeout handling
- [ ] Memory cleanup

**URLMatcher.ts:**
- [ ] All match type combinations
- [ ] Include/exclude patterns
- [ ] Regex mode matching

**ExposureTracker.ts:**
- [ ] Viewport detection edge cases
- [ ] Concurrent tracking scenarios
- [ ] Element not found handling

### 4F: Phase 4 Verification
- [ ] Branch coverage 75%+ for all modules
- [ ] All critical paths covered by tests
- [ ] Error scenarios tested
- [ ] Edge cases covered
- [ ] All 703+ existing tests still pass
- [ ] New tests integrate cleanly

---

## FINAL VERIFICATION & CLEANUP

- [ ] All phases complete
- [ ] Compile succeeds: `npm run compile`
- [ ] Lint clean: `npm run lint`
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No performance regressions
- [ ] No memory leaks introduced
- [ ] Code follows CLAUDE.md standards
- [ ] All commits follow conventional format
- [ ] Session summary updated with completion

---

## Commit Strategy

**Organize commits by logical units:**
- forEach replacement by file
- Comment removal by file
- Duplicate code consolidation by function
- Error handling improvements by file
- Test additions by module
- Final verification commit

**Format:** `type(scope): description`
- fix: Error handling improvements
- refactor: Code consolidation
- test: Add coverage tests
- perf: Performance improvements

---

## Progress Tracking

**Start Time:** [To be filled]
**Current Phase:** [To be filled]
**% Complete:** [To be calculated]
**End Time:** [To be filled]

---

## Notes

- Work systematically through each item
- Run tests after each logical group
- Commit frequently with clear messages
- Document any discovered issues
- Keep architectural decisions clean
