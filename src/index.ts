import { DOMChangesPluginLite } from './core/DOMChangesPluginLite';
import { OverridesPlugin } from './overrides/OverridesPlugin';
import { BrowserCookieAdapter } from './overrides/BrowserCookieAdapter';
import { CookiePlugin } from './cookies/CookiePlugin';
import { WebVitalsPlugin } from './vitals/WebVitalsPlugin';

// Re-export types for convenience
export * from './types';
export * from './overrides/types';
export type { CookiePluginOptions } from './cookies/CookiePlugin';
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
};

// Default export for UMD builds (backward compatibility)
export default DOMChangesPluginLite;
