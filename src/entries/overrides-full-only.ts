/**
 * Entry point for Overrides Full Plugin only
 * Full override capabilities with API support, no DOM manipulation
 */
import { OverridesPluginFull } from '../overrides/OverridesPluginFull';
import { BrowserCookieAdapter } from '../overrides/BrowserCookieAdapter';
import { CookiePlugin } from '../cookies/CookiePlugin';

// Re-export types
export * from '../overrides/types';

// Export the plugin and adapter
export {
  OverridesPluginFull,
  OverridesPluginFull as OverridesPlugin, // Alias for backward compatibility
  BrowserCookieAdapter,
  CookiePlugin,
};

// Default export for UMD builds
export default OverridesPluginFull;
