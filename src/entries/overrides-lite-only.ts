/**
 * Entry point for Overrides Lite Plugin only
 * Minimal bundle - just lightweight override detection and application
 */
import { OverridesPluginLite } from '../overrides/OverridesPluginLite';

// Re-export types
export * from '../overrides/types';

// Export only the plugin
export { OverridesPluginLite };

// Default export for UMD builds
export default OverridesPluginLite;
