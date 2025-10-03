# ABsmartly SDK Plugins

A comprehensive collection of plugins for the ABsmartly JavaScript SDK including DOM manipulation, experiment overrides, cookie management, and web vitals tracking.

## Available Plugins

### 1. DOMChangesPlugin
- **Complete DOM Manipulation**: All change types including styleRules with pseudo-states
- **Smart Exposure Tracking**: Cross-variant tracking prevents sample ratio mismatch
- **Dynamic Content Support**: Pending changes with `waitForElement` for SPAs
- **React/Vue Compatibility**: StyleRules survive re-renders
- **Browser Extension Integration**: Two-way communication for visual editing

### 2. OverridesPlugin
- **Query String Overrides**: Force experiments via URL parameters
- **Cookie Persistence**: Server-compatible experiment overrides
- **API Integration**: Fetch non-running experiments (Full version)
- **Development Support**: Test experiments in any environment

### 3. CookiePlugin
- **Unit ID Management**: Generate and persist user identifiers
- **UTM Tracking**: Capture and store UTM parameters
- **Landing Page Tracking**: Track first visits and referrers
- **Storage Fallbacks**: Cookie → localStorage → memory

### 4. WebVitalsPlugin
- **Core Web Vitals**: Track CLS, LCP, FCP, INP, TTFB
- **Page Metrics**: Network timing, DOM processing, resource counts
- **Performance Ratings**: Automatic good/needs-improvement/poor classification
- **Compression Metrics**: Track page size and compression ratios

## Installation

```bash
npm install @absmartly/sdk-plugins
```

## Quick Start

### Basic Usage

```javascript
import { DOMChangesPlugin, CookiePlugin, WebVitalsPlugin } from '@absmartly/sdk-plugins';
import absmartly from '@absmartly/javascript-sdk';

// Initialize ABsmartly SDK
const sdk = new absmartly.SDK({
  endpoint: 'https://your-endpoint.absmartly.io/v1',
  apiKey: 'YOUR_API_KEY',
  environment: 'production',
  application: 'your-app'
});

// Create context
const context = sdk.createContext(request);

// Initialize plugins
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,              // Automatically apply changes on init
  spa: true,                     // Enable SPA support
  visibilityTracking: true,     // Track when changes become visible
  extensionBridge: true,         // Enable browser extension communication
  dataSource: 'variable',        // Use variables (or 'customField')
  dataFieldName: '__dom_changes', // Variable/field name for DOM changes
  debug: true                    // Enable debug logging
});

// Initialize without blocking
domPlugin.ready().then(() => {
  console.log('DOMChangesPlugin ready');
});

// Initialize cookie management
const cookiePlugin = new CookiePlugin({
  context: context,
  cookieDomain: '.yourdomain.com',
  autoUpdateExpiry: true
});
cookiePlugin.ready().then(() => {
  console.log('CookiePlugin ready');
});

// Initialize web vitals tracking
const vitalsPlugin = new WebVitalsPlugin({
  context: context,
  trackWebVitals: true,
  trackPageMetrics: true
});
vitalsPlugin.ready().then(() => {
  console.log('WebVitalsPlugin ready');
});
```

### With Experiment Overrides (Browser Extension Support)

The OverridesPlugin enables experiment overrides for internal testing and the ABsmartly Browser Extension. Simply load it before SDK initialization and it will automatically check for and apply any overrides:

```javascript
import {
  DOMChangesPlugin,
  OverridesPlugin
} from '@absmartly/dom-changes-plugin';
import absmartly from '@absmartly/javascript-sdk';

// Initialize SDK and create context
const sdk = new absmartly.SDK({ /* ... */ });
const context = sdk.createContext({ /* ... */ });

// Initialize OverridesPlugin - it will automatically check for overrides
const overridesPlugin = new OverridesPlugin({
  context: context,
  cookieName: 'absmartly_overrides',
  useQueryString: true,
  queryPrefix: '_exp_',
  envParam: 'env',
  persistQueryToCookie: true,  // Save query overrides to cookie
  sdkEndpoint: 'https://your-endpoint.absmartly.io',
  debug: true
});

overridesPlugin.ready().then(() => {
  console.log('OverridesPlugin ready - overrides applied if present');
});

// Initialize DOMChangesPlugin for all experiments
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  dataSource: 'variable',
  dataFieldName: '__dom_changes',
  debug: true
});

domPlugin.ready().then(() => {
  console.log('DOMChangesPlugin ready');
});
```

