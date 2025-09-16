# Overrides Plugin Usage Guide

## Overview

The plugin provides two versions of OverridesPlugin:

| Version | Size | Features | Use Case |
|---------|------|----------|----------|
| **OverridesPluginLite** | ~3KB | Cookie + Query string parsing | Production websites |
| **OverridesPluginFull** | ~15KB | Cookie + Query + API + Dev environments | Browser extensions & internal tools |

## OverridesPluginLite - For Production Websites

Minimal overhead for production websites that only need basic cookie override support.

### Features
- ✅ Cookie parsing
- ✅ Query string support
- ✅ Simple variant overrides
- ✅ Persist query to cookie (optional)
- ✅ Ultra-lightweight
- ❌ No API fetching
- ❌ No dev environment support

### Usage

```javascript
import {
  DOMChangesPlugin,
  OverridesPluginLite,
  hasOverrides
} from '@absmartly/dom-changes-plugin';

// Check if overrides exist in query or cookie
if (hasOverrides('absmartly_overrides', '_exp_')) {
  const overridesPlugin = new OverridesPluginLite({
    context: context,
    cookieName: 'absmartly_overrides',
    useQueryString: true,
    queryPrefix: '_exp_',
    persistQueryToCookie: true,  // Optional: save query to cookie
    debug: false
  });

  await overridesPlugin.initialize();
}

// Always initialize DOMChangesPlugin
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  debug: false
});

await domPlugin.initialize();
```

### Formats Supported

```javascript
// Cookie format
document.cookie = 'absmartly_overrides=exp1:0,exp2:1,exp3:2';

// Query string format (with prefix)
// ?_exp_button_color=1&_exp_hero_text=0
// ?_exp_test=1,2,12345  // With env and id (not fetched, just passed through)
```

## OverridesPluginFull - For Extensions & Internal Tools

Full-featured version with all capabilities for browser extensions and internal testing tools.

### Features
- ✅ Cookie parsing
- ✅ Query string support
- ✅ API fetching for non-running experiments
- ✅ Dev environment support
- ✅ Server-side compatible
- ✅ Persist query to cookie

### Usage

```javascript
import {
  DOMChangesPlugin,
  OverridesPluginFull
} from '@absmartly/dom-changes-plugin';

const overridesPlugin = new OverridesPluginFull({
  context: context,

  // Cookie configuration
  cookieName: 'absmartly_overrides',
  cookieOptions: {
    path: '/',
    maxAge: 86400,
    secure: true,
    sameSite: 'Lax'
  },

  // Query string configuration
  useQueryString: true,
  queryPrefix: '_exp_',
  envParam: 'env',
  persistQueryToCookie: true,

  // Endpoints
  sdkEndpoint: 'https://your-endpoint.absmartly.io',
  absmartlyEndpoint: 'https://your-endpoint.absmartly.com',

  debug: true
});

await overridesPlugin.initialize();

// Initialize DOMChangesPlugin with extension support
const domPlugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,
  extensionBridge: true,
  debug: true
});

await domPlugin.initialize();
```

### All Formats Supported

#### Cookie Format
```javascript
// Simple overrides
'absmartly_overrides=exp1:0,exp2:1'

// With environment flags
'absmartly_overrides=exp1:1.0,exp2:0.1'

// With experiment IDs (for API fetching)
'absmartly_overrides=exp1:1.2.12345'

// With dev environment
'absmartly_overrides=devEnv=staging|exp1:1.1,exp2:0.1'
```

#### Query String Format
```
// Individual parameters with prefix
?_exp_button_color=1&_exp_hero_text=0

// With environment
?env=staging&_exp_dev_feature=1.1

// With experiment ID
?_exp_archived_test=1.2.12345
```

## Server-Side Usage

Both versions work on the server with a cookie adapter:

```javascript
import { OverridesPluginFull } from '@absmartly/dom-changes-plugin';

// Express.js example
class ExpressCookieAdapter {
  constructor(req, res) {
    this.req = req;
    this.res = res;
  }

  get(name) {
    return this.req.cookies[name];
  }

  set(name, value, options) {
    this.res.cookie(name, value, options);
  }
}

// In your route handler
app.get('/', async (req, res) => {
  const overridesPlugin = new OverridesPluginFull({
    context: context,
    cookieName: 'absmartly_overrides',
    cookieAdapter: new ExpressCookieAdapter(req, res),
    url: req.url,
    useQueryString: true,
    debug: false
  });

  await overridesPlugin.initialize();

  // Render with overrides applied
  res.render('index', { context });
});
```

## Migration Guide

### From OverridesPlugin to OverridesPluginLite (Production)

```javascript
// Before
import { OverridesPlugin } from '@absmartly/dom-changes-plugin';
const plugin = new OverridesPlugin({ ... });

// After (for production websites)
import { OverridesPluginLite } from '@absmartly/dom-changes-plugin';
const plugin = new OverridesPluginLite({
  context: context,
  cookieName: 'absmartly_overrides',
  debug: false
});
```

### From OverridesPlugin to OverridesPluginFull (Extensions)

```javascript
// Before
import { OverridesPlugin } from '@absmartly/dom-changes-plugin';
const plugin = new OverridesPlugin({ ... });

// After (for extensions with full features)
import { OverridesPluginFull } from '@absmartly/dom-changes-plugin';
const plugin = new OverridesPluginFull({
  // Same configuration as before
});
```

## Size Comparison

| Plugin | Minified | Gzipped | Features |
|--------|----------|---------|----------|
| hasOverrides() | ~300B | ~200B | Detection (cookie + query) |
| OverridesPluginLite | ~3KB | ~1.5KB | Cookie + Query overrides |
| OverridesPluginFull | ~15KB | ~5KB | Full features + API + Dev |

## Decision Tree

```
Do you need experiment overrides?
├─ No → Don't use any OverridesPlugin
└─ Yes → Are you building a browser extension or internal tool?
    ├─ Yes → Use OverridesPluginFull
    └─ No → Are you on a production website?
        ├─ Yes → Use OverridesPluginLite with hasOverrides()
        └─ No → Are you on the server?
            ├─ Yes → Use OverridesPluginFull with CookieAdapter
            └─ No → Use OverridesPluginLite
```

## Cookie Format Reference

The cookie uses efficient separators that don't require encoding:

- **Between experiments**: `,` (comma)
- **Between values**: `.` (dot)
- **Environment prefix**: `|` (pipe)

Format: `name:variant[.env][.id]`

Examples:
```javascript
// Simple
'exp1:0,exp2:1'

// With flags
'exp1:1.0,exp2:0.1'

// With IDs
'exp1:1.2.12345,exp2:0.2.67890'

// With dev environment
'devEnv=staging|exp1:1.1,exp2:0.1'
```

This format is:
- **Compact**: No URL encoding needed
- **Readable**: Easy to debug
- **Efficient**: Fast to parse