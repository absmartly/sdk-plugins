/**
 * Entry point for DOM Changes Plugin + Overrides Lite
 * Medium bundle - DOM manipulation + lightweight override detection
 */
import { DOMChangesPluginLite } from '../core/DOMChangesPluginLite';
import { OverridesPluginLite } from '../overrides/OverridesPluginLite';
import { CookiePlugin } from '../cookies/CookiePlugin';

// Re-export types
export * from '../types';
export * from '../overrides/types';
export type { CookiePluginOptions } from '../cookies/CookiePlugin';
export type { CookieOptions } from '../cookies/cookieUtils';

// Export the plugins
export { DOMChangesPluginLite, OverridesPluginLite, CookiePlugin };
export { DOMChangesPluginLite as DOMChangesPlugin }; // Alias for backward compatibility

// Export cookie utilities
export {
  getCookie,
  setCookie,
  deleteCookie,
  generateUniqueId,
  generateUUID,
  isLocalStorageAvailable,
} from '../cookies/cookieUtils';

// Export override utilities
export {
  getQueryStringOverrides,
  parseOverrideCookie,
  getCookieOverrides as getOverrideCookie,
  serializeOverrides,
  persistOverridesToCookie,
  getOverrides,
} from '../overrides/overridesUtils';
export type { SimpleOverride, OverrideOptions } from '../overrides/overridesUtils';

// Default export for UMD builds
export default DOMChangesPluginLite;
