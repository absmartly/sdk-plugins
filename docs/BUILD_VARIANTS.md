# ABsmartly SDK Plugins - Build Variants

The @absmartly/sdk-plugins package is available in multiple optimized builds, allowing you to load only what you need and minimize bundle size.

## Available Builds

### 1. **Core DOM Plugin Only** (`absmartly-dom-changes-core.min.js`) - 56KB
- **Smallest bundle** - Just the DOM manipulation functionality
- No override capabilities
- Perfect when you only need DOM changes from experiments

```html
<script src="https://static.absmartly.com/absmartly-dom-changes-core.min.js"></script>
<script>
  const plugin = new ABsmartlyDOM.DOMChangesPlugin({
    context: context,
    autoApply: true
  });
</script>
```

### 2. **DOM + Overrides Lite** (`absmartly-dom-changes-lite.min.js`) - 67KB
- DOM manipulation + lightweight override detection
- Client-side only (no API calls)
- Good for production with basic override needs

```html
<script src="https://static.absmartly.com/absmartly-dom-changes-lite.min.js"></script>
<script>
  // Includes DOM plugin and lite overrides
  const domPlugin = new ABsmartlyDOMLite.DOMChangesPlugin({ /* ... */ });
  const overridesPlugin = new ABsmartlyDOMLite.OverridesPluginLite({ /* ... */ });
</script>
```

### 3. **Full SDK Plugins Bundle** (`absmartly-sdk-plugins.min.js`) - 80KB
- DOM manipulation + full override capabilities
- Includes API support for fetching non-running experiments
- Best for development/staging environments
- This is the main bundle with all core plugins

```html
<script src="https://static.absmartly.com/absmartly-sdk-plugins.min.js"></script>
<script>
  // Full featured version
  const domPlugin = new ABsmartlySDKPlugins.DOMChangesPlugin({ /* ... */ });
  const overridesPlugin = new ABsmartlySDKPlugins.OverridesPluginFull({ /* ... */ });
  const cookiePlugin = new ABsmartlySDKPlugins.CookiePlugin({ /* ... */ });
  const vitalsPlugin = new ABsmartlySDKPlugins.WebVitalsPlugin({ /* ... */ });
</script>
```

### 4. **Complete Bundle** (`absmartly-dom-changes.min.js`) - 90KB
- **Backward compatible** - includes everything
- Contains DOM changes, full overrides (includes all lite functionality), and cookie plugin
- Use only if you need to maintain backward compatibility

```html
<script src="https://static.absmartly.com/absmartly-dom-changes.min.js"></script>
<script>
  // Legacy - includes everything
  const plugin = new ABsmartlySDKPlugins.DOMChangesPlugin({ /* ... */ });
</script>
```

### 5. **Overrides Lite Only** (`absmartly-overrides-lite.min.js`) - 11KB
- Just the lightweight override detection
- For when you already have the DOM plugin loaded
- Minimal footprint

```html
<script src="https://static.absmartly.com/absmartly-overrides-lite.min.js"></script>
<script>
  const overrides = new ABsmartlyOverridesLite.OverridesPluginLite({ /* ... */ });
</script>
```

### 6. **Overrides Full Only** (`absmartly-overrides-full.min.js`) - 25KB
- Just the full-featured override system
- For when you already have the DOM plugin loaded
- Includes API capabilities

```html
<script src="https://static.absmartly.com/absmartly-overrides-full.min.js"></script>
<script>
  const overrides = new ABsmartlyOverridesFull.OverridesPluginFull({ /* ... */ });
</script>
```

### 7. **Cookie Plugin Only** (`absmartly-cookie.min.js`) - 8KB
- Standalone cookie management and tracking
- Unit ID generation and persistence
- UTM parameter tracking
- Landing page tracking
- Perfect for custom implementations

```html
<script src="https://static.absmartly.com/absmartly-cookie.min.js"></script>
<script>
  const cookiePlugin = new ABsmartlyCookie.CookiePlugin({
    cookieDomain: '.absmartly.com',
    cookieExpiryDays: 730,
    autoUpdateExpiry: true
  });
  await cookiePlugin.initialize();

  // Get or generate unit ID
  const unitId = cookiePlugin.getUnitId() || cookiePlugin.generateAndSetUnitId();

  // Track UTM parameters
  cookiePlugin.applyUtmAttributesToContext(context);

  // Track landing events
  cookiePlugin.trackLanding(context);
</script>
```

### 8. **Web Vitals Plugin Only** (`absmartly-vitals.min.js`) - 10KB
- Core Web Vitals tracking (CLS, LCP, FCP, INP, TTFB)
- Page performance metrics
- DOM element counts
- Network timing analysis
- Automatic performance ratings

```html
<script src="https://static.absmartly.com/absmartly-vitals.min.js"></script>
<script>
  const vitalsPlugin = new ABsmartlyVitals.WebVitalsPlugin({
    context: context,
    trackWebVitals: true,
    trackPageMetrics: true,
    autoTrack: true
  });
  await vitalsPlugin.initialize();
</script>
```

## Choosing the Right Build

