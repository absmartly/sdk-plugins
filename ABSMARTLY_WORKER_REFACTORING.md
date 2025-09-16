# ABSmartly Worker Refactoring Guide

This document provides step-by-step instructions for refactoring the `absmartly-worker` project to use the new plugin architecture from `@absmartly/sdk-plugins`.

## Overview

The current implementation in `absmartly-worker` contains:
1. **Cookie management logic** (public/sdk.js lines 273-300, 437-491)
2. **Override handling** (public/sdk.js lines 367-384, 449-476 and src/index.ts lines 165-182, 212-290)
3. **UTM parameter tracking** (public/sdk.js lines 186-271, 332-356)
4. **Web Vitals tracking** (public/sdk.js lines 9-128)
5. **Page metrics tracking** (public/sdk.js lines 22-128)
6. **SDK initialization** (public/sdk.js lines 303-373)
7. **Worker communication** (public/sdk.js lines 375-435)

## New Plugin Architecture

The `@absmartly/sdk-plugins` package now provides:
- **CookiePlugin**: Handles all cookie operations, UTM tracking, and unit ID management
- **OverridesPlugin**: Manages experiment overrides from query parameters and cookies
- **DOMChangesPlugin**: Handles DOM manipulations (already implemented in your current code)
- **WebVitalsPlugin**: Tracks Core Web Vitals and page performance metrics

## Important Notes

⚠️ **Required Parameters:**
- **OverridesPluginFull** requires:
  - `sdkEndpoint`: Your ABSmartly SDK endpoint without `/v1` (e.g., 'https://demo-2.absmartly.io')
  - `absmartlyEndpoint`: Your ABSmartly console API endpoint (e.g., 'https://demo-2.absmartly.com')
- **CookiePlugin** requires `cookieDomain` parameter matching your domain
- **WebVitalsPlugin** and **DOMChangesPlugin** require a valid context

⚠️ **Initialization Order:**
1. Create context
2. Set attributes and UTM parameters
3. **Call `await context.ready()` BEFORE initializing OverridesPlugin**
4. Initialize OverridesPlugin (requires ready context)
5. Initialize other plugins (WebVitalsPlugin, DOMChangesPlugin)

## Refactoring Steps

### Step 1: Install the Plugin Package

```bash
npm install @absmartly/sdk-plugins
```

### Step 2: Refactor public/sdk.js

Replace the current implementation with the new plugin-based approach:

