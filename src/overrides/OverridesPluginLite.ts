import { logDebug } from '../utils/debug';
import { registerPlugin, unregisterPlugin } from '../utils/plugin-registry';
import {
  getQueryStringOverrides as getQueryStringOverridesUtil,
  getCookieOverrides as getCookieOverridesUtil,
  serializeOverrides,
  persistOverridesToCookie as persistOverridesToCookieUtil,
  SimpleOverride,
} from './overridesUtils';

/**
 * Lightweight client-side version of OverridesPlugin
 * Minimal code for production websites - handles cookie and query string parsing
 * No API fetching, no dev environment support to keep bundle size small
 */

interface ABSmartlyContextLite {
  override?: (experimentName: string, variant: number) => void;
  __plugins?: Record<string, unknown>;
}

interface LiteConfig {
  context: ABSmartlyContextLite;
  cookieName?: string;
  useQueryString?: boolean;
  queryPrefix?: string;
  persistQueryToCookie?: boolean;
  debug?: boolean;
}

export class OverridesPluginLite {
  private config: Required<LiteConfig>;
  protected initialized = false;

  constructor(config: LiteConfig) {
    if (!config.context) {
      throw new Error('[OverridesPluginLite] Context is required');
    }

    this.config = {
      context: config.context,
      cookieName: config.cookieName ?? 'absmartly_overrides',
      useQueryString: config.useQueryString ?? true,
      queryPrefix: config.queryPrefix ?? 'exp_',
      persistQueryToCookie: config.persistQueryToCookie ?? false,
      debug: config.debug ?? false,
    };

    if (this.config.debug) {
      logDebug('[OverridesPluginLite] Initialized with config:', {
        cookieName: this.config.cookieName,
        useQueryString: this.config.useQueryString,
        queryPrefix: this.config.queryPrefix,
      });
    }
  }

  async ready(): Promise<void> {
    if (this.initialized) {
      if (this.config.debug) {
        logDebug('[OverridesPluginLite] Already initialized');
      }
      return;
    }

    this.initialized = true;

    // Register with context
    this.registerWithContext();
    this.registerGlobally();

    let overrides: Record<string, number | SimpleOverride> = {};

    // Try query string first if enabled
    if (this.config.useQueryString && typeof window !== 'undefined') {
      overrides = this.getQueryStringOverrides();

      // Persist to cookie if requested and we have overrides
      if (
        this.config.persistQueryToCookie &&
        this.config.cookieName &&
        Object.keys(overrides).length > 0
      ) {
        this.persistOverridesToCookie(overrides);
      }
    }

    // Fall back to cookie if no query string overrides
    if (Object.keys(overrides).length === 0 && this.config.cookieName) {
      overrides = this.getCookieOverrides();
    }

    if (Object.keys(overrides).length === 0) {
      if (this.config.debug) {
        logDebug('[OverridesPluginLite] No overrides found');
      }
      return;
    }

    // Apply overrides to context
    for (const [experimentName, value] of Object.entries(overrides)) {
      const variant = typeof value === 'number' ? value : value.variant;

      // Skip if variant is not a valid number
      if (isNaN(variant)) {
        if (this.config.debug) {
          logDebug(
            `[OverridesPluginLite] Skipping invalid variant for ${experimentName}: ${variant}`
          );
        }
        continue;
      }

      this.config.context.override?.(experimentName, variant);

      if (this.config.debug) {
        logDebug(`[OverridesPluginLite] Override: ${experimentName} -> variant ${variant}`);
      }
    }
  }

  // Alias for backwards compatibility
  async initialize(): Promise<void> {
    return this.ready();
  }

  private getQueryStringOverrides(): Record<string, number | SimpleOverride> {
    if (typeof window === 'undefined' || !window.location) return {};

    const overrides = getQueryStringOverridesUtil(this.config.queryPrefix);

    if (this.config.debug && Object.keys(overrides).length > 0) {
      logDebug('[OverridesPluginLite] Query string overrides:', overrides);
    }

    return overrides;
  }

  private getCookieOverrides(): Record<string, number | SimpleOverride> {
    if (typeof document === 'undefined') return {};

    return getCookieOverridesUtil(this.config.cookieName);
  }

  private persistOverridesToCookie(overrides: Record<string, number | SimpleOverride>): void {
    if (!this.config.cookieName || typeof document === 'undefined') return;

    persistOverridesToCookieUtil(overrides, { cookieName: this.config.cookieName });

    if (this.config.debug) {
      const cookieValue = serializeOverrides(overrides);
      logDebug('[OverridesPluginLite] Persisted to cookie:', cookieValue);
    }
  }

  protected registerWithContext(): void {
    if (this.config.context) {
      // Ensure __plugins object exists
      if (!this.config.context.__plugins) {
        this.config.context.__plugins = {};
      }

      // Register under standardized __plugins structure
      this.config.context.__plugins.overridesPlugin = {
        name: 'OverridesPluginLite',
        version: '1.0.0',
        initialized: true,
        capabilities: ['cookie-overrides', 'query-overrides'],
        instance: this,
        timestamp: Date.now(),
      };

      if (this.config.debug) {
        logDebug('[OverridesPluginLite] Registered with context at __plugins.overridesPlugin');
      }
    }
  }

  protected unregisterFromContext(): void {
    if (this.config.context?.__plugins?.overridesPlugin) {
      delete this.config.context.__plugins.overridesPlugin;

      if (this.config.debug) {
        logDebug('[OverridesPluginLite] Unregistered from context');
      }
    }
  }

  destroy(): void {
    this.initialized = false;
    this.unregisterFromContext();
    this.unregisterGlobally();
  }

  /**
   * Register plugin in global registry for detection
   */
  protected registerGlobally(): void {
    registerPlugin('overrides', {
      name: 'OverridesPluginLite',
      version: '1.0.0',
      initialized: true,
      timestamp: Date.now(),
      capabilities: ['cookie-overrides', 'query-overrides'],
      instance: this,
    });

    if (this.config.debug) {
      logDebug('[OverridesPluginLite] Registered in global window.__ABSMARTLY_PLUGINS__');
    }
  }

  /**
   * Unregister plugin from global registry
   */
  protected unregisterGlobally(): void {
    unregisterPlugin('overrides');

    if (this.config.debug) {
      logDebug('[OverridesPluginLite] Unregistered from global registry');
    }
  }
}
