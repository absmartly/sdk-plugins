import { logDebug } from '../utils/debug';
/**
 * Lightweight client-side version of OverridesPlugin
 * Minimal code for production websites - handles cookie and query string parsing
 * No API fetching, no dev environment support to keep bundle size small
 */

interface SimpleOverride {
  variant: number;
  env?: number;
  id?: number;
}

interface LiteConfig {
  context: any;
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
      queryPrefix: config.queryPrefix ?? '_exp_',
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
      this.config.context.override(experimentName, variant);

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

    const urlParams = new URLSearchParams(window.location.search);
    const overrides: Record<string, number | SimpleOverride> = {};
    const prefix = this.config.queryPrefix;

    // Check for experiment parameters with prefix
    for (const [key, value] of urlParams.entries()) {
      if (key.startsWith(prefix)) {
        const experimentName = key.substring(prefix.length);
        if (experimentName) {
          // Parse value as variant[,env][,id]
          const parts = value.split(',');
          const variant = parseInt(parts[0], 10);

          if (!isNaN(variant)) {
            if (parts.length === 1) {
              overrides[experimentName] = variant;
            } else {
              overrides[experimentName] = {
                variant,
                env: parts[1] ? parseInt(parts[1], 10) : undefined,
                id: parts[2] ? parseInt(parts[2], 10) : undefined,
              };
            }
          }
        }
      }
    }

    if (this.config.debug && Object.keys(overrides).length > 0) {
      logDebug('[OverridesPluginLite] Query string overrides:', overrides);
    }

    return overrides;
  }

  private getCookieOverrides(): Record<string, number | SimpleOverride> {
    if (typeof document === 'undefined') return {};

    const nameEQ = this.config.cookieName + '=';
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        const value = decodeURIComponent(cookie.substring(nameEQ.length));
        return this.parseCookieValue(value);
      }
    }

    return {};
  }

  private parseCookieValue(value: string): Record<string, number | SimpleOverride> {
    if (!value) return {};

    const overrides: Record<string, number | SimpleOverride> = {};

    // Skip dev environment if present (Lite doesn't handle it)
    let experimentsStr = value;
    if (value.includes('|')) {
      const parts = value.split('|');
      // Take the last part which has the experiments
      experimentsStr = parts[parts.length - 1];
    }

    if (!experimentsStr) return {};

    // Parse comma-separated experiments
    const experiments = experimentsStr.split(',');

    for (const exp of experiments) {
      const [name, values] = exp.split(':');
      if (!name || !values) continue;

      const decodedName = decodeURIComponent(name);

      // Parse dot-separated values (variant.env.id)
      const parts = values.split('.');
      const variant = parseInt(parts[0], 10);

      if (!isNaN(variant)) {
        if (parts.length === 1) {
          overrides[decodedName] = variant;
        } else {
          overrides[decodedName] = {
            variant,
            env: parts[1] ? parseInt(parts[1], 10) : undefined,
            id: parts[2] ? parseInt(parts[2], 10) : undefined,
          };
        }
      }
    }

    return overrides;
  }

  private persistOverridesToCookie(overrides: Record<string, number | SimpleOverride>): void {
    if (!this.config.cookieName || typeof document === 'undefined') return;

    const parts: string[] = [];
    for (const [name, value] of Object.entries(overrides)) {
      const encodedName = encodeURIComponent(name);
      if (typeof value === 'number') {
        parts.push(`${encodedName}:${value}`);
      } else {
        let str = `${encodedName}:${value.variant}`;
        if (value.env !== undefined) str += `.${value.env}`;
        if (value.id !== undefined) str += `.${value.id}`;
        parts.push(str);
      }
    }

    const cookieValue = parts.join(',');
    const maxAge = 86400; // 1 day
    document.cookie = `${this.config.cookieName}=${encodeURIComponent(
      cookieValue
    )};path=/;max-age=${maxAge}`;

    if (this.config.debug) {
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
  }
}
