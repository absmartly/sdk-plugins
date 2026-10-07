# Trim URL Filter Patterns Implementation Plan [FT-2326]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Ticket:** FT-2326 - URL filter patterns with leading/trailing whitespace silently never match
**PR Title Format:** `fix(url-filter): trim whitespace from URL filter patterns (FT-2326)`

**Goal:** A URL filter pattern padded with whitespace behaves as the customer meant, instead of silently never matching.

**Architecture:** All URL filter evaluation goes through `URLMatcher.matches`, which first normalizes the filter in `normalizeFilter`. Sanitize patterns there: trim each `include`/`exclude` pattern and drop any that are empty after trimming. Emit a `logDebug` warning when a pattern was trimmed, and make the existing invalid-regex log an explicit warning.

**Tech Stack:** TypeScript, Jest (jsdom)

---

## Why drop empty-after-trim patterns

A real URL never contains a literal space (it is encoded as `%20`), so leading/trailing whitespace can never be intended. But a whitespace-only pattern trimmed to `''` would become `new RegExp('')` in regex mode, which matches every URL — an exclude of `[' ']` would suddenly exclude everything. Dropping it preserves today's behavior: that pattern matched nothing before, and matches nothing after.

| Input | Before | After |
|---|---|---|
| `exclude: [' (a\|b)']`, regex | never excludes | excludes `/a`, `/b` |
| `include: ['/products/* ']`, simple | never includes | includes `/products/1` |
| `exclude: [' ']`, regex | excludes nothing | excludes nothing |
| `include: [' ']` | matches nothing | matches nothing (empty include) |
| string filter `' /checkout '` | never matches | matches `/checkout` |

## Task 1: Unit tests for trimming (`src/utils/__tests__/URLMatcher.test.ts`)

- [ ] Add `describe('Whitespace in patterns')` covering the table above, in both `simple` and `regex` modes, for `include`, `exclude`, string and array filters, including the real LATAM pattern.
- [ ] Run, confirm they fail.

## Task 2: Implement in `src/utils/URLMatcher.ts`

- [ ] Add `sanitizePatterns(patterns?: string[]): string[] | undefined` — trims, drops empty, `logDebug` warning naming the original pattern when it changed.
- [ ] Apply it to `include` and `exclude` in every branch of `normalizeFilter`, keeping `include: undefined` (match all) distinct from `include: []` (match nothing).
- [ ] Reword the invalid-regex log as a warning that says the pattern will be ignored.
- [ ] Run URLMatcher tests, confirm they pass.

## Task 3: Exposure test (`src/core/__tests__/DOMChangesPluginLite.urlFiltering.test.ts`)

- [ ] In `Regex exclude filters`, add a case with the leading-space LATAM pattern on both variants: on `/cl/es/ofertas-vuelos`, `treatment()` is never called; on `/cl/es`, it is.

## Task 4: Verify

- [ ] `npx jest`, `npx eslint src`, `npx tsc --noEmit`.
- [ ] Run a review over the diff.
