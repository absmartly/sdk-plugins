# Session Context: f5ae1a55-b107-4cb8-a79d-2374c4566dcb

## Current Task
Investigating potential issue with JavaScript DOM changes not triggering correctly across all variants. Need to verify all DOM change types (css, attribute, javascript, html) generate visitors in all variants.

## Investigation Plan
1. Review current test coverage for DOM changes
2. Identify which types are tested and which aren't
3. Run existing tests to check for failures
4. Add comprehensive tests for all DOM change types across all variants
5. Fix any issues found

## Progress
- Starting systematic investigation
- All existing tests pass (580 tests)
- Found the issue: Cross-variant exposure tests only use `type: 'text'` changes
- Created comprehensive test suite for all change types (12 new tests)
- **ROOT CAUSE FOUND**: Delete changes with `trigger_on_view: true` did NOT create placeholders for viewport tracking
- All other types work correctly: javascript, html, style, attribute, class, move all pass

## Fix Applied
- Modified `ExposureTracker.ts` to collect delete changes separately (similar to move changes)
- Added `createInPlacePlaceholder()` method to replace deleted elements with 1px invisible placeholders
- Placeholders use unique IDs for performant querying (e.g., `absmartly-delete-{experiment}-{selector}-{index}`)
- Modified `DOMChangesPluginLite.ts` to skip immediate delete application for trigger_on_view cases
- Placeholders are tracked by IntersectionObserver and trigger exposure when visible
- All 592 tests now pass (added 12 new tests covering all change types)

## Verification
✅ All DOM change types generate visitors correctly across ALL variants:
  - javascript: ✅ immediate + ✅ viewport
  - html: ✅ immediate + ✅ viewport
  - style: ✅ immediate + ✅ viewport
  - attribute: ✅ immediate + ✅ viewport
  - class: ✅ immediate + ✅ viewport
  - move: ✅ immediate + ✅ viewport
  - delete: ✅ immediate + ✅ viewport (fixed!)
