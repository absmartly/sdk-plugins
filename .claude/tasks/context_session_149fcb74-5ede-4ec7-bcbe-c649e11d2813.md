# URL Redirect Plugin Implementation

## Session ID: 149fcb74-5ede-4ec7-bcbe-c649e11d2813

## Overview
Implementation of URL redirect functionality for ABsmartly A/B testing, supporting both domain-level and page-level redirects.

## Completed Work

### 1. URL Redirect Plugin in absmartly-sdk-plugins

Created the following files:

#### Core Files
- `src/url-redirect/types.ts` - Type definitions
  - `URLRedirect` - Individual redirect configuration
  - `URLRedirectConfig` - Full config with redirects array, urlFilter, controlBehavior
  - `RedirectMatch` - Match result with targetUrl, experimentName, variant
  - `URLRedirectPluginConfig` - Plugin initialization options

- `src/url-redirect/URLRedirectMatcher.ts` - URL matching logic
  - `findMatch()` - Find first matching redirect for a URL
  - `matchDomainRedirect()` - Match by origin, preserve path/query/hash
  - `matchPageRedirect()` - Match by exact pathname
  - `buildTargetUrl()` - Utility to build target URL

- `src/url-redirect/URLRedirectExtractor.ts` - Extract configs from context
  - `extractAllConfigs()` - Get all redirect configs from experiments
  - `getConfigForExperiment()` - Get config for specific experiment/variant
  - `getAllVariantConfigs()` - Get all variants for an experiment
  - Validates redirect structure and caches results

- `src/url-redirect/URLRedirectPlugin.ts` - Main plugin class
  - Auto-initializes on context.ready()
  - `findRedirectMatch()` - Find matching redirect for current URL
  - `executeRedirect()` - Call treatment(), publish, and redirect
  - `onBeforeRedirect` callback support
  - `useBeacon` option for reliable tracking before redirect
  - Registers at `context.__plugins.urlRedirectPlugin`

- `src/url-redirect/index.ts` - Module exports

#### Test Files
- `src/url-redirect/__tests__/URLRedirectMatcher.test.ts`
- `src/url-redirect/__tests__/URLRedirectExtractor.test.ts`
- `src/url-redirect/__tests__/URLRedirectPlugin.test.ts`

All 57 URL redirect tests pass, plus 580 total tests in the suite.

### Key Features
1. **Domain Redirects** - Change domain while preserving path, query, hash
2. **Page Redirects** - Redirect specific pages to new paths
3. **preservePath** option - Control whether to preserve URL structure
4. **urlFilter** - Limit redirect to specific URL patterns
5. **controlBehavior** - `redirect-same` for performance parity testing
6. **Exposure Tracking** - Calls `treatment()` before redirect
7. **Beacon Support** - Use sendBeacon for reliable tracking

### Variable Format (`__url_redirect`)
```json
{
  "redirects": [
    {
      "from": "https://old.example.com",
      "to": "https://new.example.com",
      "type": "domain",
      "preservePath": true
    }
  ],
  "urlFilter": {
    "include": ["/specific/*"],
    "matchType": "path"
  },
  "controlBehavior": "redirect-same"
}
```

## Remaining Work

### 2. Integration in absmartly-managed-component
- Add URL redirect handling in the managed component
- Server-side redirect support for reverse proxy mode

### 3. Implementation in reverse-proxy-worker
- Server-side URL rewriting
- Transparent redirects where browser URL stays the same

## Notes
- SendBeacon support for exposure tracking before redirect will be implemented in a separate session
- The plugin supports both client-side redirects and can be integrated with server-side reverse proxy
