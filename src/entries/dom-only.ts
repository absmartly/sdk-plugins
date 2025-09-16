/**
 * Entry point for DOM Changes Plugin only
 * Smallest bundle - just core DOM manipulation functionality
 */
import { DOMChangesPlugin } from '../core/DOMChangesPlugin';

// Re-export types for convenience
export * from '../types';

// Export only the DOM Changes Plugin
export { DOMChangesPlugin };

// Default export for UMD builds
export default DOMChangesPlugin;
