# @absmartly/dom-tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone DOM analytics tracking library (`@absmartly/dom-tracker`) with modular trackers, plus a thin integration wrapper in `@absmartly/sdk-plugins`.

**Architecture:** Core `DOMTracker` class manages lifecycle, event dispatching, data-attribute scanning, and selector rule matching. Pluggable trackers (page views, scroll, time, forms, session) register with the core via `TrackerContext`. Events exit exclusively through `onEvent` callbacks. A separate `AnalyticsPlugin` in sdk-plugins wires this to ABsmartly context.

**Tech Stack:** TypeScript, Jest + ts-jest + jsdom, Webpack (UMD), no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-03-18-dom-tracker-design.md`

---

## File Structure

### New repo: `@absmartly/dom-tracker` (at `../dom-tracker` relative to sdk-plugins)

```
package.json
tsconfig.json
tsconfig.cjs.json
tsconfig.es.json
tsconfig.types.json
jest.config.js
webpack.config.js
src/
  core/
    types.ts              # All interfaces: DOMTrackerConfig, Tracker, TrackerContext, TrackingRule, Preset, EventHandler, AttributeHandler
    DOMTracker.ts         # Core class: lifecycle, tracker management, event dispatch, default tracker merging
    ElementScanner.ts     # data-abs-* attribute scanning, click delegation, property extraction with type coercion
    RuleEngine.ts         # TrackingRule matching, event binding per selector, dynamic rule addition
    SPAObserver.ts        # MutationObserver, history monkey-patching, route change detection, element add/remove subscriptions
  trackers/
    page-views.ts         # pageViews() factory — fires page_view on init and route change
    scroll.ts             # scrollDepth() factory — throttled scroll listener, configurable thresholds
    time.ts               # timeOnPage() factory — setInterval timers, visibility pause, optional tab events
    forms.ts              # formTracker() factory — form start/submit/abandon detection
    session.ts            # sessionTracker() factory — session cookie, visitor cookie, UTM extraction, device detection
  presets/
    index.ts              # definePreset() helper
    hubspot.ts            # hubspotForms() preset — hsFormsOnReady listener, .hs-input tracking
  utils/
    debug.ts              # debugLog() conditional logger
    cookies.ts            # getCookie, setCookie, deleteCookie, generateId, isLocalStorageAvailable
    dom.ts                # getPageName() default implementation, parseDataAttributes()
  index.ts                # Public re-exports
  __tests__/
    setup.ts              # Jest setup
    core/
      DOMTracker.test.ts
      ElementScanner.test.ts
      RuleEngine.test.ts
      SPAObserver.test.ts
    trackers/
      page-views.test.ts
      scroll.test.ts
      time.test.ts
      forms.test.ts
      session.test.ts
    presets/
      hubspot.test.ts
    utils/
      debug.test.ts
      cookies.test.ts
      dom.test.ts
```

### Modified in `@absmartly/sdk-plugins` (this repo)

```
src/
  analytics/
    AnalyticsPlugin.ts    # Thin wrapper: context.track() + context.attributes() + DOMTracker
    types.ts              # AnalyticsPluginConfig interface
    index.ts              # Exports
    __tests__/
      AnalyticsPlugin.test.ts
  utils/
    plugin-registry.ts    # Add 'analytics' key to PluginRegistry
  index.ts                # Add analytics exports
package.json              # Add @absmartly/dom-tracker dependency
webpack.config.js         # Add analytics bundle variant
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `../dom-tracker/package.json`
- Create: `../dom-tracker/tsconfig.json`
- Create: `../dom-tracker/tsconfig.cjs.json`
- Create: `../dom-tracker/tsconfig.es.json`
- Create: `../dom-tracker/tsconfig.types.json`
- Create: `../dom-tracker/jest.config.js`
- Create: `../dom-tracker/src/__tests__/setup.ts`
- Create: `../dom-tracker/.gitignore`

- [ ] **Step 1: Create dom-tracker directory**

