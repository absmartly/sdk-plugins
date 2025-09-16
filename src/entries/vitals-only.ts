/**
 * Entry point for WebVitalsPlugin only
 * Standalone web vitals and page metrics tracking
 */
import { WebVitalsPlugin } from '../vitals/WebVitalsPlugin';

// Re-export types
export type { WebVitalsPluginOptions, Metric } from '../vitals/WebVitalsPlugin';

// Export the plugin
export { WebVitalsPlugin };

// Default export for UMD builds
export default WebVitalsPlugin;
