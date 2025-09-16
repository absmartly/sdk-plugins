/**
 * Entry point for DOM Changes Plugin + Overrides Lite
 * Medium bundle - DOM manipulation + lightweight override detection
 */
import { DOMChangesPlugin } from '../core/DOMChangesPlugin';
import { OverridesPluginLite } from '../overrides/OverridesPluginLite';

// Re-export types
export * from '../types';
export * from '../overrides/types';

// Export the plugins
export { DOMChangesPlugin, OverridesPluginLite };

// Default export for UMD builds
export default DOMChangesPlugin;
