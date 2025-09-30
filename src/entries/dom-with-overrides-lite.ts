/**
 * Entry point for DOM Changes Plugin + Overrides Lite
 * Medium bundle - DOM manipulation + lightweight override detection
 */
import { DOMChangesPluginLite } from '../core/DOMChangesPluginLite';
import { OverridesPluginLite } from '../overrides/OverridesPluginLite';

// Re-export types
export * from '../types';
export * from '../overrides/types';

// Export the plugins
export { DOMChangesPluginLite, OverridesPluginLite };
export { DOMChangesPluginLite as DOMChangesPlugin }; // Alias for backward compatibility

// Default export for UMD builds
export default DOMChangesPluginLite;
