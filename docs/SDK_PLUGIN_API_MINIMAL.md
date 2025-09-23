# ABsmartly SDK Minimal Plugin API Proposal

## Design Principles

1. **Zero overhead when no plugins are used**
2. **Minimal bundle size increase**
3. **Tree-shakeable plugin system**
4. **No unnecessary abstractions**
5. **Performance-first approach**

## Proposed Minimal API

### 1. Simple Plugin Interface

```typescript
// In SDK: src/types.ts (existing file)
export interface Plugin {
  name: string;
  ready(context: Context): void | Promise<void>;
  destroy?(): void;
}
```

That's it. No complex lifecycle, no capabilities, no versions.

### 2. Minimal Context Changes

Add only these lightweight additions to Context:

```typescript
// In SDK: src/context.ts
export class Context {
  private _plugins?: Map<string, Plugin>;  // Lazy-initialized
  private _pluginPromises?: Map<string, Promise<void>>; // Track readiness

  /**
   * Register a plugin - lightweight, no validation
   */
  use(plugin: Plugin): this {
    if (!this._plugins) {
      this._plugins = new Map();
      this._pluginPromises = new Map();
    }
    this._plugins.set(plugin.name, plugin);

    // Initialize plugin asynchronously - doesn't block SDK
    const promise = Promise.resolve(plugin.ready(this)).catch(err => {
      console.error(`[ABsmartly] Plugin ${plugin.name} failed to initialize:`, err);
    });
    this._pluginPromises!.set(plugin.name, promise);

    return this;
  }

  /**
   * Get a plugin if you need direct access
   */
  plugin<T = Plugin>(name: string): T | undefined {
    return this._plugins?.get(name) as T;
  }

  /**
   * Check if a specific plugin is ready (non-blocking)
   */
  pluginReady(name: string): Promise<void> | undefined {
    return this._pluginPromises?.get(name);
  }

  /**
   * Wait for all plugins to be ready (optional - only if needed)
   */
  async pluginsReady(): Promise<void> {
    if (this._pluginPromises) {
      await Promise.all(this._pluginPromises.values());
    }
  }

  // NO CHANGES to ready() method - SDK remains fast
  async ready(): Promise<void> {
    // ... existing ready logic ...
    // Plugins initialize in parallel, don't block SDK
    return result;
  }

  // Modified finalize() - only addition to existing method
  async finalize(): Promise<void> {
    // Cleanup plugins if any exist
    if (this._plugins) {
      for (const plugin of this._plugins.values()) {
        try {
          plugin.destroy?.();
        } catch (err) {
          console.error(`[ABsmartly] Plugin ${plugin.name} cleanup error:`, err);
        }
      }
      this._plugins.clear();
      this._pluginPromises?.clear();
    }

    // ... existing finalize logic ...
  }
}
```

### 3. Plugin Implementation

Plugins are just objects with a name and ready method:

```typescript
// DOMChangesPlugin - minimal version
export class DOMChangesPlugin {
  name = 'dom';

  private context: Context;
  private config: any;

  constructor(config?: any) {
    this.config = config || {};
  }

  ready(context: Context): void {
    this.context = context;

    // Only initialize if there are experiments with DOM changes
    const data = context.data();
    if (data?.experiments?.some(exp => this.hasChanges(exp))) {
      this.initialize();
    }
  }

  private initialize(): void {
    // Lazy load the actual implementation
    import('./DOMChangesCore').then(({ DOMChangesCore }) => {
      new DOMChangesCore(this.context, this.config).apply();
    });
  }

  destroy(): void {
    // Cleanup if needed
  }
}
```

### 4. Usage - Non-Blocking & Fast

```typescript
import { SDK } from '@absmartly/javascript-sdk';

const sdk = new SDK({
  endpoint: 'https://your-endpoint.absmartly.io/v1',
  apiKey: 'YOUR_API_KEY'
});

// Without plugins - zero overhead
const context = sdk.createContext(request);
await context.ready(); // SDK ready immediately

// With plugins - SDK still ready immediately
const context = sdk.createContext(request)
  .use(new DOMChangesPlugin({ autoApply: true }))
  .use(new OverridesPlugin());

// SDK is ready immediately - doesn't wait for plugins
await context.ready();

// Plugins initialize in parallel in the background
// You can check individual plugin readiness if needed:
await context.pluginReady('dom'); // Wait for specific plugin

// Or check if you need to (usually you don't):
const domPlugin = context.plugin<DOMChangesPlugin>('dom');
if (domPlugin) {
  await context.pluginReady('dom'); // Ensure it's ready before using
  domPlugin.applyChanges('specific-experiment');
}

// Most plugins just work automatically after initialization
// No need to wait for them explicitly
```

#### Real-World Example: Critical vs Non-Critical

```typescript
// Critical path: SDK ready immediately
const context = sdk.createContext(request)
  .use(new OverridesPlugin())  // Initializes in background
  .use(new DOMChangesPlugin()); // Initializes in background

await context.ready(); // Returns immediately

// Start using SDK right away
const variant = context.treatment('hero-test');

// DOM changes will apply automatically when ready
// No need to block the critical path

// Only if you have specific timing needs:
if (needToWaitForDOM) {
  await context.pluginReady('dom');
}
```

### 5. Bundle Size Optimization Strategies

#### A. Lazy Loading Pattern

```typescript
// Plugin with lazy-loaded implementation
export class DOMChangesPlugin {
  name = 'dom';

  async ready(context: Context): Promise<void> {
    // Only load implementation if needed
    const hasChanges = context.data()?.experiments?.some(e =>
      e.variants?.some(v => v.config?.includes('dom_changes'))
    );

    if (hasChanges) {
      // Dynamic import - not included in initial bundle
      const { applyChanges } = await import('./dom-implementation');
      applyChanges(context);
    }
  }
}
```

#### B. Plugin Factory Pattern (Optional)

```typescript
// For sites that conditionally load plugins
export function createPlugins(config: any) {
  const plugins = [];

  // Only create plugins that are needed
  if (config.enableDomChanges) {
    plugins.push(new DOMChangesPlugin());
  }

  if (config.enableOverrides || location.search.includes('_exp_')) {
    plugins.push(new OverridesPlugin());
  }

  return plugins;
}

// Usage
const plugins = createPlugins({
  enableDomChanges: true,
  enableOverrides: process.env.NODE_ENV !== 'production'
});

const context = sdk.createContext(request);
plugins.forEach(p => context.use(p));
```

### 6. Why This Non-Blocking Approach Is Better for Production

1. **SDK Never Waits for Plugins**:
   - `context.ready()` returns immediately
   - Plugins initialize in parallel in background
   - Critical path is never blocked by plugins
   - Perfect for Core Web Vitals (LCP, FID)

2. **Minimal SDK Changes**:
   - Only ~40 lines of code added to SDK
   - No new files or complex abstractions
   - No dependency management overhead

3. **Zero Cost When Unused**:
   - `_plugins` Map is only created if plugins are used
   - No plugin code runs if no plugins registered
   - Tree-shaking removes unused plugin code

4. **Flexible Timing Control**:
   - Check individual plugin readiness: `pluginReady('name')`
   - Wait for all if needed: `pluginsReady()`
   - Most plugins just work without explicit waiting
   - Developers control what blocks and what doesn't

5. **Simple Mental Model**:
   - Plugin = object with name + ready method
   - Plugins initialize independently
   - SDK always fast, plugins never block

### 7. Size Impact Analysis

```typescript
// SDK additions: ~500 bytes minified
// - use() method: ~100 bytes
// - plugin() method: ~50 bytes
// - ready() modification: ~200 bytes
// - finalize() modification: ~150 bytes

// Plugin wrapper overhead: ~200 bytes per plugin
// Actual plugin logic: loaded on demand
```

### 8. Performance Considerations

```typescript
// Optimized plugin that does nothing if not needed
export class SmartPlugin {
  name = 'smart';

  ready(context: Context): void {
    // Quick check - bail early if not needed
    if (!this.shouldActivate(context)) {
      return; // No overhead
    }

    // Use requestIdleCallback for non-critical work
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.initialize(context));
    } else {
      setTimeout(() => this.initialize(context), 1);
    }
  }

  private shouldActivate(context: Context): boolean {
    // Fast check to see if plugin is needed
    return Boolean(context.data()?.experiments?.length);
  }
}
```

### 9. Alternative: Even More Minimal

If we want to be even more aggressive about bundle size:

```typescript
// Option 1: Just use a registration array
export class Context {
  private _onReady?: Array<(ctx: Context) => void | Promise<void>>;

  use(fn: (ctx: Context) => void | Promise<void>): this {
    (this._onReady ||= []).push(fn);
    return this;
  }

  async ready(): Promise<void> {
    // ... existing logic ...
    if (this._onReady) {
      await Promise.all(this._onReady.map(fn => fn(this)));
    }
  }
}

// Usage - plugins are just functions
context.use(async (ctx) => {
  const { DOMChanges } = await import('@absmartly/dom-plugin');
  DOMChanges.apply(ctx);
});
```

### 10. Recommendation

For production websites, I recommend:

1. **Use the minimal API** (sections 1-2) for the SDK
2. **Implement lazy loading** in performance-critical plugins
3. **Keep plugins as separate npm packages** to avoid bloating the core
4. **Use dynamic imports** for plugin implementations
5. **Consider the function-based approach** for ultimate minimalism

### 11. What We're NOT Including

- ❌ Plugin dependencies/ordering
- ❌ Plugin versioning
- ❌ Plugin capabilities/metadata
- ❌ Complex lifecycle hooks
- ❌ Plugin validation
- ❌ Event system
- ❌ Error handling (use try/catch in plugin)
- ❌ Plugin options validation

These can all be handled by the plugins themselves if needed, keeping the core SDK lean.

## Conclusion

This minimal approach adds < 1KB to the SDK while providing a clean plugin API. Plugins can be as simple or complex as needed, but the SDK remains lightweight and production-ready. The key is pushing complexity to the plugins themselves and using lazy loading for heavy implementations.