#### Override Configuration Options

```javascript
const overridesPlugin = new OverridesPlugin({
  context: context,                    // Required: ABsmartly context

  // Cookie configuration
  cookieName: 'absmartly_overrides',   // Cookie name (omit to disable cookies)
  cookieOptions: {
    path: '/',
    secure: true,
    sameSite: 'Lax'
  },

  // Query string configuration
  useQueryString: true,                // Enable query string parsing (default: true on client)
  queryPrefix: '_exp_',                 // Prefix for experiment params (default: '_exp_')
  envParam: 'env',                     // Environment parameter name (default: 'env')
  persistQueryToCookie: false,         // Save query overrides to cookie (default: false)

  // Endpoints
  sdkEndpoint: 'https://...',          // SDK endpoint (required if not in context)
  absmartlyEndpoint: 'https://...',    // API endpoint for fetching experiments

  // Server-side configuration
  url: req.url,                        // URL for server-side (Node.js)
  cookieAdapter: customAdapter,        // Custom cookie adapter for server-side

  debug: true                          // Enable debug logging
});
```

#### Query String Format (New)

Use individual query parameters with configurable prefix:
```
# Single experiment
https://example.com?_exp_button_color=1

# Multiple experiments
https://example.com?_exp_hero_title=0&_exp_nav_style=2

# With environment
https://example.com?env=staging&_exp_dev_feature=1,1

# With experiment ID
https://example.com?_exp_archived_test=1,2,12345
```

#### Cookie Format

Cookies use comma as separator (no encoding needed):
```javascript
// Simple overrides (comma-separated experiments)
document.cookie = 'absmartly_overrides=exp1:1,exp2:0';

// With environment flags (dot-separated values)
document.cookie = 'absmartly_overrides=exp1:1.0,exp2:0.1';

// With experiment ID
document.cookie = 'absmartly_overrides=exp1:1.2.12345';

// With dev environment
document.cookie = 'absmartly_overrides=devEnv=staging|exp1:1.1,exp2:0.1';
```

**Format**: `name:variant[.env][.id]` where:
- Experiments are separated by `,` (comma)
- Values within an experiment are separated by `.` (dot)
- Environment prefix uses `|` (pipe) separator

#### How Overrides Work

1. **Query String Priority**: Query parameters take precedence over cookies
2. **Environment Support**: Use `env` parameter for dev/staging experiments
3. **API Fetching**: Non-running experiments are fetched from ABsmartly API
4. **Context Injection**: Experiments are transparently injected into context.data()
5. **DOM Application**: DOMChangesPlugin applies changes from all experiments

## DOM Change Types

The plugin supports comprehensive DOM manipulation with advanced features:

### Core Change Types

### Text Change
```javascript
{
  selector: '.headline',
  type: 'text',
  value: 'New Headline Text'
}
```

### HTML Change
```javascript
{
  selector: '.content',
  type: 'html',
  value: '<p>New <strong>HTML</strong> content</p>'
}
```

### Style Change (Inline)
```javascript
{
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red',    // Use camelCase for CSS properties
    color: '#ffffff',
    fontSize: '18px'
  },
  trigger_on_view: false  // Control exposure timing
}
```

### Style Rules (With Pseudo-States) ⭐ NEW
```javascript
{
  selector: '.button',
  type: 'styleRules',
  states: {
    normal: {
      backgroundColor: '#007bff',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '4px',
      transition: 'all 0.2s ease'
    },
    hover: {
      backgroundColor: '#0056b3',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    },
    active: {
      backgroundColor: '#004085',
      transform: 'translateY(0)'
    },
    focus: {
      outline: '2px solid #007bff',
      outlineOffset: '2px'
    }
  },
  important: true,  // default is true
  trigger_on_view: true
}
```

