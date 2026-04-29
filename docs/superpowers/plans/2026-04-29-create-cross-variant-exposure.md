# Cross-Variant Exposure Tracking for `create` Changes Implementation Plan [FT-1879]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**JIRA:** FT-1879 — Cross-variant exposure tracking gap for `create` changes with `trigger_on_view`
**PR Title Format:** `fix(exposure): cross-variant tracking for create changes (FT-1879)`

**Goal:** Ensure SRM-preserving exposure tracking when an experiment uses `create` changes with `trigger_on_view: true` across variants — peer variants (those that don't create the element) must still expose when the user scrolls to the would-be position.

**Architecture:** Mirror the existing `move`/`delete` pattern: for every unique `(targetSelector, position)` pair across all variants' viewport-triggered `create` changes, drop a 1px invisible positional placeholder via `createContainerPlaceholder`. Dedupe by `target|position` because a created element only exists in the variant that creates it — cross-variant tracking is positional, not selector-based. Malformed `create` changes (missing `targetSelector`) are skipped because `DOMManipulatorLite.applyChange` already returns false for them — no placeholder, no observation, no crash.

**Tech Stack:** TypeScript, Jest, jsdom, jest-mocked `IntersectionObserver`. Helpers: `createTreatmentTracker` (`src/__tests__/sdk-helper.ts`) and the per-suite `triggerIntersection` defined inline at `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts:104`.

---

## Status of the Fix

The production fix is **already in place** on this branch:

- `src/core/ExposureTracker.ts:61-96` — first-pass loop now collects `create` changes into a `createPositions: Map<"target|position", {targetSelector, position}>`.
- `src/core/ExposureTracker.ts:190-204` — after the `delete` block, iterates `createPositions` and calls `createContainerPlaceholder(experimentName, '__create_placeholder__', targetSelector, position)` for each unique pair.
- Malformed `create` (no `targetSelector`) is intentionally skipped inside the new branch — no fallback path.
- `.gitignore` updated to exclude `.claude/tasks/` and `.worktrees/`.

The remaining work is **test coverage** to lock in the new behavior and protect against regressions. The existing `6F: Create Changes` block at `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts:3972` covers only immediate triggers (`trigger_on_view: false`). Tasks below extend it.

## File Structure

| File | Responsibility |
|------|---------------|
| `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` | New `describe` blocks `6F2` – `6F6` covering viewport-triggered create cross-variant scenarios. All additions go inside the existing `6F: Create Changes` block. |

No production code changes are needed — only tests. Existing fix is locked in; new tests verify it.

---

## Task 1: Baseline — viewport-triggered create in a single variant

**Files:**
- Modify: `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` — add `describe('6F2: Create with viewport trigger', ...)` after the existing `6F1` block, before the closing `});` of `6F`.

**Why:** Sanity baseline before the cross-variant cases. Confirms a placeholder is observed and exposure fires when its position enters viewport.

- [ ] **Step 1: Add the test**

Insert immediately after the `6F1` closing `});` (around line 4044, before the `6F` closing `});`):

```typescript
      describe('6F2: Create with viewport trigger', () => {
        it('user in v1 - exposure fires when target position enters viewport', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f2_create_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="new">New</div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f2_create_viewport: 1,
          });
          document.body.innerHTML = '<div class="container">Container</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          expect(document.querySelector('.new')).not.toBeNull();

          const placeholder = document.querySelector(
            '.container [data-absmartly-placeholder]'
          ) as Element;
          expect(placeholder).not.toBeNull();

          await triggerIntersection(placeholder, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f2_create_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
```

- [ ] **Step 2: Run only the new test**

```bash
npx jest --testPathPattern="crossVariantExposure" -t "6F2"
```

Expected: 1 passed.

---

## Task 2: Peer variant gets placeholder-based exposure

**Files:**
- Modify: `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` — add `describe('6F3: Cross-variant create — peer variant', ...)` after `6F2`.

**Why:** This is the core SRM case the fix addresses. User in control (no create) must still trigger exposure when the position where v1 would have created the element enters viewport.

- [ ] **Step 1: Add the test**

Insert after the `6F2` closing `});`:

```typescript
      describe('6F3: Cross-variant create - peer variant placeholder exposure', () => {
        it('user in v0 (no create) - exposure fires via placeholder at v1 target position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f3_peer_variant',
            variants: [
              { variables: { __dom_changes: [] } },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="new">New</div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f3_peer_variant: 0,
          });
          document.body.innerHTML = '<div class="container">Container</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          // v0 user: nothing was created
          expect(document.querySelector('.new')).toBeNull();

          // ...but a placeholder MUST exist at v1's target position
          const placeholder = document.querySelector(
            '.container [data-absmartly-placeholder]'
          ) as Element;
          expect(placeholder).not.toBeNull();
          expect(placeholder.getAttribute('data-absmartly-experiment')).toBe(
            'test_6f3_peer_variant'
          );

          // No exposure until placeholder is visible
          expect(treatmentSpy).not.toHaveBeenCalled();

          await triggerIntersection(placeholder, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f3_peer_variant');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
```

- [ ] **Step 2: Run the new test**

```bash
npx jest --testPathPattern="crossVariantExposure" -t "6F3"
```

Expected: 1 passed.

---

## Task 3: Multiple variants creating at different positions

**Files:**
- Modify: `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` — add `describe('6F4: Multi-variant create at different positions', ...)` after `6F3`.

**Why:** Confirms placeholders are dropped at every distinct position and that triggering ANY placeholder fires exposure. Three-variant case to flush out off-by-one issues in the dedup map.

- [ ] **Step 1: Add the test**

```typescript
      describe('6F4: Multi-variant create at different positions', () => {
        it('user in v0 - placeholders at every other variant position; any one fires exposure', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f4_multi_position',
            variants: [
              { variables: { __dom_changes: [] } },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="banner-a"></div>',
                      targetSelector: '.header',
                      position: 'lastChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="banner-b"></div>',
                      targetSelector: '.footer',
                      position: 'firstChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f4_multi_position: 0,
          });
          document.body.innerHTML =
            '<div class="header">H</div><div class="footer">F</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          const headerPlaceholder = document.querySelector(
            '.header [data-absmartly-placeholder]'
          ) as Element;
          const footerPlaceholder = document.querySelector(
            '.footer [data-absmartly-placeholder]'
          ) as Element;

          expect(headerPlaceholder).not.toBeNull();
          expect(footerPlaceholder).not.toBeNull();
          expect(treatmentSpy).not.toHaveBeenCalled();

          await triggerIntersection(footerPlaceholder, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f4_multi_position');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
```

- [ ] **Step 2: Run the new test**

```bash
npx jest --testPathPattern="crossVariantExposure" -t "6F4"
```

Expected: 1 passed.

---

## Task 4: Same-position dedup across variants

**Files:**
- Modify: `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` — add `describe('6F5: Same-position create dedup', ...)` after `6F4`.

**Why:** Two variants creating different elements at the same `(targetSelector, position)` must produce exactly one placeholder. The `createPositions` Map is keyed by `target|position`, so this verifies the dedup contract.

- [ ] **Step 1: Add the test**

```typescript
      describe('6F5: Same-position create dedup', () => {
        it('user in v0 - exactly one placeholder when two variants create at same target/position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f5_dedup',
            variants: [
              { variables: { __dom_changes: [] } },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="a"></div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="b"></div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f5_dedup: 0,
          });
          document.body.innerHTML = '<div class="container">C</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          const placeholders = document.querySelectorAll(
            '.container [data-absmartly-placeholder]'
          );
          expect(placeholders.length).toBe(1);

          await triggerIntersection(placeholders[0], true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f5_dedup');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
```

- [ ] **Step 2: Run the new test**

```bash
npx jest --testPathPattern="crossVariantExposure" -t "6F5"
```

Expected: 1 passed.

---

## Task 5: Malformed create (no `targetSelector`) is a no-op

**Files:**
- Modify: `src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts` — add `describe('6F6: Malformed create — no targetSelector', ...)` after `6F5`.

**Why:** Confirms the explicit skip in the new branch. A `create` without `targetSelector` cannot be applied by `DOMManipulatorLite` (returns false at `DOMManipulatorLite.ts:190`). The tracker must not crash, must not create a placeholder, and (when no other tracking exists) must not fire exposure.

- [ ] **Step 1: Add the test**

```typescript
      describe('6F6: Malformed create - no targetSelector', () => {
        it('user in v0 - no placeholder, no exposure, no crash', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f6_malformed',
            variants: [
              { variables: { __dom_changes: [] } },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="orphan"></div>',
                      // targetSelector intentionally omitted
                      trigger_on_view: true,
                    } as any,
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f6_malformed: 0,
          });
          document.body.innerHTML = '<div class="container">C</div>';

          // Setup must not throw
          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          // No placeholder anywhere for this experiment
          const placeholder = document.querySelector(
            '[data-absmartly-experiment="test_6f6_malformed"]'
          );
          expect(placeholder).toBeNull();

          // The element was never created either
          expect(document.querySelector('.orphan')).toBeNull();

          // No exposure - nothing observable means nothing to trigger
          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });
```

- [ ] **Step 2: Run the new test**

```bash
npx jest --testPathPattern="crossVariantExposure" -t "6F6"
```

Expected: 1 passed.

---

## Task 6: Full suite verification + commit

**Files:**
- All staged.

- [ ] **Step 1: Run full plugin test suite**

```bash
npx jest --testPathPattern="DOMChangesPluginLite"
```

Expected: 7 passed test suites, ≥ 259 passed (254 baseline + 5 new), 1 skipped.

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no errors. (Pre-commit prettier hook will reformat on commit anyway.)

- [ ] **Step 3: Stage changes**

```bash
git add .gitignore src/core/ExposureTracker.ts src/core/__tests__/DOMChangesPluginLite.crossVariantExposure.test.ts docs/superpowers/plans/2026-04-29-create-cross-variant-exposure.md
git status
```

Expected status: only the four files above modified/added.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(exposure): cross-variant tracking for create changes (FT-1879)

create changes with trigger_on_view previously fell through the generic
selector-tracking branch in ExposureTracker, so peer variants without the
create had nothing observable and never fired exposure when the would-be
position entered viewport. Mirror the move/delete pattern: collect every
unique (targetSelector, position) pair across all variants' viewport-
triggered create changes and drop an invisible positional placeholder at
each. Malformed creates (no targetSelector) are skipped explicitly --
the manipulator can't apply them either.

Also gitignore .claude/tasks/ and .worktrees/.
EOF
)"
```

- [ ] **Step 5: Push**

```bash
git push -u origin fix/FT-1879/create-cross-variant-exposure
```

Report the branch URL back to the user. PR creation is left to the user (or a follow-up `/create-pr` invocation).

---

## Self-Review Notes

- **Spec coverage:** Acceptance criteria from FT-1879 — (1) placeholder per unique position ✓ (Tasks 2–5 verify); (2) tests across the four scenarios ✓ (Tasks 2/3/4/5); (3) existing suites pass ✓ (Task 6 step 1).
- **Placeholders:** none — every test step contains complete code and exact run commands.
- **Type consistency:** `data-absmartly-placeholder` attribute, `data-absmartly-experiment` attribute, and the `__create_placeholder__` originalSelector sentinel are all set in `ExposureTracker.createContainerPlaceholder` (`src/core/ExposureTracker.ts:283-286`). Tests query by attribute, not by value, so the sentinel can change without breaking tests.
