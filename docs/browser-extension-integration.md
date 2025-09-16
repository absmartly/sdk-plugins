# Browser Extension Integration Guide

This guide explains how to integrate the ABsmartly DOM Changes SDK Plugin with the ABsmartly Browser Extension.

## Overview

The SDK plugin now consists of two separate classes that work together:

1. **OverridesPlugin** - Handles cookie-based experiment overrides from the browser extension
2. **DOMChangesPlugin** - Applies DOM changes to the page

This separation ensures clean architecture and allows the DOMChangesPlugin to remain agnostic about where experiments come from.

## Override Formats

The browser extension can set overrides via cookies or query strings. Query strings take precedence over cookies.

### Cookie Format

```
absmartly_overrides=experimentName:variant[,env,id][;...]
```

### Query String Format

The same format can be used in the URL query string:

```
https://example.com?absmartly_overrides=experimentName:variant[,env,id][;...]
```

### Format Examples

```javascript
// Single running experiment (variant 1)
absmartly_overrides=yellow_buttons:1

// Multiple running experiments
absmartly_overrides=yellow_buttons:1;hero_text:0;nav_color:2

// Non-running experiment (env=2) with experiment ID
absmartly_overrides=archived_test:1,2,12345

// Development experiment (env=1)
absmartly_overrides=dev_experiment:0,1

// Mixed types with dev environment
absmartly_overrides=devEnv=staging|running:1;dev_test:0,1;archived:2,2,99999
```

### Query String Examples

```
// Simple override
https://example.com?absmartly_overrides=exp1:1

// Multiple experiments (URL-encoded)
https://example.com?absmartly_overrides=exp1%3A1%3Bexp2%3A0

// With dev environment (URL-encoded)
https://example.com?absmartly_overrides=devEnv%3Dstaging%7Cexp1%3A1%2C1

// Combined with other parameters
https://example.com?utm_source=test&absmartly_overrides=exp1:1&utm_campaign=demo
```

### Environment Flags

- `env=0` (or omitted): Running experiment in production
- `env=1`: Development experiment (fetched from SDK dev endpoint)
- `env=2`: Non-running/archived experiment (fetched from API)

## Plugin Initialization

### Step 1: Load the Plugin

The plugin can be loaded via CDN or bundled with your application:

```html
<!-- Via CDN -->
<script src="https://unpkg.com/@absmartly/javascript-sdk"></script>
<script src="https://unpkg.com/@absmartly/dom-changes-plugin"></script>

<!-- Or if bundled locally -->
<script src="/path/to/absmartly-sdk.js"></script>
<script src="/path/to/absmartly-dom-changes.js"></script>
```

### Step 2: Initialize Both Plugins

```javascript
// The plugin exports both classes
const { DOMChangesPlugin, OverridesPlugin } = window.ABsmartlySDKPlugins;

// Initialize ABsmartly SDK
const sdk = new ABsmartly.SDK({
  endpoint: 'https://your-endpoint.absmartly.io/v1',
  apiKey: 'YOUR_API_KEY',
  environment: 'production',
  application: 'your-app'
});

// Create context
const context = sdk.createContext({
  units: {
    user_id: 'user-123',
    session_id: 'session-456'
  }
});

// IMPORTANT: Initialize OverridesPlugin FIRST
const overridesPlugin = new OverridesPlugin({
  context: context,
  cookieName: 'absmartly_overrides',  // Cookie name for overrides
  queryParam: 'absmartly_overrides',  // Query parameter name (optional, defaults to same as cookieName)
  sdkEndpoint: 'https://your-endpoint.absmartly.io',
  absmartlyEndpoint: 'https://your-endpoint.absmartly.com', // Optional, for API calls
  debug: true  // Enable for troubleshooting
});

// Initialize DOMChangesPlugin SECOND
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  spa: true,
  visibilityTracking: true,
  extensionBridge: true,  // Enable extension communication
  dataSource: 'variable',
  dataFieldName: '__dom_changes',
  debug: true
});

// Initialize in order
async function initializePlugins() {
  try {
    // 1. Apply overrides from cookies (this fetches experiments if needed)
    await overridesPlugin.initialize();

    // 2. Apply DOM changes (uses experiments from context, including overrides)
    await domPlugin.initialize();

    console.log('Plugins initialized successfully');
  } catch (error) {
    console.error('Failed to initialize plugins:', error);
  }
}

initializePlugins();
```