**Benefits of styleRules:**
- Handles CSS pseudo-states properly (hover, active, focus)
- Survives React re-renders through stylesheet injection
- More performant than inline styles for complex interactions

### Class Change
```javascript
{
  selector: '.card',
  type: 'class',
  add: ['highlighted', 'featured'],
  remove: ['default']
}
```

### Attribute Change
```javascript
{
  selector: 'input[name="email"]',
  type: 'attribute',
  value: {
    'placeholder': 'Enter your email',
    'required': 'true'
  }
}
```

### JavaScript Execution
```javascript
{
  selector: '.dynamic-element',
  type: 'javascript',
  value: 'element.addEventListener("click", () => console.log("Clicked!"))'
}
```

### Element Move
```javascript
{
  selector: '.sidebar',
  type: 'move',
  targetSelector: '.main-content',
  position: 'before' // 'before', 'after', 'firstChild', 'lastChild'
}
```

### Element Creation
```javascript
{
  selector: '.new-banner', // For identification
  type: 'create',
  element: '<div class="banner">Special Offer!</div>',
  targetSelector: 'body',
  position: 'firstChild',
  trigger_on_view: false
}
```

### Pending Changes (Elements Not Yet in DOM) ⭐ NEW
```javascript
{
  selector: '.lazy-loaded-button',
  type: 'style',
  value: {
    backgroundColor: 'red',
    color: 'white'
  },
  waitForElement: true,  // Wait for element to appear
  observerRoot: '.main-content',  // Optional: specific container to watch
  trigger_on_view: true
}
```

**Perfect for:**
- Lazy-loaded content
- React components that mount/unmount
- Modal dialogs
- API-loaded content
- Infinite scroll items

## Key Features

### Exposure Tracking with trigger_on_view

The `trigger_on_view` property prevents sample ratio mismatch by controlling when A/B test exposures are recorded:

```javascript
{
  selector: '.below-fold-element',
  type: 'style',
  value: { backgroundColor: 'blue' },
  trigger_on_view: true  // Only trigger when element becomes visible
}
```

- **`false` (default)**: Exposure triggers immediately
- **`true`**: Exposure triggers when element enters viewport
- **Cross-variant tracking**: Tracks elements from ALL variants for unbiased exposure

### Core API Methods

```javascript
// Apply changes from ABsmartly context
await plugin.applyChanges('experiment-name');

// Apply individual change
const success = plugin.applyChange(change, 'experiment-name');

// Remove changes
plugin.removeChanges('experiment-name');

// Get applied changes
const changes = plugin.getAppliedChanges('experiment-name');

// Clean up resources
plugin.destroy();
```

## Browser Extension Integration

The plugin communicates with the ABsmartly Browser Extension for visual editing:

- **Automatic Detection**: Detects and connects to the extension
- **Message Protocol**: Two-way communication for preview mode and visual editing
- **Preview Support**: Test changes before creating experiments

## Documentation

For detailed documentation:

- **[Extension Integration Guide](docs/EXTENSION_INTEGRATION_GUIDE.md)** - Complete guide for browser extension integration, visual editing, preview mode, and advanced features
- **[Exposure Tracking Guide](docs/EXPOSURE_TRACKING_GUIDE.md)** - Understanding trigger_on_view and preventing sample ratio mismatch

## Anti-Flicker Support

Prevent content flash before experiments load with two modes:

### Quick Start

**Hide entire page with smooth fade-in:**
```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  hideUntilReady: 'body',
  hideTransition: '0.3s ease-in'  // Smooth fade-in
});
```

**Hide only experiment elements (recommended):**
```html
<!-- Mark elements that need anti-flicker -->
<div data-absmartly-hide>
  Hero section with experiment
</div>

<div data-absmartly-hide>
  CTA button being tested
</div>
```

```javascript
const domPlugin = new DOMChangesPlugin({
  context: context,
  hideUntilReady: 'elements',     // Hide only marked elements
  hideTransition: '0.4s ease-out'
});
```

### How It Works

