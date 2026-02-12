import { ABsmartlyContext, PluginRegistration } from '../types';
import { URLRedirectConfig, URLRedirectPluginConfig, RedirectMatch } from './types';
import { URLRedirectExtractor } from './URLRedirectExtractor';
import { URLRedirectMatcher } from './URLRedirectMatcher';
import { URLMatcher } from '../utils/URLMatcher';
import { logDebug } from '../utils/debug';
import { BUILD_VERSION } from '../generated/buildInfo';

export class URLRedirectPlugin {
  public static readonly VERSION: string = BUILD_VERSION;

  private config: Required<Omit<URLRedirectPluginConfig, 'onBeforeRedirect'>> & {
    onBeforeRedirect?: URLRedirectPluginConfig['onBeforeRedirect'];
  };
  private extractor: URLRedirectExtractor;
  private initialized = false;
  private readyPromise: Promise<RedirectMatch | null>;

  constructor(config: URLRedirectPluginConfig) {
    this.config = {
      context: config.context,
      variableName: config.variableName ?? '__url_redirect',
      debug: config.debug ?? false,
      autoApply: config.autoApply ?? true,
      useBeacon: config.useBeacon ?? true,
      onBeforeRedirect: config.onBeforeRedirect,
    };

    if (!this.config.context) {
      throw new Error('[ABsmartly URLRedirect] Context is required');
    }

    console.log(`[ABsmartly] URLRedirectPlugin v${URLRedirectPlugin.VERSION} initialized`);

    this.extractor = new URLRedirectExtractor(
      this.config.context,
      this.config.variableName,
      this.config.debug
    );

    this.readyPromise = this.config.context
      .ready()
      .then(() => {
        logDebug('[URLRedirectPlugin] Context is ready, checking for redirects');
        return this.initialize();
      })
      .catch(error => {
        logDebug('[URLRedirectPlugin] ERROR during initialization:', error);
        throw error;
      });
  }

  async ready(): Promise<RedirectMatch | null> {
    return this.readyPromise;
  }

  private async initialize(): Promise<RedirectMatch | null> {
    if (this.initialized) {
      logDebug('[URLRedirectPlugin] Already initialized');
      return null;
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    if (!currentUrl) {
      logDebug('[URLRedirectPlugin] No window.location available (server-side?)');
      this.initialized = true;
      return null;
    }

    if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Initializing', {
        version: URLRedirectPlugin.VERSION,
        currentUrl,
        autoApply: this.config.autoApply,
        useBeacon: this.config.useBeacon,
      });
    }

    const match = this.findRedirectMatch(currentUrl);

    this.initialized = true;
    this.registerWithContext();

    if (match && this.config.autoApply) {
      await this.executeRedirect(match);
    }

    return match;
  }

  findRedirectMatch(url: string = window.location.href): RedirectMatch | null {
    const allConfigs = this.extractor.extractAllConfigs();

    if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Checking redirects for URL:', url);
      logDebug(
        '[URLRedirectPlugin] Experiments with redirect configs:',
        Array.from(allConfigs.keys())
      );
    }

    for (const [experimentName, variantConfigs] of allConfigs) {
      const currentVariant = this.config.context.peek(experimentName);

      if (currentVariant === undefined || currentVariant === null) {
        continue;
      }

      const config = variantConfigs.get(currentVariant);

      if (!config) {
        if (currentVariant === 0) {
          const anyConfig = this.getAnyConfig(variantConfigs);
          if (anyConfig?.controlBehavior === 'redirect-same') {
            if (this.config.debug) {
              logDebug(
                `[URLRedirectPlugin] Control variant with redirect-same behavior for ${experimentName}`
              );
            }
            return {
              redirect: { from: url, to: url, type: 'page', preservePath: true },
              targetUrl: url,
              experimentName,
              variant: 0,
              isControl: true,
            };
          }
        }
        continue;
      }

      if (config.urlFilter && !URLMatcher.matches(config.urlFilter, url)) {
        if (this.config.debug) {
          logDebug(`[URLRedirectPlugin] URL doesn't match filter for ${experimentName}`);
        }
        continue;
      }

      const match = URLRedirectMatcher.findMatch(
        url,
        config.redirects,
        experimentName,
        currentVariant
      );

      if (match) {
        if (this.config.debug) {
          logDebug('[URLRedirectPlugin] Found redirect match:', {
            experimentName,
            variant: currentVariant,
            from: match.redirect.from,
            to: match.redirect.to,
            targetUrl: match.targetUrl,
          });
        }
        return match;
      }
    }

    return null;
  }

  private getAnyConfig(configs: Map<number, URLRedirectConfig>): URLRedirectConfig | null {
    for (const config of configs.values()) {
      return config;
    }
    return null;
  }

  async executeRedirect(match: RedirectMatch): Promise<void> {
    if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Executing redirect:', {
        experimentName: match.experimentName,
        targetUrl: match.targetUrl,
        isControl: match.isControl,
      });
    }

    if (this.config.onBeforeRedirect) {
      await this.config.onBeforeRedirect(match);
    }

    this.config.context.treatment(match.experimentName);

    try {
      if (this.config.useBeacon) {
        await this.publishViaBeacon();
      } else {
        await this.config.context.publish();
      }
    } catch (error) {
      logDebug('[URLRedirectPlugin] Failed to publish exposure:', error);
    }

    if (match.targetUrl !== window.location.href) {
      if (this.config.debug) {
        logDebug('[URLRedirectPlugin] Redirecting to:', match.targetUrl);
      }
      window.location.href = match.targetUrl;
    } else if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Target URL same as current, skipping redirect');
    }
  }

  private async publishViaBeacon(): Promise<void> {
    const context = this.config.context as ABsmartlyContext & {
      publish: (options?: { useBeacon?: boolean }) => Promise<void>;
    };

    if (typeof context.publish === 'function') {
      try {
        await context.publish({ useBeacon: true });
      } catch (error) {
        logDebug('[URLRedirectPlugin] Beacon publish failed, falling back to regular publish');
        await context.publish();
      }
    }
  }

  getExtractor(): URLRedirectExtractor {
    return this.extractor;
  }

  refreshExperiments(): void {
    this.extractor.clearCache();
    if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Cache cleared');
    }
  }

  destroy(): void {
    this.unregisterFromContext();
    this.initialized = false;
    if (this.config.debug) {
      logDebug('[URLRedirectPlugin] Destroyed');
    }
  }

  private registerWithContext(): void {
    const context = this.config.context as ABsmartlyContext;
    if (context) {
      if (!context.__plugins) {
        context.__plugins = {};
      }

      context.__plugins.urlRedirectPlugin = {
        name: 'URLRedirectPlugin',
        version: URLRedirectPlugin.VERSION,
        initialized: true,
        capabilities: ['redirect', 'domain-redirect', 'page-redirect'],
        instance: this,
        timestamp: Date.now(),
      } as PluginRegistration;

      if (this.config.debug) {
        logDebug('[URLRedirectPlugin] Registered with context at __plugins.urlRedirectPlugin');
      }
    }
  }

  private unregisterFromContext(): void {
    const context = this.config.context as ABsmartlyContext;
    if (context?.__plugins?.urlRedirectPlugin) {
      delete context.__plugins.urlRedirectPlugin;
      if (this.config.debug) {
        logDebug('[URLRedirectPlugin] Unregistered from context');
      }
    }
  }
}