## How It Works

### Workflow

1. **Browser Extension** sets the `absmartly_overrides` cookie OR passes it via query string
2. **OverridesPlugin** reads overrides (query string takes precedence over cookie) and:
   - Applies variant overrides to the context
   - Fetches non-running experiments from API (env=2)
   - Fetches development experiments from SDK (env=1)
   - Injects fetched experiments into `context.data()`
3. **DOMChangesPlugin** reads experiments from context and applies DOM changes
4. Both plugins communicate with the extension via `postMessage`

### Data Flow

```
Browser Extension
    ↓ (sets cookie OR query string)
Cookie/Query String overrides
    ↓ (read by - query string has priority)
OverridesPlugin
    ↓ (fetches & injects)
Context.data() with experiments
    ↓ (read by)
DOMChangesPlugin
    ↓ (applies)
DOM Changes
```

## API Endpoints

### For Non-Running Experiments (env=2)

The OverridesPlugin fetches from:
```
GET https://your-endpoint.absmartly.com/v1/experiments?ids=12345,67890
```

### For Development Experiments (env=1)

The OverridesPlugin fetches from:
```
GET https://your-endpoint.absmartly.io/context?environment=staging
```

## Extension Communication

The DOMChangesPlugin listens for messages from the extension:

```javascript
// Extension can send messages
window.postMessage({
  source: 'absmartly-extension',
  type: 'APPLY_PREVIEW',
  payload: {
    experimentName: 'test_experiment',
    changes: [
      { selector: '.button', type: 'text', value: 'New Text' }
    ]
  }
}, '*');

// Plugin responds with results
window.postMessage({
  source: 'absmartly-sdk',
  type: 'CHANGES_APPLIED',
  payload: {
    count: 1,
    experimentName: 'test_experiment'
  }
}, '*');
```

## Message Types

### Extension → Plugin

- `REQUEST_EXPERIMENT_DATA` - Request current experiments
- `APPLY_PREVIEW` - Apply preview changes
- `REMOVE_PREVIEW` - Remove preview changes
- `REQUEST_OVERRIDES` - Request current overrides

### Plugin → Extension

- `PLUGIN_READY` - Plugin initialized
- `EXPERIMENT_DATA` - Current experiments data
- `OVERRIDES_DATA` - Current overrides
- `CHANGES_APPLIED` - Changes were applied
- `CHANGES_REMOVED` - Changes were removed
- `ERROR` - Error occurred

## Debugging

### Enable Debug Mode

```javascript
const overridesPlugin = new OverridesPlugin({
  context: context,
  debug: true  // Logs cookie parsing, API calls, etc.
});

const domPlugin = new DOMChangesPlugin({
  context: context,
  debug: true  // Logs DOM changes, exposure tracking, etc.
});
```

### Check Override Values

```javascript
// Check cookie value
document.cookie.split(';').find(c => c.includes('absmartly_overrides'))

// Check query string value
new URLSearchParams(window.location.search).get('absmartly_overrides')

// Check which one will be used (query string has priority)
const queryValue = new URLSearchParams(window.location.search).get('absmartly_overrides');
const cookieValue = document.cookie.split(';').find(c => c.includes('absmartly_overrides'));
console.log('Will use:', queryValue || cookieValue || 'none');
```

### Verify Experiments Were Fetched

```javascript
// After initialization
const contextData = context.data();
console.log('Experiments in context:', contextData.experiments);
```

### Monitor Network Requests

Look for:
- API calls to `/v1/experiments?ids=...` for non-running experiments
- SDK calls to `/context?environment=...` for development experiments

## Common Issues

### Changes Not Applying

1. **Check cookie format** - Ensure no JSON formatting (should be `exp:1` not `{"exp":1}`)
2. **Verify initialization order** - OverridesPlugin MUST initialize before DOMChangesPlugin
3. **Check experiment data** - Ensure experiments have `__dom_changes` in variables
4. **Debug network calls** - Verify API/SDK endpoints are accessible

### Cookie Not Being Read

