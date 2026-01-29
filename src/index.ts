import { DOMChangesPluginLite } from './core/DOMChangesPluginLite';
import { OverridesPlugin } from './overrides/OverridesPlugin';
import { BrowserCookieAdapter } from './overrides/BrowserCookieAdapter';
import { CookiePlugin } from './cookies/CookiePlugin';
import { WebVitalsPlugin } from './vitals/WebVitalsPlugin';
import { URLRedirectPlugin } from './url-redirect/URLRedirectPlugin';

// Re-export types for convenience
export * from './types';
export * from './overrides/types';
export * from './url-redirect/types';
export type { CookiePluginOptions } from './cookies/CookiePlugin';
export type { CookieOptions } from './cookies/cookieUtils';
export type { WebVitalsPluginOptions, Metric } from './vitals/WebVitalsPlugin';

// Export the plugin classes
// For backward compatibility, we export DOMChangesPlugin as an alias for DOMChangesPluginLite
// Users should choose either OverridesPluginLite OR OverridesPluginFull from the specific builds
export {
  DOMChangesPluginLite,
  DOMChangesPluginLite as DOMChangesPlugin, // Alias for backward compatibility
  OverridesPlugin, // Legacy export - this is the original full-featured version
  BrowserCookieAdapter,
  CookiePlugin,
  WebVitalsPlugin,
  URLRedirectPlugin,
};

// Export cookie utilities
export {
  getCookie,
  setCookie,
  deleteCookie,
  generateUniqueId,
  generateUUID,
  isLocalStorageAvailable,
} from './cookies/cookieUtils';

// Export override utilities
export {
  DEFAULT_OVERRIDE_COOKIE_NAME,
  DEFAULT_OVERRIDE_QUERY_PREFIX,
  getQueryStringOverrides,
  parseOverrideCookie,
  getCookieOverrides,
  serializeOverrides,
  persistOverridesToCookie,
  getOverrides,
} from './overrides/overridesUtils';
export type { SimpleOverride, OverrideOptions } from './overrides/overridesUtils';

// Export plugin registry utilities
export {
  registerPlugin,
  unregisterPlugin,
  isPluginRegistered,
  getRegisteredPlugins,
} from './utils/plugin-registry';
export type { PluginRegistry, PluginRegistryEntry } from './utils/plugin-registry';

// Export URL redirect utilities
export { URLRedirectExtractor } from './url-redirect/URLRedirectExtractor';
export { URLRedirectMatcher } from './url-redirect/URLRedirectMatcher';

// Default export for UMD builds (backward compatibility)
export default DOMChangesPluginLite;
