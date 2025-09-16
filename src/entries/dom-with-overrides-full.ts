/**
 * Entry point for DOM Changes Plugin + Overrides Full
 * Full bundle - DOM manipulation + full override capabilities with API support
 */
import { DOMChangesPlugin } from '../core/DOMChangesPlugin';
import { OverridesPluginFull } from '../overrides/OverridesPluginFull';
import { BrowserCookieAdapter } from '../overrides/BrowserCookieAdapter';
import { CookiePlugin } from '../cookies/CookiePlugin';
import { WebVitalsPlugin } from '../vitals/WebVitalsPlugin';

// Re-export types
export * from '../types';
export * from '../overrides/types';

// Export the plugins and adapter
export {
  DOMChangesPlugin,
  OverridesPluginFull,
  OverridesPluginFull as OverridesPlugin, // Alias for backward compatibility
  BrowserCookieAdapter,
  CookiePlugin,
  WebVitalsPlugin,
};

// Default export for UMD builds
export default DOMChangesPlugin;
