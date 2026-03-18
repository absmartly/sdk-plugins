# @absmartly/dom-tracker — Design Spec

## Overview

A standalone, vendor-agnostic DOM analytics tracking library that uses HTML data-attributes and CSS selector rules to automatically track user behavior, funnels, and conversion metrics. Ships as `@absmartly/dom-tracker` in its own repository. The existing `@absmartly/sdk-plugins` repo adds it as a dependency and provides a thin `AnalyticsPlugin` wrapper that wires events to `context.track()` and attributes to `context.attributes()`.

## Architecture

**Approach: Modular tracker system.**

A lightweight core (`DOMTracker`) manages lifecycle, DOM observation, and event dispatching. Individual trackers (scroll, time, forms, clicks, sessions) are separate tree-shakeable modules that register with the core.

```
@absmartly/dom-tracker (standalone repo)
  Core: data-attributes, selector rules, auto-tracking
  onEvent is the ONLY way events leave the plugin

@absmartly/sdk-plugins (this repo)
  Depends on @absmartly/dom-tracker
  Thin AnalyticsPlugin wires onEvent -> context.track()
  Sets context.attributes() for segment data
```

## Core API

### DOMTracker

```typescript
interface DOMTrackerConfig {
  onEvent: EventHandler | EventHandler[];
  onAttribute?: AttributeHandler | AttributeHandler[];
  trackers?: Tracker[];
  rules?: TrackingRule[];
  presets?: Preset[];
  spa?: boolean;          // default false
  defaults?: boolean;     // default true
  debug?: boolean;        // default false
  pageName?: (url: URL) => string;  // custom page_name derivation
}

type EventHandler = (event: string, props: Record<string, unknown>) => void;
type AttributeHandler = (attrs: Record<string, unknown>) => void;
```

- `onEvent` — required, the only way events leave the plugin
- `onAttribute` — optional, for identity/segment data
- `trackers` — merged with defaults unless `defaults: false`
- `rules` — CSS selector-based tracking rules
- `presets` — bundled rule+tracker sets for third-party integrations
- `spa` — enables MutationObserver and route change detection
- `defaults` — when false, only explicitly provided trackers are used
- `debug` — when true, logs all emitted events and tracker lifecycle to console via a `debugLog()` utility (same pattern as sdk-plugins)

### DOMTracker Public Methods

```typescript
class DOMTracker {
  constructor(config: DOMTrackerConfig);
  destroy(): void;          // removes all listeners, disconnects observers, calls destroy() on all trackers
  addTracker(tracker: Tracker): void;   // register a tracker; throws if name already registered
  removeTracker(name: string): void;    // unregister and destroy a tracker by name; no-op if not found
  addRule(rule: TrackingRule): void;     // add a selector rule after construction
}
```

- Construction is synchronous. The tracker starts immediately — scans DOM, binds listeners, initializes trackers.
- `destroy()` is idempotent. Cleans up all listeners, MutationObservers, timers, and calls `destroy()` on each tracker.
- SSR safety: constructor guards with `typeof window === 'undefined'` and no-ops in server environments.

### Error Handling

- If an `onEvent` or `onAttribute` handler throws, the error is caught and logged in debug mode. Remaining handlers in the array are still called.
- If a tracker's `init()` throws, the error is caught and logged. Other trackers continue to initialize.
- If a tracker's `destroy()` throws, the error is caught and logged. Other trackers continue to be destroyed.
- Invalid CSS selectors in `TrackingRule` are caught at bind time, logged in debug mode, and silently skipped.
- Analytics code must never break the host page.

### Tracker Interface

```typescript
interface Tracker {
  name: string;
  init(core: TrackerContext): void;
  destroy(): void;
  onDOMMutation?(mutations: MutationRecord[]): void;
  onRouteChange?(url: string, prevUrl: string): void;
}

interface TrackerContext {
  emit(event: string, props: Record<string, unknown>): void;
  setAttributes(attrs: Record<string, unknown>): void;
  getConfig(): DOMTrackerConfig;
  querySelectorAll(selector: string): Element[];
  onElementAdded(selector: string, callback: (el: Element) => void): () => void;   // returns unsubscribe fn
  onElementRemoved(selector: string, callback: (el: Element) => void): () => void; // returns unsubscribe fn
}
```

Trackers interact with the core exclusively through `TrackerContext`. They never access `onEvent`/`onAttribute` directly.

- `onElementAdded`/`onElementRemoved` return unsubscribe functions. All subscriptions are automatically cleaned up when the tracker's `destroy()` is called.
- When `spa: false`, `onElementAdded` does an immediate one-time scan of existing elements matching the selector and calls the callback for each. `onElementRemoved` is a no-op. No ongoing observation occurs.
- When `spa: true`, both functions set up ongoing MutationObserver-based monitoring in addition to the initial scan.

### Tracking Rules

```typescript
interface TrackingRule {
  selector: string;
  event: string;
  on?: string;              // DOM event, default 'click'
  props?: Record<string, unknown>;
}
```