### For Production
```html
<!-- Option 1: Just DOM changes (56KB) -->
<script src="https://static.absmartly.com/absmartly-dom-changes-core.min.js"></script>

<!-- Option 2: DOM + Basic overrides (67KB) -->
<script src="https://static.absmartly.com/absmartly-dom-changes-lite.min.js"></script>
```

### For Development/Staging
```html
<!-- Full features with API support (80KB) -->
<script src="https://static.absmartly.com/absmartly-sdk-plugins.min.js"></script>
```

### Modular Loading
```html
<!-- Load DOM plugin first (56KB) -->
<script src="https://static.absmartly.com/absmartly-dom-changes-core.min.js"></script>

<!-- Then conditionally load overrides if needed -->
<script>
  // Check if overrides are present
  if (window.location.search.includes('_exp_')) {
    // Load override plugin (11KB or 25KB)
    const script = document.createElement('script');
    script.src = 'https://static.absmartly.com/absmartly-overrides-lite.min.js';
    document.head.appendChild(script);
  }
</script>
```

## Build Size Comparison

| Build | Size | DOM Changes | Overrides Lite | Overrides Full | Cookie | Vitals | Use Case |
|-------|------|-------------|----------------|----------------|--------|--------|----------|
| `core` | 56KB | ✅ | ❌ | ❌ | ❌ | ❌ | Production - DOM only |
| `lite` | 67KB | ✅ | ✅ | ❌ | ❌ | ❌ | Production with overrides |
| `sdk-plugins` | 95KB | ✅ | ❌ | ✅ | ✅ | ✅ | Main bundle - all plugins |
| `complete` (legacy) | 95KB | ✅ | ❌ | ✅ | ✅ | ✅ | Backward compatibility |
| `overrides-lite` | 11KB | ❌ | ✅ | ❌ | ❌ | ❌ | Add-on for existing DOM |
| `overrides-full` | 25KB | ❌ | ❌ | ✅ | ❌ | ❌ | Add-on for existing DOM |
| `cookie-only` | 8KB | ❌ | ❌ | ❌ | ✅ | ❌ | Standalone cookie management |
| `vitals-only` | 10KB | ❌ | ❌ | ❌ | ❌ | ✅ | Standalone performance tracking |

## Building Specific Variants

```bash
# Build all variants
npm run bundle

# Build specific variant
npm run bundle:dom     # Core DOM only
npm run bundle:lite    # DOM + Overrides Lite
npm run bundle:full    # DOM + Overrides Full
npm run bundle:complete # Everything (backward compatible)
```

## CDN URLs

All builds are available at:
- `https://static.absmartly.com/absmartly-dom-changes-core.min.js`
- `https://static.absmartly.com/absmartly-dom-changes-lite.min.js`
- `https://static.absmartly.com/absmartly-sdk-plugins.min.js` (Main bundle)
- `https://static.absmartly.com/absmartly-dom-changes.min.js` (Legacy)
- `https://static.absmartly.com/absmartly-overrides-lite.min.js`
- `https://static.absmartly.com/absmartly-overrides-full.min.js`
- `https://static.absmartly.com/absmartly-cookie.min.js`
- `https://static.absmartly.com/absmartly-vitals.min.js`

## Migration Guide

If you're currently using the complete bundle:

```javascript
// Old way (94KB)
const plugin = new ABsmartlySDKPlugins.DOMChangesPlugin({ /* ... */ });
```

Consider switching to a smaller build:

```javascript
// New way - Production (56KB)
const plugin = new ABsmartlyDOM.DOMChangesPlugin({ /* ... */ });

// New way - Production with overrides (67KB)
const plugin = new ABsmartlyDOMLite.DOMChangesPlugin({ /* ... */ });

// New way - Development (80KB)
const plugin = new ABsmartlySDKPlugins.DOMChangesPlugin({ /* ... */ });
```

## Benefits

1. **Reduced Bundle Size**: Load only what you need
2. **Faster Page Load**: Smaller scripts = faster downloads
3. **Modular Architecture**: Mix and match based on requirements
4. **Better Caching**: Separate files can be cached independently
5. **Conditional Loading**: Load overrides only when needed

## Example: Optimal Production Setup

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Load core DOM plugin (56KB) -->
  <script src="https://static.absmartly.com/absmartly-dom-changes-core.min.js"></script>

  <script>
    // Initialize immediately for fastest DOM changes
    (async function() {
      const sdk = new ABsmartly.SDK({ /* ... */ });
      const context = sdk.createContext({ /* ... */ });

      const domPlugin = new ABsmartlyDOM.DOMChangesPlugin({
        context: context,
        autoApply: true
      });

      await domPlugin.initialize();

      // Conditionally load overrides if needed
      if (window.location.search.includes('_exp_')) {
        const script = document.createElement('script');
        script.src = 'https://static.absmartly.com/absmartly-overrides-lite.min.js';
        script.onload = async function() {
          const overrides = new ABsmartlyOverridesLite.OverridesPluginLite({
            context: context,
            useQueryString: true
          });
          await overrides.initialize();
        };
        document.head.appendChild(script);
      }
    })();
  </script>
</head>
<body>
  <!-- Your content -->
</body>
</html>
```

This setup ensures:
- Minimal bundle size for regular users (56KB)
- Override capabilities only when needed (+11KB)
- Fast initial page load
- Optimal performance