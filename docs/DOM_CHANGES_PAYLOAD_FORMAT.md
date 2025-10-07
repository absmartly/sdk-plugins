# DOM Changes Payload Format

## Overview

The DOM Changes SDK Plugin now supports two formats for the `__dom_changes` field:

1. **Legacy Format** (backward compatible): Simple array of changes
2. **New Format** (recommended): Wrapped object with URL filtering and global defaults

## Legacy Format (Still Supported)

```typescript
__dom_changes: DOMChange[]
```

**Example:**
```json
[
  {
    "selector": ".btn-primary",
    "type": "text",
    "value": "Click Me!"
  },
  {
    "selector": ".hero-title",
    "type": "style",
    "value": {
      "color": "red",
      "fontSize": "24px"
    }
  }
]
```

This format continues to work as before. All changes apply on every page.

---

## New Format (Recommended)

```typescript
__dom_changes: {
  changes: DOMChange[];
  urlFilter?: string | string[] | URLFilterConfig;

  // Global defaults (optional)
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}
```

### Benefits of New Format:

1. **URL Filtering**: Target specific pages/URLs
2. **Global Defaults**: Set options once instead of per-change
3. **Cleaner Configuration**: Separate concerns (what vs where vs how)

---

## URL Filter Options

### 1. Simple String Pattern

Match a single URL pattern using wildcards:

```json
{
  "urlFilter": "/products/*",
  "changes": [...]
}
```

**Wildcards:**
- `*` matches any characters (zero or more)
- `?` matches exactly one character

**Examples (default matchType is "path"):**
- `/products/*` → All product pages (any domain)
- `/products/*/details` → Product detail pages
- `/checkout` → Checkout page
- `/page?` → page1, page2, etc.

**Note:** By default, patterns match against the path only (ignoring domain). This allows the same experiment to work across dev/staging/prod environments. To match the complete URL including domain, use `matchType: "full-url"` (see Match Type Options below).

### 2. Multiple Patterns (Array)

Match any of several patterns:

```json
{
  "urlFilter": [
    "/products/*",
    "/shop/*",
    "/checkout"
  ],
  "changes": [...]
}
```

Changes apply if URL matches **any** pattern in the array.

### 3. Advanced Configuration (Include/Exclude)

For complex scenarios with exclusions:

```json
{
  "urlFilter": {
    "include": ["/*"],
    "exclude": [
      "/admin/*",
      "/internal/*"
    ],
    "mode": "simple"
  },
  "changes": [...]
}
```

**Fields:**
- `include` (optional): Array of patterns to match. If empty/omitted, matches all URLs.
- `exclude` (optional): Array of patterns to exclude. Takes precedence over include.
- `mode` (optional): `"simple"` (default) or `"regex"`
- `matchType` (optional): `"path"` (default), `"full-url"`, `"domain"`, `"query"`, or `"hash"`

**Exclude takes precedence**: If a URL matches both include and exclude, it's excluded.

### Match Type Options

The `matchType` parameter controls which part of the URL is matched against your patterns. This is useful for different targeting strategies:

#### `"path"` (default) - Path + Hash
Matches just the pathname and hash fragment (e.g., `/products/123#reviews`).

**Use when:**
- You want the same experiment across all domains (dev/staging/prod)
- Domain doesn't matter, only the page path
- Most common use case

**Example:**
```json
{
  "urlFilter": {
    "include": ["/products/*"],
    "matchType": "path"
  },
  "changes": [...]
}
```

Matches:
- ✅ `https://example.com/products/123`
- ✅ `https://shop.example.com/products/123`
- ✅ `http://localhost:3000/products/123`
- ❌ `https://example.com/shop/123`

#### `"full-url"` - Complete URL
Matches the complete URL including protocol, domain, path, query, and hash.

**Use when:**
- You need exact URL matching including query parameters
- Different experiments for different domains
- Protocol matters (http vs https)

**Example:**
```json
{
  "urlFilter": {
    "include": ["https://shop.example.com/products/*"],
    "matchType": "full-url"
  },
  "changes": [...]
}
```