Rules target elements that can't be annotated with data-attributes (e.g., HubSpot injected forms). Re-evaluated on DOM mutations in SPA mode. Data-attributes take priority over rules when both match an element.

### Presets

```typescript
interface Preset {
  rules: TrackingRule[];
  tracker?: Tracker;
}
```

Separate imports, tree-shakeable. Users can author their own via `definePreset()` — a typed identity function that validates the shape and provides autocomplete. Signature: `definePreset(preset: Preset): Preset`.

## Data Attributes

Elements annotated with `data-abs-*` attributes are auto-tracked by the core.

```html
<a href="/get-demo"
   data-abs-track="cta_clicked"
   data-abs-cta-type="demo"
   data-abs-cta-location="hero"
   data-abs-high-intent="true">
  Request Demo
</a>
```

- `data-abs-track` — required, defines event name
- `data-abs-*` — all other `data-abs-` attributes become event properties
- Kebab-case to snake_case conversion: `data-abs-cta-type` -> `cta_type`
- Type coercion: `"true"`/`"false"` -> boolean, numeric strings -> number
- Click listeners delegated to `document` for dynamic element support

## Built-in Trackers

### Page Views (default: on)

```typescript
import { pageViews } from '@absmartly/dom-tracker/trackers/page-views';
pageViews()
```

Fires `page_view` on initialization and route change (SPA):
```
{ page_name, page_path, page_url, referrer }
```

### Scroll Depth (default: off)

```typescript
import { scrollDepth } from '@absmartly/dom-tracker/trackers/scroll';
scrollDepth({ thresholds: [25, 50, 75, 100] })  // default thresholds
```

Fires `scroll_depth` once per threshold per page:
```
{ depth: 25, page_name }
```

Resets on route change. Uses a throttled scroll event listener (200ms) that calculates `scrollY + innerHeight` against `document.documentElement.scrollHeight` to determine scroll percentage.

### Time on Page (default: off)

```typescript
import { timeOnPage } from '@absmartly/dom-tracker/trackers/time';
timeOnPage({ thresholds: [10, 30, 60, 180] })  // default thresholds
```

Fires `time_on_page` at each threshold:
```
{ seconds: 30, page_name }
```

Pauses when tab hidden (visibilitychange API). Resets on route change.

Visibility events (opt-in):
```typescript
timeOnPage({ thresholds: [10, 30, 60, 180], visibility: { trackEvents: true } })
```
```
emit('tab_hidden', { page_name, time_on_page: 45 })
emit('tab_visible', { page_name, hidden_duration: 12 })
```

### Form Tracker (default: on)

```typescript
import { formTracker } from '@absmartly/dom-tracker/trackers/forms';
formTracker()
```

Tracks native `<form>` elements:
- `form_started` — first focus on an input within the form
- `form_submitted` — submit event on the form

```
{ form_id, form_action, page_name }
```

`form_id` is derived in order of priority: `form.getAttribute('data-abs-form-id')` → `form.id` → `form.name` → auto-generated from form action + field count.

Abandonment (opt-in):
```typescript
formTracker({ abandonment: { timeout: 30 } })
```
```
emit('form_abandoned', { form_id, fields_completed: 2, last_field: 'email', page_name })
```

Triggered by inactivity timeout or page unload/route change after `form_started` without `form_submitted`.

### Session Tracker (default: on)

```typescript
import { sessionTracker } from '@absmartly/dom-tracker/trackers/session';
sessionTracker()
```

On session start:
```
emit('session_start', { session_id, landing_page, referrer })

setAttributes({
  returning_visitor: true,
  traffic_source: 'google',
  utm_campaign: 'spring_launch',
  utm_medium: 'cpc',
  device: 'mobile',
})
```

Session tracker configuration:

```typescript
interface SessionTrackerConfig {
  sessionTTL?: number;          // session timeout in minutes, default 30
  cookieName?: string;          // default '_abs_session'
  visitorCookieName?: string;   // default '_abs_visitor'
  cookieDomain?: string;        // default: current domain
  cookiePath?: string;          // default '/'
  cookieSameSite?: string;      // default 'Lax'
  cookieSecure?: boolean;       // default: true if HTTPS
}
```

- Session ID generated via timestamp + random string (same pattern as sdk-plugins `generateUniqueId()`).
- Session cookie (`_abs_session`) expires after TTL of inactivity. Visitor cookie (`_abs_visitor`) is persistent (1 year).
- Cookie fallback: if cookies are blocked (Safari ITP, privacy browsers), falls back to sessionStorage for session and localStorage for visitor. If both blocked, attributes still fire per-pageload but `returning_visitor` will always be false.

## Default Configuration

Zero-config includes: pageViews, formTracker, sessionTracker, and core data-attribute click tracking.

```typescript
// Zero config
new DOMTracker({ onEvent: ... });

// Equivalent to:
new DOMTracker({
  onEvent: ...,
  trackers: [pageViews(), formTracker(), sessionTracker()],
});
```