```bash
mkdir -p ../dom-tracker/src/__tests__
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@absmartly/dom-tracker",
  "version": "0.1.0",
  "description": "Standalone DOM analytics tracking library using data-attributes and selector rules",
  "main": "lib/index.js",
  "module": "es/index.js",
  "browser": "dist/dom-tracker.min.js",
  "types": "types/index.d.ts",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./types/index.d.ts",
      "import": "./es/index.js",
      "require": "./lib/index.js"
    },
    "./trackers/page-views": {
      "source": "./src/trackers/page-views.ts",
      "types": "./types/trackers/page-views.d.ts",
      "import": "./es/trackers/page-views.js",
      "require": "./lib/trackers/page-views.js"
    },
    "./trackers/scroll": {
      "source": "./src/trackers/scroll.ts",
      "types": "./types/trackers/scroll.d.ts",
      "import": "./es/trackers/scroll.js",
      "require": "./lib/trackers/scroll.js"
    },
    "./trackers/time": {
      "source": "./src/trackers/time.ts",
      "types": "./types/trackers/time.d.ts",
      "import": "./es/trackers/time.js",
      "require": "./lib/trackers/time.js"
    },
    "./trackers/forms": {
      "source": "./src/trackers/forms.ts",
      "types": "./types/trackers/forms.d.ts",
      "import": "./es/trackers/forms.js",
      "require": "./lib/trackers/forms.js"
    },
    "./trackers/session": {
      "source": "./src/trackers/session.ts",
      "types": "./types/trackers/session.d.ts",
      "import": "./es/trackers/session.js",
      "require": "./lib/trackers/session.js"
    },
    "./presets": {
      "source": "./src/presets/index.ts",
      "types": "./types/presets/index.d.ts",
      "import": "./es/presets/index.js",
      "require": "./lib/presets/index.js"
    },
    "./presets/hubspot": {
      "source": "./src/presets/hubspot.ts",
      "types": "./types/presets/hubspot.d.ts",
      "import": "./es/presets/hubspot.js",
      "require": "./lib/presets/hubspot.js"
    }
  },
  "files": ["lib", "es", "dist", "types"],
  "scripts": {
    "clean": "rm -rf lib es dist types",
    "format": "prettier --write \"src/**/*.{js,ts,tsx}\"",
    "lint": "eslint src --ext .ts,.tsx",
    "compile:cjs": "tsc -p tsconfig.cjs.json",
    "compile:es": "tsc -p tsconfig.es.json",
    "compile:types": "tsc -p tsconfig.types.json",
    "compile": "npm run compile:cjs && npm run compile:es && npm run compile:types",
    "bundle": "webpack --mode production --env BUILD_TYPE=all",
    "build": "npm run clean && npm run format && npm run lint && npm run compile && npm run bundle",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "release": "npm run build && npm publish --access public"
  },
  "keywords": ["analytics", "tracking", "dom", "data-attributes", "events"],
  "author": "ABsmartly",
  "license": "MIT",
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^20.8.0",
    "@typescript-eslint/eslint-plugin": "^6.7.4",
    "@typescript-eslint/parser": "^6.7.4",
    "eslint": "^8.50.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "prettier": "^3.0.3",
    "ts-jest": "^29.4.1",
    "ts-loader": "^9.4.4",
    "typescript": "^5.2.2",
    "webpack": "^5.88.2",
    "webpack-cli": "^5.1.4"
  }
}
```

- [ ] **Step 3: Create tsconfig files**

`tsconfig.json` (base — CJS, same as sdk-plugins):
```json
{
  "compilerOptions": {
    "target": "ES5",
    "module": "commonjs",
    "lib": ["ES2015", "DOM"],
    "declaration": true,
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "sourceMap": true,
    "removeComments": false,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "downlevelIteration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "lib", "es", "types", "src/**/*.test.ts", "src/**/__tests__/**/*"]
}
```

`tsconfig.cjs.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "module": "commonjs", "outDir": "./lib" }
}
```

`tsconfig.es.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "module": "ES2015", "outDir": "./es", "declaration": false }
}
```

`tsconfig.types.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "./types", "declaration": true, "emitDeclarationOnly": true }
}
```