Matches:
- ✅ `https://shop.example.com/products/123?color=red`
- ❌ `http://shop.example.com/products/123` (wrong protocol)
- ❌ `https://www.example.com/products/123` (wrong subdomain)

#### `"domain"` - Domain Only
Matches just the hostname (e.g., `shop.example.com`).

**Use when:**
- Targeting specific subdomains
- Multi-domain campaigns
- A/B testing different domains

**Example:**
```json
{
  "urlFilter": {
    "include": ["shop.example.com", "*.example.net"],
    "matchType": "domain"
  },
  "changes": [...]
}
```

Matches:
- ✅ `https://shop.example.com/any/path`
- ✅ `http://shop.example.com/other`
- ✅ `https://www.example.net/page`
- ❌ `https://www.example.com/page`

#### `"query"` - Query Parameters Only
Matches just the query string (e.g., `?utm_source=email&id=123`).

**Use when:**
- UTM parameter tracking
- Campaign-specific experiments
- Testing based on URL parameters

**Example:**
```json
{
  "urlFilter": {
    "include": ["*utm_source=email*"],
    "matchType": "query"
  },
  "changes": [...]
}
```

Matches:
- ✅ `https://example.com/page?utm_source=email`
- ✅ `https://other.com/page?utm_source=email&id=123`
- ❌ `https://example.com/page?utm_source=social`

#### `"hash"` - Hash Fragment Only
Matches just the hash fragment (e.g., `#section-about`).

**Use when:**
- SPA hash-based routing
- Specific page sections
- Single-page application states

**Example:**
```json
{
  "urlFilter": {
    "include": ["#section-*"],
    "matchType": "hash"
  },
  "changes": [...]
}
```

Matches:
- ✅ `https://example.com/page#section-about`
- ✅ `https://other.com/other#section-contact`
- ❌ `https://example.com/page#top`

### 4. Regex Mode

For advanced pattern matching:

```json
{
  "urlFilter": {
    "include": [
      "^https://example\\.com/(products|shop)/.*$"
    ],
    "mode": "regex"
  },
  "changes": [...]
}
```

Use full JavaScript regex syntax. Patterns are tested with `new RegExp(pattern).test(url)`.

---

## Global Defaults

Set common options once for all changes in the variant:

```json
{
  "urlFilter": "https://example.com/products/*",
  "waitForElement": true,
  "persistStyle": true,
  "important": true,
  "observerRoot": ".main-content",
  "changes": [
    {
      "selector": ".btn",
      "type": "text",
      "value": "Add to Cart"
    },
    {
      "selector": ".price",
      "type": "style",
      "value": {
        "color": "red"
      },
      "waitForElement": false  // Override global default
    }
  ]
}
```

**Available Global Defaults:**
- `waitForElement`: Wait for elements to appear in DOM (useful for SPAs)
- `persistStyle`: Re-apply styles when frameworks overwrite them
- `important`: Add `!important` to style rules
- `observerRoot`: Root element selector for DOM observation

Individual changes can override global defaults by setting the same property.

---

## Complete Examples

### Example 1: E-commerce Product Pages

```json
{
  "urlFilter": "https://shop.example.com/products/*",
  "waitForElement": true,
  "changes": [
    {
      "selector": ".add-to-cart-btn",
      "type": "text",
      "value": "Add to Bag"
    },
    {
      "selector": ".product-price",
      "type": "style",
      "value": {
        "color": "#FF0000",
        "fontSize": "28px",
        "fontWeight": "bold"
      }
    },
    {
      "selector": ".free-shipping-badge",
      "type": "html",
      "value": "<span class=\"badge\">🚚 Free Shipping!</span>"
    }
  ]
}
```

### Example 2: Checkout Flow (Multiple Pages)

