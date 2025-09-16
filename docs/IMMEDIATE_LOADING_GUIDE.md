# Immediate Loading Guide - ABsmartly DOM Changes Plugin

## Problem
DOM changes not being applied at page load can cause a "flash of original content" (FOOC) where users briefly see the original version before experiment changes are applied.

## Solution Overview

The plugin needs to be initialized **as early as possible** in the page lifecycle with the `autoApply: true` configuration. Here are the key strategies:

## 1. Basic Implementation (Most Common)

Place the initialization code in the `<head>` section of your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Load SDK and Plugin immediately -->
  <script src="https://unpkg.com/@absmartly/javascript-sdk"></script>
  <script src="path/to/absmartly-dom-changes.min.js"></script>

  <script>
    // Initialize immediately - don't wait for DOMContentLoaded
    (async function() {
      const sdk = new ABsmartly.SDK({
        endpoint: 'YOUR_ENDPOINT',
        apiKey: 'YOUR_API_KEY',
        environment: 'production',
        application: 'YOUR_APP'
      });

      const context = sdk.createContext({
        units: { user_id: 'user-123' }
      });

      const domPlugin = new ABsmartlySDKPlugins.DOMChangesPlugin({
        context: context,
        autoApply: true,  // Critical: Apply changes automatically
        spa: true         // Monitor for new elements
      });

      // Initialize immediately
      await domPlugin.initialize();
    })();
  </script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

## 2. Anti-Flicker Pattern (Zero FOOC)

For critical above-the-fold experiments where ANY flash is unacceptable:

```html
<head>
  <script>
    // Step 1: Hide content immediately (inline for fastest execution)
    (function() {
      var s = document.createElement('style');
      s.id = 'antiflicker';
      s.textContent = 'body{opacity:0 !important}';
      document.head.appendChild(s);

      // Failsafe: Show content after 3 seconds regardless
      setTimeout(function() {
        var af = document.getElementById('antiflicker');
        if (af) af.remove();
      }, 3000);
    })();
  </script>

  <!-- Load SDK and Plugin -->
  <script src="absmartly-sdk.js"></script>
  <script src="absmartly-dom-plugin.js"></script>

  <script>
    (async function() {
      // Initialize SDK and Plugin
      const sdk = new ABsmartly.SDK({/*...*/});
      const context = sdk.createContext({/*...*/});

      const domPlugin = new ABsmartlySDKPlugins.DOMChangesPlugin({
        context: context,
        autoApply: true
      });

      await domPlugin.initialize();

      // Step 2: Show content after changes are applied
      document.getElementById('antiflicker').remove();
    })();
  </script>
</head>
```

## 3. Modern JavaScript Modules

For ES6 module-based applications:

```javascript
// app-init.js - Load this as early as possible
import { SDK } from '@absmartly/javascript-sdk';
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';

// Don't wait for DOMContentLoaded
async function initExperiments() {
  const sdk = new SDK({/*...*/});
  const context = sdk.createContext({/*...*/});

  const domPlugin = new DOMChangesPlugin({
    context,
    autoApply: true,
    spa: true
  });

  await domPlugin.initialize();
  return domPlugin;
}

// Initialize immediately
const pluginPromise = initExperiments();

// Export for use in other modules
export { pluginPromise };
```

```html
<!-- In your HTML -->
<head>
  <script type="module">
    import { pluginPromise } from './app-init.js';
    // Plugin initializes immediately on import
  </script>
</head>
```

## 4. React/Next.js Implementation

For React applications, initialize before rendering:

```javascript
// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SDK } from '@absmartly/javascript-sdk';
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';
import App from './App';

async function init() {
  // Initialize ABsmartly BEFORE React renders
  const sdk = new SDK({/*...*/});
  const context = sdk.createContext({/*...*/});

  const domPlugin = new DOMChangesPlugin({
    context,
    autoApply: true,
    spa: true  // Important for React apps
  });

  await domPlugin.initialize();

  // Now render React app
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
}

// Start initialization immediately
init();
```

## 5. Using Script Loading Order

Ensure proper script loading order with `defer` or `async`:

```html
<head>
  <!-- Synchronous loading - blocks parsing but ensures order -->
  <script src="absmartly-sdk.js"></script>
  <script src="absmartly-dom-plugin.js"></script>
  <script src="init-experiments.js"></script>
</head>
```

Or with defer (executes after DOM parsing but before DOMContentLoaded):

```html
<head>
  <!-- All scripts execute in order after parsing -->
  <script defer src="absmartly-sdk.js"></script>
  <script defer src="absmartly-dom-plugin.js"></script>
  <script defer src="init-experiments.js"></script>
</head>
```

## Critical Configuration Settings

```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,

  // CRITICAL for immediate loading:
  autoApply: true,        // Apply changes automatically on init

  // Important for dynamic content:
  spa: true,              // Watch for new elements

  // Optional but recommended:
  visibilityTracking: true,  // Track when changes become visible
  debug: false              // Set to true for troubleshooting
});
```

## Common Mistakes to Avoid

### ❌ DON'T: Wait for DOMContentLoaded

```javascript
// WRONG - Too late!
document.addEventListener('DOMContentLoaded', async () => {
  const domPlugin = new DOMChangesPlugin({/*...*/});
  await domPlugin.initialize();
});
```

### ❌ DON'T: Initialize in footer

```html
<!-- WRONG - Too late! -->
<body>
  <!-- content -->
  <script>
    // Initialization here is too late
  </script>
</body>
```

### ❌ DON'T: Forget autoApply

```javascript
// WRONG - Changes won't apply automatically
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: false  // or missing entirely
});
```

### ✅ DO: Initialize immediately in head

```javascript
// CORRECT - As early as possible
(async function() {
  const domPlugin = new DOMChangesPlugin({
    context: context,
    autoApply: true
  });
  await domPlugin.initialize();
})();
```

## Performance Considerations

1. **Selective Anti-Flicker**: Only use the anti-flicker pattern for critical, above-the-fold experiments
2. **Timeout Fallbacks**: Always include timeout fallbacks when hiding content
3. **Async Loading**: For non-critical experiments, async loading is acceptable
4. **Cache Experiment Data**: Consider caching experiment data locally for faster subsequent loads

## Debugging

Enable debug mode to see timing information:

```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  debug: true  // Shows timing info in console
});
```

Check the console for:
- When the plugin initializes
- When changes are applied
- How many changes were applied
- Any errors in selector matching

## Summary

For immediate DOM changes at page load:

1. **Load scripts in `<head>`** - Not in body or footer
2. **Set `autoApply: true`** - Essential for automatic application
3. **Initialize immediately** - Don't wait for DOM events
4. **Use anti-flicker pattern** - For critical experiments only
5. **Enable SPA mode** - For dynamic content with `spa: true`

The key is initializing the plugin as early as possible in the page lifecycle with the correct configuration.