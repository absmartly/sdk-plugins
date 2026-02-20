# Detailed Test Scenarios & Code Examples

## WebVitalsPlugin Detailed Tests

Key test scenarios for WebVitalsPlugin (currently 10.2% coverage):

**Constructor & Pre-loading:**
- Should start loading web-vitals library in constructor when trackWebVitals=true
- Should NOT start loading if trackWebVitals=false
- Should handle library load failure gracefully without throwing

**trackWebVitalsMetrics():**
- Should register all five Web Vitals callbacks (CLS, LCP, FCP, INP, TTFB)
- Should call context.track for each metric with correct data
- Should return early if no context available
- Should handle concurrent calls while webVitalsPromise is loading (race condition)
- Should use pre-loaded promise from constructor for performance

**trackPageMetricsData():**
- Should track immediate network timing metrics (DNS, TCP, TTFB, download)
- Should track compression ratio when encodedBodySize > 0
- Should handle missing performance entries gracefully
- Should be idempotent - not track twice on multiple calls
- Should attach load event listener when document.readyState not 'complete'

**Lifecycle Methods:**
- start() should call trackWebVitalsMetrics and trackPageMetricsData when autoTrack=true
- ready() should be alias for start()
- initialize() should be alias for start()
- reset() should reset metricsTracked flag to allow re-tracking

**Error Scenarios:**
- Library import failure should be caught and logged
- context.track errors should not crash plugin
- Missing navigation performance entries should not crash

---

## Cookie Utilities Detailed Tests

Key test scenarios for cookieUtils.ts (currently 16.3% coverage):

**getCookie():**
- Return null when cookie does not exist
- Return correct value when present
- NOT match partial cookie names (e.g., "cookie" vs "cookieName")
- Handle URL-encoded values correctly
- Handle multiple semicolon-separated cookies
- Handle empty cookie values
- Handle cookie names with special characters (dash, underscore, dot)

**setCookie():**
- Set basic cookie successfully
- Apply all options: domain, path, sameSite, secure
- Skip domain for localhost (line 44 special case)
- Default sameSite to 'Lax' if not provided
- Return false on error and log gracefully
- Set correct expiry for different day values (7, 365, etc.)
- Handle errors in date operations

**deleteCookie():**
- Delete a cookie by setting maxAge=0
- Propagate options (path, domain) to setCookie
- Clean up completely without orphaned traces

**generateUniqueId():**
- Generate unique IDs on rapid succession (1000+ calls)
- Include timestamp component for collision avoidance
- Be different on subsequent calls
- Not repeat IDs across multiple test runs

**generateUUID():**
- Generate valid UUIDs matching v4 format
- Generate unique UUIDs in sequence
- Handle random seed properly

**isLocalStorageAvailable():**
- Return true when localStorage is available
- Return false when localStorage.setItem throws
- Return false when localStorage.removeItem throws
- Handle quota exceeded scenarios (QuotaExceededError)
- Handle security errors gracefully

---

## OverridesUtils Detailed Tests

Key test scenarios for overridesUtils.ts (currently 7% coverage):

**getQueryStringOverrides():**
- Parse simple variant override from query string
- Parse variant with env and id (variant,env,id format)
- Ignore non-numeric variants
- Ignore parameters without experiment name
- Use custom query prefix
- Handle multiple experiment overrides
- Parse partial env/id (only env without id)
- Use window.location.search when searchParams not provided
- Return empty object in non-browser environments

**parseOverrideCookie():**
- Parse simple experiment override
- Parse experiment with env and id (variant.env.id format)
- Handle dev environment prefix "devEnv=xxx|experiments"
- Parse multiple experiments comma-separated
- Handle URL-encoded experiment names
- Skip invalid experiments without name or values
- Ignore non-numeric variants
- Return empty object for empty string
- Handle env/id as optional parts

**getCookieOverrides():**
- Extract overrides from cookie header string
- Handle multiple cookies in single header
- Use custom cookie name
- Return empty object when cookie not found
- Fall back to document.cookie if cookieHeader not provided
- Handle empty cookie string
- Handle spaces around cookies in header