```json
{
  "urlFilter": [
    "https://example.com/cart",
    "https://example.com/checkout",
    "https://example.com/checkout/*"
  ],
  "persistStyle": true,
  "changes": [
    {
      "selector": ".checkout-btn",
      "type": "style",
      "value": {
        "backgroundColor": "#00AA00",
        "fontSize": "20px"
      }
    },
    {
      "selector": ".trust-badge",
      "type": "create",
      "element": "<div class=\"trust\">🔒 Secure Checkout</div>",
      "targetSelector": ".checkout-form",
      "position": "before"
    }
  ]
}
```

### Example 3: Exclude Admin Pages

```json
{
  "urlFilter": {
    "include": ["https://example.com/*"],
    "exclude": [
      "https://example.com/admin/*",
      "https://example.com/internal/*",
      "https://example.com/test/*"
    ]
  },
  "changes": [
    {
      "selector": ".header-nav",
      "type": "class",
      "add": ["new-design"]
    }
  ]
}
```

### Example 4: Complex Regex Pattern

```json
{
  "urlFilter": {
    "include": [
      "^https://example\\.com/(products|shop)/[0-9]+$"
    ],
    "mode": "regex"
  },
  "changes": [
    {
      "selector": ".product-title",
      "type": "text",
      "value": "Limited Time Offer!"
    }
  ]
}
```

### Example 5: No URL Filter (All Pages)

```json
{
  "waitForElement": true,
  "persistStyle": true,
  "changes": [
    {
      "selector": ".site-header",
      "type": "style",
      "value": {
        "backgroundColor": "#000000"
      }
    }
  ]
}
```

When `urlFilter` is omitted, changes apply on **all pages** (same as legacy format).

---

## Migration Guide

### Before (Legacy Format)
```json
[
  {
    "selector": ".btn",
    "type": "text",
    "value": "Click Me",
    "waitForElement": true
  },
  {
    "selector": ".title",
    "type": "text",
    "value": "Hello",
    "waitForElement": true
  }
]
```

### After (New Format with Global Defaults)
```json
{
  "waitForElement": true,
  "changes": [
    {
      "selector": ".btn",
      "type": "text",
      "value": "Click Me"
    },
    {
      "selector": ".title",
      "type": "text",
      "value": "Hello"
    }
  ]
}
```

### After (With URL Filtering)
```json
{
  "urlFilter": "https://example.com/products/*",
  "waitForElement": true,
  "changes": [
    {
      "selector": ".btn",
      "type": "text",
      "value": "Click Me"
    },
    {
      "selector": ".title",
      "type": "text",
      "value": "Hello"
    }
  ]
}
```

---

## Important Notes for Extension Developers

### 1. SRM Prevention is Automatic

The SDK automatically handles Sample Ratio Mismatch (SRM) prevention:
- If **any variant** has changes for a URL, **all variants** are tracked
- You don't need to worry about this - just configure URL filters per variant
- This ensures statistical validity even when variants target different pages

### 2. SPA (Single Page Application) Support

When `spa: true` in plugin config:
- SDK monitors URL changes (popstate, pushState, replaceState)
- Automatically re-evaluates URL filters on navigation
- Removes changes that no longer match, applies new ones

### 3. Format Detection

The SDK automatically detects which format you're using:
```typescript
// Legacy format detected
if (Array.isArray(__dom_changes)) { ... }

// New format detected
if (__dom_changes.changes && Array.isArray(__dom_changes.changes)) { ... }
```

### 4. Validation

The SDK validates:
- URL filter patterns (logs errors for invalid regex)
- Change structure (requires selector and type)
- Type-specific fields (e.g., targetSelector for move operations)

Invalid patterns are logged and skipped (fail-safe).

### 5. Testing URL Filters

You can test URL patterns using the browser console:
```javascript
// Simple path pattern (default)
URLMatcher.matches('/products/*', 'https://example.com/products/123')
// true

// Full URL matching
URLMatcher.matches({
  include: ['https://shop.example.com/products/*'],
  matchType: 'full-url'
}, 'https://shop.example.com/products/123')
// true

// Domain matching
URLMatcher.matches({
  include: ['*.example.com'],
  matchType: 'domain'
}, 'https://shop.example.com/any/path')
// true

// With exclude
URLMatcher.matches({
  include: ['/*'],
  exclude: ['/admin/*']
}, 'https://example.com/products/123')
// true
```

