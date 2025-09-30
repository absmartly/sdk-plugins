/**
 * Entry point for DOM Changes Plugin only
 * Smallest bundle - just core DOM manipulation functionality
 */
import { DOMChangesPluginLite } from '../core/DOMChangesPluginLite';

// Re-export types for convenience
export * from '../types';

// Export only the DOM Changes Plugin Lite
export { DOMChangesPluginLite };
export { DOMChangesPluginLite as DOMChangesPlugin }; // Alias for backward compatibility

// Default export for UMD builds
export default DOMChangesPluginLite;