**serializeOverrides():**
- Serialize simple variant
- Serialize multiple experiments
- Serialize with env and id
- Omit undefined env and id parts
- URL-encode experiment names with special characters
- Handle empty overrides object
- Round-trip correctly: serialize -> parse -> serialize should be identical

---

## PendingChangeManager Error Handling Tests

Key scenarios for PendingChangeManager (90.9% coverage but missing error paths):

**Invalid ObserverRoot Selector:**
- Should handle invalid CSS selector gracefully (line 30)
- Should fallback to document root when selector is invalid
- Should not throw on malformed selectors like "invalid[selector"

**MutationObserver Setup Failures:**
- Should handle observer.observe() throwing exception
- Should gracefully degrade if observer setup fails
- Should not crash application on setup failure

**RequestAnimationFrame Fallback (lines 154-162):**
- Should process work immediately when requestAnimationFrame unavailable
- Should handle non-browser environments
- Should not deadlock when rAF not available

**Duplicate Application Prevention (lines 184-187):**
- Should prevent duplicate application of same selector+experiment
- Should track each selector-experiment combo separately
- Should not reapply after mutation detection

**Concurrent Pending Additions:**
- Should handle additions during batch processing
- Should not lose pending changes added while processing
- Should batch work correctly with concurrent additions

**Observer Cleanup:**
- Should disconnect observer when no pending changes remain
- Should remove entries from pending map correctly
- Should clean up appliedSelectors tracking

**Multiple Observer Roots:**
- Should maintain separate observers for each observerRoot
- Should only clean up specific root when it's empty
- Should not interfere with other roots

---

## DOMManipulatorLite Error Handling Tests

Key missing scenarios for DOMManipulatorLite (81.3% statements):

**JavaScript Execution Errors (lines 175-185, 445-476):**
- Should log syntax errors in user code
- Should log runtime errors during execution
- Should continue without crashing on error
- Should NOT apply element changes on JS error
- Should verify element is unchanged after error

**Move Element Target Not Found (lines 207-214, 479-497):**
- Should handle target selector not found gracefully
- Should skip move operation when target missing
- Should log debug info in debug mode
- Should return false for applyChangeToSpecificElement

**Disabled Change Flag (lines 26-32):**
- Should treat undefined enabled as enabled (truthy)
- Should skip change when enabled=false
- Should return false for disabled changes

**Create Change Edge Cases (lines 304-332):**
- Should support multiple elements from HTML string
- Should handle empty HTML string gracefully
- Should handle HTML without valid elements
- Should position multiple created elements correctly

---

## Summary of Critical Test Gaps

| Module | Current % | Critical Gaps | Priority |
|--------|----------|--------------|----------|
| WebVitalsPlugin | 10.2% | All functionality, async handling, error cases | CRITICAL |
| cookieUtils | 16.3% | All functions completely untested | CRITICAL |
| overridesUtils | 7.1% | All functions completely untested | CRITICAL |
| BrowserCookieAdapter | 20% | get/set/delete operations | CRITICAL |
| CookiePlugin | 30.6% | Config options, storage fallbacks | HIGH |
| OverridesPluginLite | 71.8% | Edge cases, error handling | MEDIUM |
| PendingChangeManager | 90.9% | Error scenarios, concurrent operations | MEDIUM |
| DOMManipulatorLite | 81.3% | JavaScript errors, move failures | MEDIUM |
| ExposureTracker | 80.3% | Concurrent scenarios, deduplication | MEDIUM |
| DOMChangesPluginLite | 83.2% | SPA mode edge cases, reapply scenarios | MEDIUM |

---

## Testing Strategy

Each test should follow this pattern:

1. **Setup**: Create necessary mocks, fixtures, and DOM state
2. **Action**: Call the function with test input
3. **Assertion**: Verify correct behavior and side effects
4. **Cleanup**: Destroy resources, reset mocks

Key principles:
- Test behavior, not implementation details
- Use realistic test data
- Verify both success and error paths
- Include edge cases and boundary conditions
- Test concurrent/async scenarios where applicable
- Verify idempotency where relevant
- Check for side effects and state management

These tests will significantly improve coverage and catch regressions that could occur in production.