```javascript
(function() {
    const searchParams = window.ABsmartlyParams || new URLSearchParams(location.search);
    const DEBUG = searchParams.get('absmartly_debug') === '1';

    function debugLog(...args) {
        if (DEBUG) console.debug('[ABsmartly]', ...args);
    }

    // Keep only the safeExecuteCodeAsync function
    // Web vitals and page metrics are now handled by WebVitalsPlugin

    async function loadDOMPlugin() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.absmartly.com/absmartly-sdk-plugins.min.js';
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
        });
    }

    async function loadFromWorker(existingId) {
        debugLog('Loading from worker with existingId:', existingId);
        const params = new URLSearchParams(window.location.search);
        params.set('init', '1');

        if (existingId) {
            params.set('unit', existingId);
        }

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `https://sdk.absmartly.com/?${params.toString()}`;

            const checkInterval = setInterval(() => {
                if (window.absId && window.serverSideData) {
                    clearInterval(checkInterval);
                    resolve({
                        absId: window.absId,
                        serverSideData: window.serverSideData,
                        overriddenExperimentVariables: window.overriddenExperimentVariables
                    });
                }
            }, 50);

            script.onerror = () => {
                clearInterval(checkInterval);
                console.error('Failed to load worker script');
                resolve({
                    absId: existingId || null,
                    overriddenExperimentVariables: {}
                });
            };

            document.head.appendChild(script);
        });
    }

    async function main() {
        debugLog('Starting main execution');

        // Load the DOM plugin first
        try {
            await loadDOMPlugin();
            debugLog('DOM plugin loaded successfully');
        } catch (error) {
            console.error('Failed to load DOM plugin:', error);
            return;
        }

        // Check if plugin is available
        if (typeof window.ABsmartlySDKPlugins === 'undefined') {
            console.error('ABsmartlySDKPlugins not available');
            return;
        }

        const { DOMChangesPlugin, OverridesPluginFull, CookiePlugin, WebVitalsPlugin } = window.ABsmartlySDKPlugins;

        // Initialize CookiePlugin
        const cookiePlugin = new CookiePlugin({
            debug: DEBUG,
            cookieDomain: '.absmartly.com',
            cookiePath: '/',
            sameSite: 'Lax',
            cookieExpiryDays: 730,
            unitIdCookieName: 'abs',
            publicIdCookieName: 'abs_public',
            expiryCookieName: 'abs_expiry',
            utmCookieName: 'abs_utm_params',
            autoUpdateExpiry: true,
            expiryCheckInterval: 30
        });

        await cookiePlugin.initialize();

        let unitId = cookiePlugin.getUnitId();
        let workerData = null;

        // Check if we need to call the worker
        if (cookiePlugin.needsWorkerCall(searchParams)) {
            workerData = await loadFromWorker(unitId);
            if (workerData.absId) {
                unitId = workerData.absId;
                cookiePlugin.setUnitId(unitId);
            }
        }

        // If still no unit ID, generate one
        if (!unitId) {
            unitId = cookiePlugin.generateAndSetUnitId();
        }

        // Initialize SDK
        const sdk = new absmartly.SDK({
            endpoint: 'https://demo-2.absmartly.io/v1',
            apiKey: 'tElj59jHKInx0DUxqGB1JtRvhl23vudS_K-PB-0KUM2PjCucLZkjHlN3fxYjbjGR',
            environment: 'Prod',
            application: 'absmartly.com',
            eventLogger: (context, eventName, data) => {
                debugLog('SDK Event:', { eventName, data });
            },
        });

        let context;
        if (workerData?.serverSideData) {
            context = sdk.createContextWith(
                { units: { absId: unitId } },
                workerData.serverSideData,
                { publishDelay: 100 }
            );
        } else {
            context = sdk.createContext({
                units: { absId: unitId }
            });
        }

        window.ABsmartlyContext = context;
        context.attribute('user_agent', navigator.userAgent);

        // Apply UTM parameters using CookiePlugin
        cookiePlugin.setContext(context);
        cookiePlugin.applyUtmAttributesToContext();

        // Add attributes from query parameters
        for (const [key, value] of searchParams.entries()) {
            if (key.startsWith("attr_")) {
                const attributeName = key.slice(5);
                context.attribute(attributeName, value);
            }
        }

        // IMPORTANT: Wait for context to be ready before initializing plugins that need context data
        await context.ready();
        debugLog('Context is ready!');

        // Initialize OverridesPlugin (needs ready context)
        debugLog('Initializing overrides plugin');
        const overridesPlugin = new OverridesPluginFull({
            context: context,
            sdkEndpoint: 'https://demo-2.absmartly.io',     // Required: SDK endpoint without /v1
            absmartlyEndpoint: 'https://demo-2.absmartly.com', // Required: Console API endpoint
            cookieName: 'absmartly_overrides',
            useQueryString: true,
            queryPrefix: 'exp_',
            persistQueryToCookie: true,
            debug: DEBUG
        });
        await overridesPlugin.initialize();

        // Initialize WebVitalsPlugin
        debugLog('Initializing web vitals plugin');
        const vitalsPlugin = new WebVitalsPlugin({
            context: context,
            trackWebVitals: true,
            trackPageMetrics: true,
            debug: DEBUG
        });
        await vitalsPlugin.initialize();

        // Initialize DOM changes plugin
        debugLog('Initializing DOM changes plugin');
        const domPlugin = new DOMChangesPlugin({
            context: context,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
            debug: DEBUG
        });

        await domPlugin.initialize();
        debugLog('DOM plugin initialized successfully');

        // Make plugins available globally for debugging
        window.ABsmartlyDOMPlugin = domPlugin;
        window.ABsmartlyCookiePlugin = cookiePlugin;
        window.ABsmartlyOverridesPlugin = overridesPlugin;
        window.ABsmartlyVitalsPlugin = vitalsPlugin;

        // Track initial page view and execute ready code
        context.treatment("absmartly_site_aa_1");
        const code = context.variableValue("on_sdk_ready", '');
        // Note: trackWebVitals and trackPageMetrics are now handled by WebVitalsPlugin
        // Only execute custom code if present
        if (code) {
            await safeExecuteCodeAsync(code, context, {
                priority: 'high',
                timeout: 3000
            });
        }

        // Track landing using CookiePlugin
        cookiePlugin.trackLanding(context);
    }

    // Start execution
    main().catch(error => {
        console.error('ABsmartly SDK initialization error:', error);
    });
})();
```

### Step 3: Refactor src/index.ts (Worker)

The worker remains mostly unchanged, but you can remove the cookie management since it's now handled by the CookiePlugin on the client side:

```typescript
import { SDK } from "@absmartly/javascript-sdk";

const EXP_PREFIX = 'exp_';
const EXP_PREFIX_LENGTH = EXP_PREFIX.length;

interface Env {
  ABSMARTLY_API_KEY: string;
  ABSMARTLY_CONSOLE_API_KEY: string;
  ABSMARTLY_ENVIRONMENT: string;
  ABSMARTLY_APPLICATION: string;
  ABSMARTLY_UNIT_NAME: string;
  ABSMARTLY_ENDPOINT: string;
  ABSMARTLY_API_ENDPOINT: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { searchParams } = new URL(request.url);
    let absId = searchParams.get("unit");
    const goalName = searchParams.get("goal");
    const initSDK = searchParams.get("init");

    // Parse incoming cookies (for backward compatibility)
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = parseCookies(cookieHeader);