Adding trackers merges with defaults:
```typescript
new DOMTracker({
  onEvent: ...,
  trackers: [scrollDepth(), timeOnPage()],
  // defaults still included
});
```

Disable defaults for full control:
```typescript
new DOMTracker({
  onEvent: ...,
  trackers: [scrollDepth()],
  defaults: false,
});
```

## SPA Support

Opt-in via `spa: true`. Enables:
- MutationObserver for detecting new/removed trackable elements
- Route change detection via `popstate` + `pushState`/`replaceState` monkey-patching + `hashchange` for hash-based routing
- Notifies trackers via `onDOMMutation()` and `onRouteChange()` hooks
- Re-evaluates selector rules on DOM changes
- Resets scroll depth and time-on-page trackers on route change

Route change detection: monkey-patches `history.pushState` and `history.replaceState` to dispatch a custom `_abs_routechange` event, then listens for that event plus native `popstate` and `hashchange`. The monkey-patch stores and calls the original function, so other patches (SPA frameworks, analytics libraries) are preserved. All patches are restored on `destroy()`.

Dynamic form detection (forms added after page load) requires `spa: true`. Without SPA mode, only forms present in the DOM at initialization are tracked.

Running two MutationObservers (this + DOMChangesPluginLite) on the same page is acceptable — MutationObserver is designed for multiple simultaneous observers and the performance cost is negligible since both use `childList + subtree` on `document.body` with lightweight callbacks.

## Presets

Separate imports for third-party integrations.

### HubSpot Forms (v1)

```typescript
import { hubspotForms } from '@absmartly/dom-tracker/presets/hubspot';

new DOMTracker({
  onEvent: ...,
  presets: [hubspotForms()],
});
```

- Listens for `hsFormsOnReady` to detect form injection
- Binds focus on `.hs-input` -> `form_started`
- Binds submit on HubSpot form -> `form_submitted`
- Optional abandonment: `hubspotForms({ abandonment: { timeout: 30 } })`

### Custom Presets

```typescript
import { definePreset } from '@absmartly/dom-tracker/presets';

const intercomPreset = definePreset({
  rules: [
    { selector: '#intercom-launcher', event: 'chat_opened', on: 'click' },
  ],
});
```

## ABsmartly Integration (sdk-plugins repo)

Thin wrapper that prepends `context.track()` and `context.attributes()` to callback arrays.

```typescript
interface AnalyticsPluginConfig extends Omit<DOMTrackerConfig, 'onEvent'> {
  context: ABsmartlyContext;
  onEvent?: EventHandler | EventHandler[];  // optional here, context.track() always added
}
```

```typescript
import { AnalyticsPlugin } from '@absmartly/sdk-plugins/analytics';

new AnalyticsPlugin({
  context,
  onEvent: (event, props) => zaraz.track(event, props),
  trackers: [scrollDepth()],
  presets: [hubspotForms()],
  spa: true,
});
```

The wrapper:
- Creates a `DOMTracker` internally with `context.track()` prepended to the `onEvent` array and `context.attributes()` prepended to the `onAttribute` array.
- `onEvent` is optional in the wrapper (unlike standalone `DOMTracker`) since `context.track()` is always present.
- Follows the existing plugin lifecycle: readyPromise (waits for `context.ready()`), initialize, destroy.
- Registers with `context.__plugins.analytics` and `window.__ABSMARTLY_PLUGINS__` via `registerPlugin()`.
- `destroy()` calls `tracker.destroy()` and unregisters from plugin registry.
- Requires extending `PluginRegistry` interface in `src/utils/plugin-registry.ts` to add an `analytics` key.

### `page_name` derivation

All events that include `page_name` derive it from the URL pathname: last segment, cleaned up (e.g., `/pricing/enterprise` → `enterprise`, `/` → `homepage`). Configurable via `pageName` option:

```typescript
new DOMTracker({
  onEvent: ...,
  pageName: (url: URL) => url.pathname.split('/').filter(Boolean).pop() || 'homepage',
})
```

## Project Structure

```
src/
  core/
    DOMTracker.ts
    ElementScanner.ts
    RuleEngine.ts
    SPAObserver.ts
    types.ts
  trackers/
    page-views.ts
    scroll.ts
    time.ts
    forms.ts
    session.ts
  presets/
    index.ts
    hubspot.ts
  utils/
    dom.ts
    cookies.ts
    debug.ts
  index.ts
```

## Build

Same approach as sdk-plugins:
- `/lib` — CommonJS
- `/es` — ES modules
- `/dist` — UMD bundles
- `/types` — TypeScript declarations

Package exports for each tracker and preset. No runtime dependencies.

UMD bundle variants:
- `dom-tracker.min.js` — core + default trackers
- `dom-tracker.full.min.js` — all trackers and presets

Testing: Jest + ts-jest + jsdom. Each tracker gets its own test file.