1. **Check cookie name** - Must match between extension and plugin config
2. **Check cookie encoding** - Semicolons in values should be URL-encoded
3. **Check cookie domain** - Ensure cookie is set for the correct domain

### Experiments Not Fetched

1. **Check endpoint configuration** - Verify `sdkEndpoint` and `absmartlyEndpoint`
2. **Check experiment IDs** - Ensure IDs in cookie are valid
3. **Check network errors** - Look for CORS or authentication issues
4. **Verify dev environment name** - Must match environment in SDK

## Example: Full Integration

```html
<!DOCTYPE html>
<html>
<head>
  <title>ABsmartly Integration</title>
</head>
<body>
  <h1 class="headline">Original Headline</h1>
  <button class="cta-button">Original Button</button>

  <script src="https://unpkg.com/@absmartly/javascript-sdk"></script>
  <script src="/dist/absmartly-dom-changes.min.js"></script>

  <script>
    (async function() {
      // Get plugins from the global object
      const { DOMChangesPlugin, OverridesPlugin } = window.ABsmartlySDKPlugins;

      // Initialize SDK
      const sdk = new ABsmartly.SDK({
        endpoint: 'https://demo.absmartly.io/v1',
        apiKey: 'demo-api-key',
        environment: 'production',
        application: 'website'
      });

      // Create context
      const context = sdk.createContext({
        units: { user_id: '12345' }
      });

      // Initialize overrides plugin
      const overrides = new OverridesPlugin({
        context: context,
        cookieName: 'absmartly_overrides',
        sdkEndpoint: 'https://demo.absmartly.io',
        absmartlyEndpoint: 'https://demo.absmartly.com',
        debug: true
      });

      // Initialize DOM plugin
      const domChanges = new DOMChangesPlugin({
        context: context,
        autoApply: true,
        spa: true,
        visibilityTracking: true,
        extensionBridge: true,
        dataSource: 'variable',
        dataFieldName: '__dom_changes',
        debug: true
      });

      try {
        // Initialize in order
        await overrides.initialize();
        await domChanges.initialize();

        console.log('✅ Plugins initialized');

        // Extension can now communicate with the plugin
        // DOM changes will be applied based on cookie overrides

      } catch (error) {
        console.error('❌ Initialization failed:', error);
      }
    })();
  </script>
</body>
</html>
```

## Testing Overrides

You can test the integration without the extension by setting overrides manually:

### Via Query String (Easiest for Testing)

```javascript
// Append to current URL
window.location.href = window.location.href + '?absmartly_overrides=my_experiment:1';

// Or build a test URL
const testUrl = 'https://example.com?absmartly_overrides=' + encodeURIComponent('exp1:0;exp2:1');
window.location.href = testUrl;

// Test with dev environment
const devUrl = 'https://example.com?absmartly_overrides=' + encodeURIComponent('devEnv=staging|exp1:1,1');
window.location.href = devUrl;
```

### Via Cookie

```javascript
// Test single experiment override
document.cookie = 'absmartly_overrides=my_experiment:1; path=/';

// Test multiple experiments
document.cookie = 'absmartly_overrides=exp1:0;exp2:1;exp3:2; path=/';

// Test with non-running experiment
document.cookie = 'absmartly_overrides=archived_exp:1,2,12345; path=/';

// Test with dev environment
document.cookie = 'absmartly_overrides=devEnv=staging|dev_exp:0,1; path=/';

// Clear test cookie
document.cookie = 'absmartly_overrides=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
```

## Migration from Old Version

If you were using the old version where DOMChangesPlugin handled cookies directly:

### Old Way (deprecated)
```javascript
// Single plugin handled everything
const plugin = new DOMChangesPlugin({
  context: context,
  // ... cookie handling was internal
});
await plugin.initialize();
```

### New Way (current)
```javascript
// Two plugins with separation of concerns
const overrides = new OverridesPlugin({ context, ... });
const domChanges = new DOMChangesPlugin({ context, ... });

await overrides.initialize();  // Must be first
await domChanges.initialize();  // Must be second
```

## Support

For issues or questions:
- Check the [GitHub repository](https://github.com/absmartly/dom-changes-sdk-plugin)
- Review [test files](../src/__tests__/integration-with-overrides.test.ts) for examples
- Enable debug mode for detailed logging