# ABsmartly DOM Changes Plugin - Usage Example

## Using Both Plugins Together

The DOM Changes plugin can be used standalone or with the OverridesPlugin for handling non-running experiments.

### Basic Setup (DOM Changes Only)

```javascript
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';

// Assuming you already have an ABsmartly context
const context = sdk.createContext(contextOptions);

// Initialize DOM Changes plugin
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,  // Automatically apply DOM changes
  spa: true,        // Enable SPA support with MutationObserver
  debug: true       // Enable debug logging
});

await domPlugin.initialize();
```

### Advanced Setup with Overrides Plugin

```javascript
import { DOMChangesPlugin, OverridesPlugin } from '@absmartly/dom-changes-plugin';

// Create your ABsmartly context
const context = sdk.createContext(contextOptions);

// Step 1: Initialize OverridesPlugin FIRST (if you need to handle non-running experiments)
const overridesPlugin = new OverridesPlugin({
  context: context,
  cookieName: 'absmartly_overrides',  // Cookie name for overrides
  sdkEndpoint: 'https://demo.absmartly.io',  // Required if not available from context
  absmartlyEndpoint: 'https://api.absmartly.com',  // Optional, for fetching non-running experiments
  debug: true
});

// This will:
// 1. Read overrides from cookie
// 2. Apply overrides to context
// 3. Fetch non-running experiments from API if needed
// 4. Inject fetched experiments into context.data() transparently
await overridesPlugin.initialize();

// Step 2: Initialize DOM Changes plugin
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  spa: true,
  debug: true
});

// The DOM plugin will now see all experiments (running + fetched)
// as if they were all part of the original context
await domPlugin.initialize();
```

## How It Works

### OverridesPlugin

1. **Reads cookie overrides** in the format: `devEnv=envName|exp1:variant,env,id;exp2:variant`
   - `variant`: The variant index to apply
   - `env`: 0 = running, 1 = development, 2 = non-running (API fetch)
   - `id`: Experiment ID for API fetching

2. **Fetches experiment data** from:
   - API endpoint for non-running experiments (env=2)
   - SDK dev endpoint for development experiments (env=1)

3. **Injects experiments transparently** into `context.data()`:
   - The fetched experiments are merged with existing context data
   - DOM Changes plugin sees them as regular experiments
   - No window storage or global variables needed

### DOMChangesPlugin

1. **Extracts DOM changes** from all experiments in context
2. **Applies changes** based on current variant assignments
3. **Handles SPA** with MutationObserver for dynamic content
4. **Tracks exposure** when elements become visible

## Cookie Format Examples

```javascript
// Simple override for running experiment
document.cookie = "absmartly_overrides=exp1:1;exp2:0";

// Override with development environment
document.cookie = "absmartly_overrides=devEnv=staging|exp1:1,1;exp2:0,1";

// Override with non-running experiment (fetched from API)
document.cookie = "absmartly_overrides=exp1:1,2,12345";
// Where: variant=1, env=2 (API fetch), id=12345

// Mixed overrides
document.cookie = "absmartly_overrides=running_exp:1;dev_exp:0,1;api_exp:2,2,67890";
```

## Architecture Benefits

1. **Separation of Concerns**:
   - OverridesPlugin handles experiment fetching and overrides
   - DOMChangesPlugin focuses solely on DOM manipulation

2. **Transparency**:
   - Fetched experiments are injected into context data
   - DOMChangesPlugin doesn't know or care where experiments come from

3. **Independence**:
   - Each plugin can be used standalone
   - No coupling between plugins

4. **Efficiency**:
   - VariantExtractor caches all variants in a single pass
   - No redundant lookups or repeated extraction

## TypeScript Types

```typescript
import {
  OverridesPluginConfig,
  PluginConfig,
  DOMChange,
  ABsmartlyContext
} from '@absmartly/dom-changes-plugin';

// OverridesPlugin configuration
const overridesConfig: OverridesPluginConfig = {
  context: context,
  cookieName: 'absmartly_overrides',
  sdkEndpoint: 'https://demo.absmartly.io',
  absmartlyEndpoint: 'https://api.absmartly.com',
  debug: true
};

// DOMChangesPlugin configuration
const domConfig: PluginConfig = {
  context: context,
  autoApply: true,
  spa: true,
  visibilityTracking: true,
  extensionBridge: true,
  dataSource: 'variable',
  dataFieldName: '__dom_changes',
  debug: true
};
```

## Bundle Sizes

The plugins are modular and tree-shakeable:
- **DOMChangesPlugin only**: ~45KB minified
- **OverridesPlugin only**: ~15KB minified
- **Both plugins**: ~60KB minified

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires support for:
- ES6 Promises
- Fetch API
- MutationObserver
- IntersectionObserver (for visibility tracking)