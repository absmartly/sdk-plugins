/**
 * Entry point for CookiePlugin only
 * Standalone cookie management and tracking functionality
 */
import { CookiePlugin } from '../cookies/CookiePlugin';

// Re-export types
export type { CookiePluginOptions } from '../cookies/CookiePlugin';

// Export the plugin
export { CookiePlugin };

// Default export for UMD builds
export default CookiePlugin;