1. **During Load (Before Experiments Applied):**
   ```css
   /* No transition: */
   body { visibility: hidden !important; }

   /* With transition: */
   body {
     visibility: hidden !important;
     opacity: 0 !important;
   }
   ```

2. **After Experiments Applied:**
   - **No transition**: Instant reveal (removes `visibility:hidden`)
   - **With transition**: Smooth 4-step fade-in:
     1. Remove `visibility:hidden`
     2. Add CSS transition
     3. Animate opacity 0 → 1
     4. Clean up after transition completes

### Configuration Options

```javascript
new DOMChangesPlugin({
  // Anti-flicker configuration
  hideUntilReady: 'body',              // 'body' | 'elements' | true | false
                                       // 'body': hide entire page
                                       // 'elements': hide only marked elements
                                       // true: same as 'elements'
                                       // false: disabled (default)

  hideTimeout: 3000,                   // Max wait time in ms (default: 3000)
                                       // Content auto-shows after timeout
                                       // even if experiments fail to load

  hideTransition: '0.3s ease-in',      // CSS transition for fade-in
                                       // Examples: '0.3s ease-in', '0.5s linear'
                                       // false: instant reveal (default)

  hideSelector: '[data-absmartly-hide]' // Custom selector for 'elements' mode
                                       // default: '[data-absmartly-hide]'
})
```

### Why This Matters

**Without anti-flicker:**
```
User sees: Original → FLASH → Experiment Version
           ^^^^^^^^   ^^^^^   ^^^^^^^^^^^^^^^^^^
           (bad UX)   (jarring)
```

**With anti-flicker:**
```
User sees: [Hidden] → Experiment Version (smooth fade-in)
           ^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           (no flash)  (professional)
```

### Best Practices

**✅ Use `hideUntilReady: 'elements'` (Recommended)**
- Mark only elements being tested
- Faster perceived load time
- Better user experience
- No CLS (Cumulative Layout Shift)

```html
<nav>Normal navigation</nav>
<div data-absmartly-hide>
  <!-- Only this hero is hidden -->
  <h1>Hero headline being tested</h1>
</div>
<main>Rest of content visible immediately</main>
```

**✅ Use `hideUntilReady: 'body'` (For whole-page experiments)**
- Complete redesigns
- Multiple changes across page
- Ensures zero flicker

**✅ Set appropriate timeout**
```javascript
{
  hideTimeout: 2000  // Faster for good connections
  hideTimeout: 3000  // Balanced (default)
  hideTimeout: 5000  // Safer for slow connections
}
```

**⚠️ Avoid long transitions**
```javascript
hideTransition: '0.2s ease-in'  // ✅ Subtle, professional
hideTransition: '0.3s ease-out' // ✅ Smooth
hideTransition: '1s linear'     // ❌ Too slow, feels broken
```

### Industry Standard Comparison

| Tool | Method | Our Implementation |
|------|--------|-------------------|
| Google Optimize | `opacity: 0` | ✅ `visibility:hidden` (better) |
| Optimizely | `opacity: 0` | ✅ `visibility:hidden` (better) |
| VWO | `opacity: 0` on body | ✅ Both modes supported |
| **ABsmartly** | - | ✅ `visibility:hidden` + optional smooth fade |

**Why `visibility:hidden` is better:**
- ✅ Hides from screen readers
- ✅ Prevents interaction
- ✅ No CLS (Cumulative Layout Shift)
- ✅ Can add smooth opacity transition

## Style Persistence

Automatically reapply experiment styles when frameworks (React/Vue/Angular) overwrite them:

### The Problem

```javascript
// Experiment changes button to red
{ selector: '.button', type: 'style', value: { backgroundColor: 'red' } }

// User hovers → React's hover handler changes it back to blue
// Experiment style is lost! ❌
```

### The Solution

```javascript
{
  selector: '.button',
  type: 'style',
  value: { backgroundColor: 'red' },
  persistStyle: true  // ✅ Reapply when React overwrites it
}
```

### How It Works