---

## UI/UX Recommendations for Extension

### 1. URL Filter Editor

**Suggested UI:**
```
┌─────────────────────────────────────────┐
│ URL Filtering (Optional)                │
├─────────────────────────────────────────┤
│ ○ Apply on all pages                    │
│ ● Target specific URLs                  │
│                                          │
│ Match Type:                              │
│ ⦿ Path only (default)                   │
│ ○ Full URL   ○ Domain   ○ Query  ○ Hash │
│                                          │
│ Mode: ⦿ Simple patterns  ○ Regex        │
│                                          │
│ Include patterns:                       │
│ [/products/*                       ] [+]│
│ [/shop/*                           ] [×]│
│                                          │
│ Exclude patterns: (optional)            │
│ [/admin/*                          ] [+]│
│                                          │
│ 💡 Tips:                                │
│ • Path only: Works across all domains   │
│ • Use * to match any characters         │
│ • Use ? to match one character          │
│ • Click + to add more patterns          │
└─────────────────────────────────────────┘
```

### 2. Global Defaults Section

```
┌─────────────────────────────────────────┐
│ Global Settings                         │
├─────────────────────────────────────────┤
│ ☑ Wait for elements (SPA mode)         │
│ ☑ Persist styles (React/Vue/Angular)   │
│ ☑ Use !important for styles            │
│                                          │
│ Observer root (optional):               │
│ [.main-content                      ]   │
│                                          │
│ ℹ️  These apply to all changes below   │
└─────────────────────────────────────────┘
```

### 3. Pattern Examples Helper

Add a "Show examples" button that displays context-aware examples based on selected matchType:

**Path mode (default):**
```
Common Patterns:
• All product pages: /products/*
• Exact page: /checkout
• Multiple paths: /products/* or /shop/*
• ID-based URLs: /items/*/details
```

**Full URL mode:**
```
Common Patterns:
• Specific domain: https://shop.example.com/products/*
• With protocol: https://example.com/checkout
• Exact URL: https://example.com/page?id=123
```

**Domain mode:**
```
Common Patterns:
• Exact domain: shop.example.com
• All subdomains: *.example.com
• Multiple domains: example.com or example.net
```

**Query mode:**
```
Common Patterns:
• UTM source: *utm_source=email*
• Any query params: ?*
• Specific param: *id=123*
```

**Hash mode:**
```
Common Patterns:
• Exact hash: #section-about
• Hash prefix: #section-*
• Any hash: #*
```

### 4. Format Toggle

Allow users to toggle between formats:
```
Format: ⦿ New (with URL filtering)  ○ Legacy (simple array)
```

When toggling to legacy, warn if URL filters exist:
```
⚠️  Switching to legacy format will remove URL filters.
   Changes will apply on all pages. Continue?
   [Cancel] [Continue]
```

---

## TypeScript Types (For Reference)

```typescript
// URL Filter types
type URLFilter = string | string[] | URLFilterConfig;

interface URLFilterConfig {
  include?: string[];
  exclude?: string[];
  mode?: 'simple' | 'regex';
  matchType?: 'full-url' | 'path' | 'domain' | 'query' | 'hash';
}

// DOM Changes Config
interface DOMChangesConfig {
  changes: DOMChange[];
  urlFilter?: URLFilter;

  // Global defaults
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

// Union type (supports both formats)
type DOMChangesData = DOMChange[] | DOMChangesConfig;
```

---

## Questions?

For implementation details, see:
- `docs/URL_FILTERING_FEATURE.md` - Complete feature specification
- `src/utils/URLMatcher.ts` - URL matching implementation
- `src/utils/__tests__/URLMatcher.test.ts` - Test examples

For issues or questions, contact the SDK team.