- [ ] **Step 4: Create jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 }
  },
  testMatch: [
    '**/__tests__/**/*.+(spec|test).+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: { '^.+\\.(ts|tsx)$': 'ts-jest' }
};
```

- [ ] **Step 5: Create test setup and .gitignore**

`src/__tests__/setup.ts`:
```typescript
// Test setup — extend as needed
```

`.gitignore`:
```
node_modules/
lib/
es/
dist/
types/
coverage/
*.js.map
```

- [ ] **Step 6: Initialize git repo and install deps**

```bash
cd ../dom-tracker
git init
npm install
```

Note: Use `npm install` here since it's a brand new project with no lock file. All subsequent installs must use `npm ci`.

- [ ] **Step 7: Verify setup compiles**

```bash
cd ../dom-tracker
npx tsc --noEmit
```

Expected: No errors (empty src).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig*.json jest.config.js .gitignore src/__tests__/setup.ts
git commit -m "chore: scaffold @absmartly/dom-tracker project"
```

---

## Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`
- Test: `src/__tests__/core/types.test.ts`

- [ ] **Step 1: Write the types file**

```typescript
export type EventHandler = (event: string, props: Record<string, unknown>) => void;
export type AttributeHandler = (attrs: Record<string, unknown>) => void;

export interface TrackingRule {
  selector: string;
  event: string;
  on?: string;
  props?: Record<string, unknown>;
}

export interface Preset {
  rules: TrackingRule[];
  tracker?: Tracker;
}

export interface DOMTrackerConfig {
  onEvent: EventHandler | EventHandler[];
  onAttribute?: AttributeHandler | AttributeHandler[];
  trackers?: Tracker[];
  rules?: TrackingRule[];
  presets?: Preset[];
  spa?: boolean;
  defaults?: boolean;
  debug?: boolean;
  pageName?: (url: URL) => string;
}

export interface Tracker {
  name: string;
  init(core: TrackerContext): void;
  destroy(): void;
  onDOMMutation?(mutations: MutationRecord[]): void;
  onRouteChange?(url: string, prevUrl: string): void;
}

export interface TrackerContext {
  emit(event: string, props: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): void;
  getConfig(): DOMTrackerConfig;
  querySelectorAll(selector: string): Element[];
  onElementAdded(selector: string, callback: (el: Element) => void): () => void;
  onElementRemoved(selector: string, callback: (el: Element) => void): () => void;
  getPageName(): string;
}
```

- [ ] **Step 2: Write a compile-time test**

`src/__tests__/core/types.test.ts`:
```typescript
import type { DOMTrackerConfig } from '../../core/types';

describe('core types', () => {
  it('should allow valid DOMTrackerConfig with single handler', () => {
    const config: DOMTrackerConfig = {
      onEvent: (_event: string, _props: Record<string, unknown>) => {},
    };
    expect(config.onEvent).toBeDefined();
  });

  it('should allow valid DOMTrackerConfig with array of handlers', () => {
    const config: DOMTrackerConfig = {
      onEvent: [
        (_event: string, _props: Record<string, unknown>) => {},
        (_event: string, _props: Record<string, unknown>) => {},
      ],
    };
    expect(Array.isArray(config.onEvent)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test**

```bash
cd ../dom-tracker && npx jest src/__tests__/core/types.test.ts --verbose
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/__tests__/core/types.test.ts
git commit -m "feat: add core type definitions"
```

---

## Task 3: Utils — debug, cookies, dom

**Files:**
- Create: `src/utils/debug.ts`, `src/utils/cookies.ts`, `src/utils/dom.ts`
- Test: `src/__tests__/utils/debug.test.ts`, `src/__tests__/utils/cookies.test.ts`, `src/__tests__/utils/dom.test.ts`

Tests and implementations for each utility are straightforward. See spec for behaviors:
- `debugLog(debug, ...args)` — conditional console.log with `[DOMTracker]` prefix
- Cookie utils: `getCookie`, `setCookie`, `deleteCookie`, `generateId`, `isLocalStorageAvailable`, `isSessionStorageAvailable`
- DOM utils: `getPageName(url)` — last path segment or 'homepage'; `parseDataAttributes(el)` — extracts `data-abs-*` props with kebab→snake conversion and type coercion

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-4: debug utility** (test → fail → implement → pass)
- [ ] **Step 5-8: cookie utility** (test → fail → implement → pass)
- [ ] **Step 9-12: dom utility** (test → fail → implement → pass)
- [ ] **Step 13: Commit**

```bash
git add src/utils/ src/__tests__/utils/
git commit -m "feat: add debug, cookie, and dom utilities"
```

---

## Task 4: ElementScanner

**Files:**
- Create: `src/core/ElementScanner.ts`
- Test: `src/__tests__/core/ElementScanner.test.ts`

Delegated click listener on `document` that catches clicks on `[data-abs-track]` elements. Uses `closest()` to bubble up from click target. Calls `parseDataAttributes()` to extract props, adds `page_name`.

Key test cases:
- Emits event on click of annotated element
- Works via delegation (element added after scan)
- Ignores elements without `data-abs-track`
- Stops emitting after destroy

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/core/ElementScanner.ts src/__tests__/core/ElementScanner.test.ts
git commit -m "feat: add ElementScanner with delegated click tracking"
```