    // If no unit is provided, try to get from cookies or generate
    if (!absId) {
      if (cookies.abs && cookies.abs !== "undefined" && cookies.abs.length > 0) {
        absId = cookies.abs;
      } else if (cookies.abs_public && cookies.abs_public !== "undefined") {
        absId = cookies.abs_public;
      } else {
        absId = generateFastUniqueID();
      }
    }

    // Handle goal tracking case
    if (goalName && !initSDK) {
      return await handleGoalTracking(absId, goalName, searchParams, env);
    }

    if (initSDK) {
      return await handleSDKInit(absId, searchParams, env);
    }

    return new Response('Invalid request. Must specify either init=1 or goal parameter', { status: 400 });
  },
};

// Keep existing handleGoalTracking function unchanged (lines 62-124)

async function handleSDKInit(absId: string, searchParams: URLSearchParams, env: Env): Promise<Response> {
  // Initialize SDK and get context data
  const serverSideData = await initializeSDK(absId, searchParams, env);

  // Generate response with necessary data
  const responseBody = `
    window.absId = "${absId}";
    window.serverSideData = ${JSON.stringify(serverSideData)};
    window.overriddenExperimentVariables = ${JSON.stringify(await getOverriddenVariables(searchParams, env))};
  `;

  // Set cookie headers - these will be managed by CookiePlugin on client side
  // But we keep them for backward compatibility
  const headers = new Headers({ 'Content-Type': 'text/javascript' });
  const expires = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toUTCString();

  headers.append(
    "Set-Cookie",
    `abs=${absId}; Expires=${expires}; Path=/; Domain=.absmartly.com; HttpOnly; SameSite=Lax`
  );
  headers.append(
    "Set-Cookie",
    `abs_public=${absId}; Expires=${expires}; Path=/; Domain=.absmartly.com; SameSite=Lax`
  );
  headers.append(
    "Set-Cookie",
    `abs_expiry=${Date.now()}; Expires=${expires}; Path=/; Domain=.absmartly.com; SameSite=Lax`
  );

  return new Response(responseBody, { status: 200, headers });
}

// Keep remaining functions unchanged (initializeSDK, getOverriddenVariables, parseCookies, generateFastUniqueID)
```

## Key Benefits of Refactoring

1. **Separation of Concerns**: Cookie management, overrides, DOM manipulation, and performance tracking are now in separate, reusable plugins
2. **Maintainability**: Updates to any plugin logic can be done in the plugin package
3. **Testing**: Each plugin can be tested independently
4. **Reusability**: The plugins can be used in other projects
5. **Configuration**: Plugins offer more configuration options
6. **Type Safety**: Full TypeScript support with proper types
7. **Performance**: WebVitalsPlugin handles all performance tracking efficiently
8. **Modularity**: Load only the plugins you need, reducing bundle size

## Migration Checklist

- [ ] Install the plugin package
- [ ] Update public/sdk.js to use CookiePlugin, OverridesPlugin, and DOMChangesPlugin
- [ ] Remove duplicate cookie management code
- [ ] Remove duplicate override handling code
- [ ] Test cookie persistence
- [ ] Test UTM parameter tracking
- [ ] Test experiment overrides from query parameters
- [ ] Test worker communication
- [ ] Test landing page tracking
- [ ] Verify all existing functionality works as expected

## API Comparison

### Old Cookie Management
```javascript
// Manual cookie operations
function getCookie(name) { /* ... */ }
function setCookie(name, value, days) { /* ... */ }
```

### New CookiePlugin API
```javascript
const cookiePlugin = new CookiePlugin(options);
cookiePlugin.getUnitId();
cookiePlugin.setUnitId(id);
cookiePlugin.getUtmParams();
cookiePlugin.trackLanding(context);
```

### Old Override Handling
```javascript
// Manual override parsing
const overrides = getABsmartlyOverridesFromQuery(searchParams);
context.overrides(overrides);
```

### New OverridesPlugin API
```javascript
const overridesPlugin = new OverridesPluginFull({
    context: context,
    sdkEndpoint: 'https://demo-2.absmartly.io',       // Required!
    absmartlyEndpoint: 'https://demo-2.absmartly.com',  // Required!
    cookieName: 'absmartly_overrides',
    useQueryString: true,
    queryPrefix: 'exp_',
    persistQueryToCookie: true
});
await overridesPlugin.initialize(); // Automatically handles everything
```

## Testing

After refactoring, test the following scenarios:

1. **Fresh visitor**: No cookies, should generate new unit ID
2. **Returning visitor**: Should use existing unit ID from cookies
3. **UTM parameters**: Should track and store UTM parameters
4. **Experiment overrides**: Query parameters like `?exp_test=1` should work
5. **Cookie expiry**: Should refresh expiry cookie appropriately
6. **Worker fallback**: Should handle worker failures gracefully
7. **Landing page tracking**: Should track landing events correctly

## Support

If you encounter any issues during the refactoring process, please refer to:
- Plugin documentation: `/docs/OVERRIDES_USAGE.md`
- Integration guide: `/docs/EXTENSION_INTEGRATION_GUIDE.md`
- Example implementations: `/examples/`