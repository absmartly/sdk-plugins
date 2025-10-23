# Optimized SDK & Plugins Loading Guide

This guide demonstrates best practices for loading the ABsmartly SDK and plugins in an optimized way to minimize impact on page performance.

## Table of Contents

- [Overview](#overview)
- [Key Optimization Strategies](#key-optimization-strategies)
- [Complete Example](#complete-example)
- [Entry Points](#entry-points)
- [Performance Monitoring](#performance-monitoring)
- [Best Practices](#best-practices)

## Overview

The ABsmartly SDK and plugins are designed to be loaded asynchronously with minimal performance impact. The key is to:

1. **Load plugins in parallel** where possible
2. **Start background tasks before context.ready()** when safe
3. **Use lazy loading** for non-critical plugins
4. **Leverage tree-shaking** with optimized entry points

## Key Optimization Strategies

### 1. Parallel Loading of WebVitals

**✨ OPTIMIZATION**: Start loading the WebVitals plugin BEFORE `context.ready()`. This allows the web-vitals library to load in parallel with SDK data fetching.

```typescript
import { SDK, Context } from '@absmartly/javascript-sdk';
import { DOMChangesPluginLite, CookiePlugin } from '@absmartly/sdk-plugins';

async function main() {
  // Initialize SDK
  const context = sdk.createContext({ units: { userId: '123' } });

  // ✨ Start loading WebVitals BEFORE context.ready()
  // context.track() can be called before context.ready()
  initializeWebVitalsLazy(context); // Don't await - runs in parallel

  // Wait for SDK data
  await context.ready();

  // Continue with DOM changes plugin...
}

async function initializeWebVitalsLazy(context: Context): Promise<void> {
  // Lazy load the plugin to avoid blocking main bundle
  const { WebVitalsPlugin } = await import('@absmartly/sdk-plugins');

  // ✨ Plugin constructor starts loading web-vitals library immediately
  const webVitalsPlugin = new WebVitalsPlugin({
    context: context as any,
    trackWebVitals: true,
    trackPageMetrics: true,
  });

  // ✨ initialize() starts tracking without waiting for context.ready()
  webVitalsPlugin.initialize();
}
```

**Why this works**: `context.track()` can be called before `context.ready()`. The SDK queues the events and sends them once ready.

### 2. Using Optimized Entry Points

The package provides optimized entry points that include only the code you need.

**Why entry points instead of relying on tree-shaking?**

While modern bundlers support tree-shaking, entry points provide **guaranteed** minimal bundles because:

1. **Import Side Effects**: When you import from the main entry point, top-level code from ALL modules runs, even if you don't use the exports
2. **Transitive Dependencies**: The main `index.ts` imports ALL plugins, which pulls in their dependencies (e.g., `web-vitals` library ~15KB)
3. **Bundler Limitations**: Not all bundlers can perfectly tree-shake re-exports (`export * from './module'`), classes with static initializers, or dynamic imports

Entry points **guarantee** you only load what you need by only importing the required modules at the source level.

```typescript
// ❌ DON'T: Import everything (larger bundle)
import { DOMChangesPluginLite, CookiePlugin, WebVitalsPlugin } from '@absmartly/sdk-plugins';

// ✅ DO: Use specific entry points (smaller bundle, guaranteed tree-shaking)
import { DOMChangesPluginLite, CookiePlugin, getOverrides } from '@absmartly/sdk-plugins/dom-with-overrides-lite';
// or if you only need DOM changes
import { DOMChangesPluginLite } from '@absmartly/sdk-plugins/dom-only';
// or if you only need cookies
import { CookiePlugin } from '@absmartly/sdk-plugins/cookie-only';
```

Available entry points:
- `@absmartly/sdk-plugins/dom-only` - DOMChangesPluginLite only
- `@absmartly/sdk-plugins/cookie-only` - CookiePlugin only
- `@absmartly/sdk-plugins/vitals-only` - WebVitalsPlugin only
- `@absmartly/sdk-plugins/dom-with-overrides-lite` - DOMChangesPluginLite + CookiePlugin + OverridesPluginLite + utility functions
- `@absmartly/sdk-plugins` - All plugins (use when you need everything)

### 3. Background Task Execution

Defer non-critical tasks to run after the critical path:

```typescript
async function main() {
  // Critical path: Get SDK ready and apply DOM changes
  const context = await initializeSDK(userId);
  await context.ready();

  const domPlugin = new DOMChangesPluginLite({
    context,
    autoApply: true,
  });
  await domPlugin.initialize();

  // ✅ Defer non-critical tasks
  setTimeout(() => {
    Promise.all([
      cookiePlugin.updateExpiryTimestamp(),
      cookiePlugin.trackLanding(context),
      executeReadyCode(context),
    ]).catch(error => console.error('Background task error:', error));
  }, 0);
}
```

### 4. Lazy Loading with Dynamic Imports

For plugins that aren't needed immediately, use dynamic imports:

```typescript
// Load WebVitals plugin lazily
async function loadWebVitals(context: Context) {
  const { WebVitalsPlugin } = await import('@absmartly/sdk-plugins/vitals-only');
  const plugin = new WebVitalsPlugin({ context });
  plugin.initialize();
}

// Load Overrides plugin only when needed
async function loadOverrides(context: Context) {
  const { OverridesPluginLite } = await import('@absmartly/sdk-plugins/overrides-lite-only');
  const plugin = new OverridesPluginLite({ context });
  plugin.initialize();
}
```

## Complete Example

Here's a complete optimized loading example:

```typescript
import { SDK, Context } from '@absmartly/javascript-sdk';
import { DOMChangesPluginLite, CookiePlugin, getOverrides } from '@absmartly/sdk-plugins/dom-with-overrides-lite';

// Performance tracking
const perfMarks = {
  start: performance.now(),
  sdkReady: 0,
  domPluginInit: 0,
};

async function main(): Promise<void> {
  try {
    // 1. Initialize CookiePlugin for unit ID management
    const cookiePlugin = new CookiePlugin({
      debug: true,
      cookieDomain: '.example.com',
      cookiePath: '/',
      cookieExpiryDays: 730,
    });

    // 2. Get or generate unit ID
    let unitId = cookiePlugin.getUnitId();
    if (!unitId) {
      unitId = cookiePlugin.generateAndSetUnitId();
    }

    // 3. Get overrides BEFORE SDK init
    const searchParams = new URLSearchParams(location.search);
    const overrides = getOverrides('absmartly_overrides', '_exp_', searchParams);

    // 4. Initialize SDK
    const sdk = new SDK({
      endpoint: 'https://api.absmartly.io/v1',
      apiKey: 'YOUR_API_KEY',
      environment: 'production',
      application: 'website',
    });

    const contextConfig: any = { units: { userId: unitId } };
    if (Object.keys(overrides).length > 0) {
      contextConfig.overrides = overrides;
    }

    const context = sdk.createContext(contextConfig);
    context.attribute('user_agent', navigator.userAgent);

    // 5. ✨ Start loading WebVitals BEFORE context.ready()
    initializeWebVitalsLazy(context); // Don't await

    // 6. Wait for SDK data
    await context.ready();
    perfMarks.sdkReady = performance.now();

    // 7. Initialize DOM changes plugin
    const domPlugin = new DOMChangesPluginLite({
      context: context as any,
      autoApply: true,
      spa: true,
      visibilityTracking: true,
      debug: true,
    });

    await domPlugin.initialize();
    perfMarks.domPluginInit = performance.now();

    // 8. Log performance
    console.log('[ABsmartly] Total time to DOM ready:',
      (perfMarks.domPluginInit - perfMarks.start).toFixed(2) + 'ms');

    // 9. Background tasks
    setTimeout(() => {
      Promise.all([
        cookiePlugin.updateExpiryTimestamp(),
        cookiePlugin.trackLanding(context),
      ]).catch(console.error);
    }, 0);

  } catch (error) {
    console.error('ABsmartly initialization error:', error);
  }
}

// WebVitals lazy loading
async function initializeWebVitalsLazy(context: Context): Promise<void> {
  try {
    const { WebVitalsPlugin } = await import('@absmartly/sdk-plugins/vitals-only');

    const webVitalsPlugin = new WebVitalsPlugin({
      context: context as any,
      trackWebVitals: true,
      trackPageMetrics: true,
    });

    webVitalsPlugin.initialize();
  } catch (error) {
    console.error('Failed to initialize WebVitalsPlugin:', error);
  }
}

// Start
main();
```

## Entry Points

### DOM Only (`@absmartly/sdk-plugins/dom-only`)

**Size**: ~30KB minified
**Includes**: DOMChangesPluginLite only
**Use when**: You only need DOM changes (no cookies, no overrides)

```typescript
import { DOMChangesPluginLite } from '@absmartly/sdk-plugins/dom-only';
```

### Cookie Only (`@absmartly/sdk-plugins/cookie-only`)

**Size**: ~12KB minified
**Includes**: CookiePlugin only
**Use when**: You only need cookie/unit ID management

```typescript
import { CookiePlugin } from '@absmartly/sdk-plugins/cookie-only';
```

### Vitals Only (`@absmartly/sdk-plugins/vitals-only`)

**Size**: ~15KB minified
**Includes**: WebVitalsPlugin + web-vitals library
**Use when**: You only need performance monitoring

```typescript
import { WebVitalsPlugin } from '@absmartly/sdk-plugins/vitals-only';
```

### DOM with Overrides Lite (`@absmartly/sdk-plugins/dom-with-overrides-lite`)

**Size**: ~55KB minified
**Includes**: DOMChangesPluginLite, CookiePlugin, OverridesPluginLite, utility functions (getOverrides, getCookie, etc.)
**Use when**: You need DOM changes, cookies, and QA overrides (most common use case)

```typescript
import {
  DOMChangesPluginLite,
  CookiePlugin,
  OverridesPluginLite,
  getOverrides
} from '@absmartly/sdk-plugins/dom-with-overrides-lite';
```

### All Plugins (`@absmartly/sdk-plugins`)

**Size**: ~75KB minified
**Includes**: Everything
**Use when**: You need all features

```typescript
import {
  DOMChangesPluginLite,
  CookiePlugin,
  WebVitalsPlugin,
  OverridesPluginLite
} from '@absmartly/sdk-plugins';
```

## Performance Monitoring

Track SDK initialization performance:

```typescript
const perfMarks = {
  start: performance.now(),
  cookieCallEnd: 0,
  unitIdResolved: 0,
  sdkReady: 0,
  domPluginInit: 0,
};

function markPerf(name: keyof typeof perfMarks): void {
  perfMarks[name] = performance.now();
  const elapsed = (perfMarks[name] - perfMarks.start).toFixed(2);
  console.log(`[ABsmartly] ${name}: ${elapsed}ms`);
}

async function main() {
  markPerf('start');

  // ... initialize cookie plugin
  markPerf('unitIdResolved');

  // ... SDK initialization
  await context.ready();
  markPerf('sdkReady');

  // ... DOM plugin
  await domPlugin.initialize();
  markPerf('domPluginInit');

  // Summary
  const totalTime = perfMarks.domPluginInit - perfMarks.start;
  console.log(`Total time to DOM ready: ${totalTime.toFixed(2)}ms`);
}
```

## Best Practices

### ✅ DO

1. **Use specific entry points** to minimize bundle size
2. **Start WebVitals before context.ready()** for parallel loading
3. **Defer non-critical tasks** to after DOM plugin initialization
4. **Use lazy loading** for plugins not needed immediately
5. **Monitor performance** with timing marks
6. **Apply overrides before SDK init** for correct variant assignment

### ❌ DON'T

1. **Don't import everything** if you only need specific plugins
2. **Don't block on non-critical tasks** in the main flow
3. **Don't wait for WebVitals** before proceeding with DOM changes
4. **Don't skip error handling** for background tasks
5. **Don't forget to update cookie expiry** for long-lived sessions

## Performance Expectations

With optimized loading, you should see:

- **Cookie resolution**: 0-50ms (if cached) or 100-300ms (if calling worker)
- **SDK ready**: 150-500ms (depending on network and data size)
- **DOM plugin init**: 10-50ms
- **Total time to DOM ready**: 200-600ms

WebVitals plugin loading happens in parallel and doesn't block the critical path.

## Additional Resources

- [Plugin API Documentation](./API.md)
- [Entry Points Reference](./ENTRY_POINTS.md)
- [Performance Optimization Guide](./PERFORMANCE.md)
- [Examples Repository](../examples/)