---

## Task 5: RuleEngine

**Files:**
- Create: `src/core/RuleEngine.ts`
- Test: `src/__tests__/core/RuleEngine.test.ts`

Binds event listeners to elements matching CSS selectors from `TrackingRule[]`. Supports custom DOM events via `on` property. Skips elements with `data-abs-track` (data-attrs take priority). Catches invalid selectors. Supports `addRule()` and `rebind()`.

Key test cases:
- Binds click to matching elements
- Supports custom events (focus, etc.)
- Skips invalid selectors without throwing
- Doesn't fire after destroy
- Skips elements with data-abs-track

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/core/RuleEngine.ts src/__tests__/core/RuleEngine.test.ts
git commit -m "feat: add RuleEngine for selector-based tracking rules"
```

---

## Task 6: SPAObserver

**Files:**
- Create: `src/core/SPAObserver.ts`
- Test: `src/__tests__/core/SPAObserver.test.ts`

Monkey-patches `history.pushState`/`replaceState`, listens for `popstate`/`hashchange`. Manages MutationObserver on `document.body`. Provides `onElementAdded`/`onElementRemoved` subscriptions with unsubscribe functions. Restores everything on destroy.

Key test cases:
- Detects pushState/replaceState route changes
- Restores originals on destroy
- onElementAdded fires for existing elements immediately
- onElementAdded fires for dynamically added elements
- Unsubscribe function works

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/core/SPAObserver.ts src/__tests__/core/SPAObserver.test.ts
git commit -m "feat: add SPAObserver with MutationObserver and history patching"
```

---

## Task 7: DOMTracker Core

**Files:**
- Create: `src/core/DOMTracker.ts`
- Test: `src/__tests__/core/DOMTracker.test.ts`

Orchestrates ElementScanner, RuleEngine, SPAObserver, and all registered trackers. Provides TrackerContext to trackers. Handles error isolation (handler throws, tracker init/destroy throws). SSR guard. Idempotent destroy.

Key test cases:
- Emits events via onEvent
- Sets attributes via onAttribute
- Multiple handlers all called
- Handler errors caught, remaining handlers continue
- Throws on duplicate tracker name
- addTracker() post-construction initializes tracker with TrackerContext
- removeTracker calls destroy, no-ops on missing
- Tracker destroy() error caught, other trackers still destroyed
- Idempotent destroy
- Custom pageName function
- Tracker init errors caught, other trackers continue
- addRule() delegates to RuleEngine and rebinds
- SSR guard: no-ops when `typeof window === 'undefined'`
- onElementAdded one-time scan when spa: false
- onElementAdded ongoing monitoring when spa: true

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/core/DOMTracker.ts src/__tests__/core/DOMTracker.test.ts
git commit -m "feat: add DOMTracker core with lifecycle, event dispatch, and tracker management"
```

---

## Task 8: Page Views Tracker

**Files:**
- Create: `src/trackers/page-views.ts`
- Test: `src/__tests__/trackers/page-views.test.ts`

Factory function returning `Tracker`. Emits `page_view` with `{ page_name, page_path, page_url, referrer }` on init and on `onRouteChange`.

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/trackers/page-views.ts src/__tests__/trackers/page-views.test.ts
git commit -m "feat: add page views tracker"
```

---

## Task 9: Scroll Depth Tracker

**Files:**
- Create: `src/trackers/scroll.ts`
- Test: `src/__tests__/trackers/scroll.test.ts`

Throttled scroll listener (200ms). Calculates `(scrollY + innerHeight) / scrollHeight * 100`. Fires `scroll_depth` once per threshold. Resets on route change.