1. **MutationObserver** watches for style attribute changes
2. **Detects** when framework overwrites experiment styles
3. **Automatically reapplies** experiment styles
4. **Throttled logging** (max once per 5 seconds to avoid spam)

### When It's Enabled

**Automatically in SPA mode:**
```javascript
new DOMChangesPlugin({
  context: context,
  spa: true  // ✅ Style persistence auto-enabled for all style changes
})
```

**Opt-in per change:**
```javascript
{
  selector: '.button',
  type: 'style',
  value: { backgroundColor: 'red' },
  persistStyle: true  // ✅ Explicit opt-in (works even if spa: false)
}
```

### Use Cases

**✅ React components with hover states:**
```javascript
// Button has React onClick that changes style
{
  selector: '.cta-button',
  type: 'style',
  value: { backgroundColor: '#ff6b6b' },
  persistStyle: true  // Survives React re-renders
}
```

**✅ Vue reactive styles:**
```javascript
{
  selector: '.dynamic-price',
  type: 'style',
  value: { color: 'green', fontWeight: 'bold' },
  persistStyle: true  // Persists through Vue updates
}
```

**✅ Angular material components:**
```javascript
{
  selector: 'mat-button',
  type: 'style',
  value: { backgroundColor: '#1976d2' },
  persistStyle: true  // Works with Angular's style binding
}
```

**❌ Static HTML (persistence not needed):**
```javascript
{
  selector: '.static-banner',
  type: 'style',
  value: { display: 'none' },
  persistStyle: false  // Not needed, saves performance
}
```

## SPA Mode (React/Vue/Angular Support)

Enable `spa: true` for Single Page Applications. This automatically activates two critical features:

### 1. Wait for Element (Lazy-Loaded Content)

Automatically waits for elements that don't exist yet in the DOM:

```javascript
{
  selector: '.lazy-loaded-button',
  type: 'style',
  value: { backgroundColor: 'red' }
  // No waitForElement needed - SPA mode handles it automatically!
}
```

**Without SPA mode:** Change skipped if element doesn't exist
**With SPA mode:** Observes DOM and applies when element appears

### 2. Style Persistence (Framework Conflicts)

Automatically re-applies styles when frameworks overwrite them:

```javascript
{
  selector: '.button',
  type: 'style',
  value: { backgroundColor: 'red' }
  // No persistStyle needed - SPA mode handles it automatically!
}
```

**Without SPA mode:** React hover states can overwrite experiment styles
**With SPA mode:** Detects and re-applies styles automatically

### When to Use SPA Mode

**✅ Enable `spa: true` for:**
- React applications
- Vue.js applications
- Angular applications
- Any app with client-side routing
- Apps with lazy-loaded components
- Apps with dynamic DOM updates

**❌ Keep `spa: false` for:**
- Static HTML sites
- Server-rendered pages without client-side routing
- Sites where performance is critical and you don't need dynamic features

### Manual Override

You can still use flags explicitly if you need granular control:

```javascript
{
  selector: '.button',
  type: 'style',
  value: { backgroundColor: 'red' },
  persistStyle: true,    // Force enable (even if spa: false)
  waitForElement: true   // Force enable (even if spa: false)
}
```

## Configuration Options

```javascript
new DOMChangesPlugin({
  // Required
  context: absmartlyContext,     // ABsmartly context

  // Core options
  autoApply: true,               // Auto-apply changes from SDK
  spa: true,                     // Enable SPA support
                                 // ✅ Auto-enables: waitForElement + persistStyle
  visibilityTracking: true,      // Track viewport visibility
  extensionBridge: true,         // Enable browser extension communication
  dataSource: 'variable',        // 'variable' or 'customField'
  dataFieldName: '__dom_changes', // Variable/field name for changes
  debug: false,                  // Enable debug logging

  // Anti-flicker options
  hideUntilReady: false,         // 'body' | 'elements' | true | false
  hideTimeout: 3000,             // Max wait time (ms)
  hideTransition: false,         // CSS transition (e.g., '0.3s ease-in') or false
  hideSelector: '[data-absmartly-hide]' // Custom selector for elements mode
})
```

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Internet Explorer 11+ (with polyfills)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT