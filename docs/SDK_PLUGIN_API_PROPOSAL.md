# ABsmartly SDK Plugin Registration API Proposal

## Executive Summary

This document proposes a standardized plugin registration API for the ABsmartly JavaScript SDK to enable seamless integration of plugins like DOMChangesPlugin, OverridesPlugin, and future extensions.

## Current State

Currently, plugins manually register themselves by directly modifying the context object:
```typescript
context.__plugins = {
  domPlugin: { ... },
  overridesPlugin: { ... }
}
```

This approach has limitations:
- No validation or type safety
- No lifecycle management
- No plugin dependency resolution
- Direct manipulation of internal properties

## Proposed API

### 1. Plugin Interface

```typescript
// In SDK: src/plugin.ts
export interface ABsmartlyPlugin {
  name: string;
  version: string;

  // Lifecycle hooks
  install?(context: Context, options?: any): void | Promise<void>;
  ready?(context: Context): void | Promise<void>;
  destroy?(): void;

  // Optional metadata
  capabilities?: string[];
  dependencies?: string[]; // Other plugin names this depends on
}

export interface PluginRegistration {
  name: string;
  version: string;
  plugin: ABsmartlyPlugin;
  initialized: boolean;
  capabilities: string[];
  options?: any;
  timestamp: number;
}
```

### 2. Context Plugin API

Add these methods to the Context class:

```typescript
// In SDK: src/context.ts
export class Context {
  private plugins: Map<string, PluginRegistration> = new Map();
  private pluginInitPromises: Map<string, Promise<void>> = new Map();

  /**
   * Register a plugin with the context
   */
  use(plugin: ABsmartlyPlugin, options?: any): this {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[ABsmartly] Plugin ${plugin.name} is already registered`);
      return this;
    }

    const registration: PluginRegistration = {
      name: plugin.name,
      version: plugin.version,
      plugin,
      initialized: false,
      capabilities: plugin.capabilities || [],
      options,
      timestamp: Date.now()
    };

    this.plugins.set(plugin.name, registration);

    // Install phase (synchronous or async)
    if (plugin.install) {
      const installResult = plugin.install(this, options);
      if (installResult instanceof Promise) {
        this.pluginInitPromises.set(plugin.name, installResult.then(() => {
          registration.initialized = true;
        }));
      } else {
        registration.initialized = true;
      }
    }

    return this; // Enable chaining
  }

  /**
   * Get a registered plugin by name
   */
  getPlugin<T extends ABsmartlyPlugin>(name: string): T | undefined {
    const registration = this.plugins.get(name);
    return registration?.plugin as T;
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): ReadonlyMap<string, PluginRegistration> {
    return this.plugins;
  }

  /**
   * Wait for all plugins to be ready
   */
  async pluginsReady(): Promise<void> {
    const promises = Array.from(this.pluginInitPromises.values());
    await Promise.all(promises);

    // Call ready hooks
    for (const registration of this.plugins.values()) {
      if (registration.plugin.ready && !registration.initialized) {
        await registration.plugin.ready(this);
        registration.initialized = true;
      }
    }
  }

  /**
   * Unregister a plugin
   */
  removePlugin(name: string): boolean {
    const registration = this.plugins.get(name);
    if (!registration) return false;

    // Call destroy if available
    if (registration.plugin.destroy) {
      registration.plugin.destroy();
    }

    this.plugins.delete(name);
    this.pluginInitPromises.delete(name);
    return true;
  }

  // Override existing finalize to handle plugin cleanup
  async finalize(): Promise<void> {
    // Destroy all plugins
    for (const registration of this.plugins.values()) {
      if (registration.plugin.destroy) {
        try {
          registration.plugin.destroy();
        } catch (error) {
          console.error(`[ABsmartly] Error destroying plugin ${registration.name}:`, error);
        }
      }
    }

    this.plugins.clear();
    this.pluginInitPromises.clear();

    // Continue with existing finalize logic
    await super.finalize();
  }
}
```

### 3. Plugin Usage Examples

#### Basic Plugin Implementation

```typescript
// plugins/MyPlugin.ts
import { ABsmartlyPlugin, Context } from '@absmartly/javascript-sdk';

export class MyPlugin implements ABsmartlyPlugin {
  name = 'MyPlugin';
  version = '1.0.0';
  capabilities = ['feature-x', 'feature-y'];

  private context?: Context;

  async install(context: Context, options?: any): Promise<void> {
    this.context = context;
    // Perform initialization
    await this.initialize(options);
  }

  async ready(context: Context): Promise<void> {
    // Called when context is ready
    // Access experiment data, apply changes, etc.
  }

  destroy(): void {
    // Cleanup resources
    this.context = undefined;
  }

  // Plugin-specific public methods
  public doSomething(): void {
    // ...
  }
}
```

#### Using Plugins with SDK

```typescript
import { SDK, Context } from '@absmartly/javascript-sdk';
import { DOMChangesPlugin } from '@absmartly/sdk-plugins';
import { OverridesPlugin } from '@absmartly/sdk-plugins';

const sdk = new SDK({
  endpoint: 'https://your-endpoint.absmartly.io/v1',
  apiKey: 'YOUR_API_KEY',
  environment: 'production',
  application: 'your-app'
});

// Create context with plugins
const context = sdk.createContext(request)
  .use(new OverridesPlugin(), {
    cookieName: 'absmartly_overrides',
    useQueryString: true
  })
  .use(new DOMChangesPlugin(), {
    autoApply: true,
    spa: true
  });

// Wait for all plugins to be ready
await context.pluginsReady();

// Access plugin instance if needed
const domPlugin = context.getPlugin<DOMChangesPlugin>('DOMChangesPlugin');
domPlugin?.applyChanges('experiment-name');
```

### 4. Migration Path for Existing Plugins

Update existing plugins to implement the new interface:

```typescript
// Before: DOMChangesPlugin
export class DOMChangesPlugin {
  constructor(config: PluginConfig) {
    // Direct initialization
  }

  async initialize(): Promise<void> {
    // Manual registration
    this.config.context.__plugins = { domPlugin: {...} };
  }
}

// After: DOMChangesPlugin
export class DOMChangesPlugin implements ABsmartlyPlugin {
  name = 'DOMChangesPlugin';
  version = '1.0.0';
  capabilities = ['dom-manipulation', 'spa-support'];

  private config?: PluginConfig;

  async install(context: Context, options: PluginConfig): Promise<void> {
    this.config = { ...options, context };
    // Initialization logic
  }

  async ready(context: Context): Promise<void> {
    // Apply changes when context is ready
    if (this.config?.autoApply) {
      await this.applyChanges();
    }
  }

  destroy(): void {
    // Cleanup
    this.removeAllChanges();
  }
}
```

### 5. SDK Builder Pattern (Optional Enhancement)

For even better developer experience, add a builder pattern:

```typescript
// In SDK: src/contextBuilder.ts
export class ContextBuilder {
  private sdk: SDK;
  private params: ContextParams;
  private plugins: Array<{ plugin: ABsmartlyPlugin; options?: any }> = [];

  constructor(sdk: SDK, params: ContextParams) {
    this.sdk = sdk;
    this.params = params;
  }

  use(plugin: ABsmartlyPlugin, options?: any): this {
    this.plugins.push({ plugin, options });
    return this;
  }

  async build(): Promise<Context> {
    const context = this.sdk.createContext(this.params);

    // Register all plugins
    for (const { plugin, options } of this.plugins) {
      context.use(plugin, options);
    }

    // Wait for plugins to be ready
    await context.pluginsReady();

    return context;
  }
}

// Usage
const context = await sdk.contextBuilder(params)
  .use(new OverridesPlugin(), { cookieName: 'overrides' })
  .use(new DOMChangesPlugin(), { autoApply: true })
  .use(new WebVitalsPlugin())
  .build();
```

### 6. Benefits

1. **Type Safety**: Full TypeScript support with proper interfaces
2. **Lifecycle Management**: Clear initialization, ready, and destroy phases
3. **Dependency Resolution**: Plugins can declare dependencies
4. **Discoverability**: Easy to see what plugins are registered
5. **Consistency**: All plugins follow the same pattern
6. **Chainable API**: Fluent interface for better DX
7. **Async Support**: Proper handling of async plugin initialization
8. **Error Handling**: Centralized error handling for plugin lifecycle

### 7. Implementation Checklist

SDK Changes:
- [ ] Add `plugin.ts` with interfaces
- [ ] Add plugin methods to Context class
- [ ] Update Context.finalize() to handle plugin cleanup
- [ ] Add unit tests for plugin registration
- [ ] Update TypeScript definitions
- [ ] Add documentation

Plugin Updates:
- [ ] Update DOMChangesPlugin to implement ABsmartlyPlugin
- [ ] Update OverridesPlugin to implement ABsmartlyPlugin
- [ ] Update other plugins (CookiePlugin, WebVitalsPlugin)
- [ ] Update plugin documentation
- [ ] Add migration guide

### 8. Backwards Compatibility

To maintain backwards compatibility during the transition:

1. Keep the current direct registration working:
```typescript
// In Context constructor or ready method
if (this.__plugins) {
  // Migrate legacy plugins to new system
  for (const [key, registration] of Object.entries(this.__plugins)) {
    if (!this.plugins.has(registration.name)) {
      // Create wrapper plugin
      const legacyPlugin: ABsmartlyPlugin = {
        name: registration.name,
        version: registration.version,
        capabilities: registration.capabilities
      };
      this.plugins.set(registration.name, {
        ...registration,
        plugin: legacyPlugin
      });
    }
  }
}
```

2. Support both initialization patterns for a transition period
3. Add deprecation warnings for direct `__plugins` access
4. Provide automated migration tool/codemod

### 9. Future Enhancements

- **Plugin Store**: Central registry of available plugins
- **Plugin Composition**: Combine multiple plugins into one
- **Plugin Middleware**: Allow plugins to intercept SDK operations
- **Plugin Events**: Event system for inter-plugin communication
- **Plugin Validation**: Validate plugin compatibility with SDK version
- **Lazy Loading**: Dynamic plugin loading based on conditions

## Conclusion

This plugin API provides a robust, type-safe, and developer-friendly way to extend the ABsmartly SDK. It maintains flexibility while adding structure and consistency to the plugin ecosystem.