Key test cases:
- Fires at crossed thresholds
- Each threshold fires only once
- Custom thresholds accepted
- Resets on route change
- Removes listener on destroy

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/trackers/scroll.ts src/__tests__/trackers/scroll.test.ts
git commit -m "feat: add scroll depth tracker with configurable thresholds"
```

---

## Task 10: Time on Page Tracker

**Files:**
- Create: `src/trackers/time.ts`
- Test: `src/__tests__/trackers/time.test.ts`

1-second interval timer. Pauses on `visibilitychange` (tab hidden). Fires `time_on_page` at each threshold. Optional `tab_hidden`/`tab_visible` events. Resets on route change.

Key test cases (use `jest.useFakeTimers()`):
- Fires at each threshold
- Pauses when tab hidden, resumes when visible
- Visibility events opt-in
- Resets on route change
- Cleans up interval on destroy

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/trackers/time.ts src/__tests__/trackers/time.test.ts
git commit -m "feat: add time on page tracker with visibility pause"
```

---

## Task 11: Form Tracker

**Files:**
- Create: `src/trackers/forms.ts`
- Test: `src/__tests__/trackers/forms.test.ts`

Delegated `focusin` on document for form start detection. Delegated `submit` for form submit. form_id derivation: `data-abs-form-id` > `id` > `name` > auto-generated. Optional abandonment via inactivity timeout. Fires abandonment on route change for started-but-not-submitted forms.

Key test cases:
- Emits form_started on first input focus
- form_started fires only once per form
- Emits form_submitted on submit
- form_id from data-abs-form-id takes priority
- Abandonment fires after timeout
- Abandonment fires on route change for started-but-not-submitted forms
- No abandonment if form submitted
- Cleanup timers on destroy

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/trackers/forms.ts src/__tests__/trackers/forms.test.ts
git commit -m "feat: add form tracker with start, submit, and abandonment detection"
```

---

## Task 12: Session Tracker

**Files:**
- Create: `src/trackers/session.ts`
- Test: `src/__tests__/trackers/session.test.ts`

Manages session cookie (`_abs_session`, 30min TTL) and visitor cookie (`_abs_visitor`, 1yr). Falls back to sessionStorage/localStorage if cookies blocked. Emits `session_start` for new sessions. Sets attributes: `returning_visitor`, `traffic_source`, `device`, UTM params. Reuses existing session (no event, just refreshes TTL).

Key test cases (mock cookie utils):
- Emits session_start for new sessions
- Detects returning visitors
- Extracts UTM params
- Sets session cookie
- Reuses existing session (no event)
- Falls back to sessionStorage when cookies blocked
- Falls back to localStorage for visitor when cookies blocked

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/trackers/session.ts src/__tests__/trackers/session.test.ts
git commit -m "feat: add session tracker with cookies, UTM extraction, and visitor detection"
```

---

## Task 13: Presets

**Files:**
- Create: `src/presets/index.ts`, `src/presets/hubspot.ts`
- Test: `src/__tests__/presets/hubspot.test.ts`

`definePreset()` — typed identity function (returns the same preset object). `hubspotForms()` — returns Preset with rules for `.hs-input` and a tracker that binds to `form.hs-form` elements via `onElementAdded`.

Key test cases:
- `definePreset()` returns the same object (identity function)
- `hubspotForms()` returns preset with tracker named 'hubspot-forms'
- Preset includes rules targeting `.hs-input`

TDD: write tests first, verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write definePreset + hubspotForms tests, verify fail**
- [ ] **Step 3-4: Implement, verify pass**
- [ ] **Step 5: Commit**

```bash
git add src/presets/ src/__tests__/presets/
git commit -m "feat: add preset system with HubSpot forms preset"
```

---

## Task 14: Main Index & Default Trackers

**Files:**
- Create: `src/index.ts`
- Modify: `src/core/DOMTracker.ts` (wire default trackers when `defaults !== false`)

Wire the default trackers (pageViews, formTracker, sessionTracker) in DOMTracker constructor when `defaults !== false`. Create main index with all public exports.

- [ ] **Step 1: Create index.ts**
- [ ] **Step 2: Wire defaults in DOMTracker**
- [ ] **Step 3: Run all tests**

```bash
npx jest --verbose
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/core/DOMTracker.ts
git commit -m "feat: add public exports and wire default trackers"
```

---

## Task 15: Webpack Build Configuration

**Files:**
- Create: `../dom-tracker/webpack.config.js`

Two build variants: `dom-tracker.min.js` (default) and `dom-tracker.full.min.js` (all trackers + presets). UMD format.

- [ ] **Step 1: Create webpack config**
- [ ] **Step 2: Test build**

```bash
cd ../dom-tracker && npx webpack --mode production --env BUILD_TYPE=all
```

- [ ] **Step 3: Verify bundles exist**

```bash
ls -la ../dom-tracker/dist/
```

- [ ] **Step 4: Commit**

```bash
git add webpack.config.js
git commit -m "feat: add webpack build configuration"
```

---

## Task 16: ABsmartly Integration (sdk-plugins repo)

**Files:**
- Create: `src/analytics/types.ts`, `src/analytics/AnalyticsPlugin.ts`, `src/analytics/index.ts`
- Modify: `src/utils/plugin-registry.ts` (add `analytics` key)
- Modify: `src/index.ts` (add analytics exports)
- Test: `src/analytics/__tests__/AnalyticsPlugin.test.ts`

This task is in the `sdk-plugins` repo. Mock `@absmartly/dom-tracker` in tests.

**Dependency setup:** Since `@absmartly/dom-tracker` is a sibling repo not yet published, use `npm link`:
```bash
cd ../dom-tracker && npm link
cd ../absmartly-sdk-plugins && npm link @absmartly/dom-tracker
```

**AnalyticsPlugin:**
- Extends `Omit<DOMTrackerConfig, 'onEvent'>` with required `context` and optional `onEvent`
- Prepends `context.track()` to onEvent array, `context.attributes()` to onAttribute array
- Creates DOMTracker internally
- Registers in `context.__plugins.analytics` and global plugin registry
- destroy() cleans up tracker and unregisters

**Plugin registry change:** Add `analytics` key to `PluginRegistry` interface in `src/utils/plugin-registry.ts`:
```typescript
// Add to the existing interface:
analytics?: PluginRegistryEntry;
```

TDD: write tests first (with jest.mock for dom-tracker), verify fail, implement, verify pass, commit.

- [ ] **Step 1-2: Write tests, verify fail**
- [ ] **Step 3: Implement analytics/types.ts**
- [ ] **Step 4: Implement analytics/AnalyticsPlugin.ts**
- [ ] **Step 5: Create analytics/index.ts**
- [ ] **Step 6: Add `analytics` key to PluginRegistry interface in `src/utils/plugin-registry.ts`**
- [ ] **Step 7: Add analytics exports to `src/index.ts`**
- [ ] **Step 8-9: Run tests, verify pass**
- [ ] **Step 10: Commit**

```bash
git add src/analytics/ src/utils/plugin-registry.ts src/index.ts
git commit -m "feat: add AnalyticsPlugin wrapper for ABsmartly context integration"
```

---

## Task 17: Full Integration Test

**Files:**
- Test: `src/__tests__/integration.test.ts` (in dom-tracker repo)

End-to-end tests combining DOMTracker with data-attributes, rules, defaults, and destroy.

- [ ] **Step 1: Write integration tests**
- [ ] **Step 2: Run and verify pass**

```bash
cd ../dom-tracker && npx jest src/__tests__/integration.test.ts --verbose
```

- [ ] **Step 3: Run full suite with coverage**

```bash
npx jest --coverage
```

Expected: All PASS, >= 70% coverage.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add end-to-end integration tests"
```

---

## Task 18: Final Build Verification

- [ ] **Step 1: Full build of dom-tracker**

```bash
cd ../dom-tracker && npm run build
```

Expected: No errors. Outputs in `lib/`, `es/`, `dist/`, `types/`.

- [ ] **Step 2: Verify TypeScript declarations**

```bash
ls types/core/types.d.ts types/index.d.ts
```

- [ ] **Step 3: Verify bundle sizes**

```bash
ls -lh dist/
```

Expected: `dom-tracker.min.js` under 20KB.

- [ ] **Step 4: Full build of sdk-plugins**

```bash
cd /Users/joalves/git_tree/absmartly-sdk-plugins && npm run build
```

Expected: No errors.

- [ ] **Step 5: Run all sdk-plugins tests**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 6: Tag release**

```bash
cd ../dom-tracker && git tag v0.1.0
```
