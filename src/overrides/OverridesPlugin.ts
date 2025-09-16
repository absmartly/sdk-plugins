/**
 * Full-featured version of OverridesPlugin
 * Extends OverridesPluginLite with API fetching for non-running experiments
 * Supports server-side rendering, cookie adapters, and dev environments
 */

import { OverridesPluginLite } from './OverridesPluginLite';
import {
  OverridesPluginConfig,
  CookieAdapter,
  CookieOptions,
  ParsedCookie,
  CookieOverrides,
  OverrideValue,
} from './types';

export class OverridesPlugin extends OverridesPluginLite {
  protected fullConfig: Required<Omit<OverridesPluginConfig, 'cookieName' | 'url' | 'cookieAdapter'>> & {
    cookieName?: string;
    url?: string | URL;
    cookieAdapter?: CookieAdapter;
  };
  protected isServerSide: boolean;
  private onExperimentsAddedCallbacks: Array<() => void> = [];

  constructor(config: OverridesPluginConfig) {
    // Pass a simplified config to the base class
    super({
      context: config.context,
      cookieName: config.cookieName,
      useQueryString: config.useQueryString ?? (typeof window !== 'undefined'),
      queryPrefix: config.queryPrefix ?? '_exp_',
      persistQueryToCookie: config.persistQueryToCookie ?? false,
      debug: config.debug ?? false,
    });

    if (!config.context) {
      throw new Error('[OverridesPlugin] Context is required');
    }

    // Detect environment
    this.isServerSide = typeof window === 'undefined';

    // Get SDK endpoint from context if not provided
    let sdkEndpoint = config.sdkEndpoint;
    if (!sdkEndpoint) {
      const contextInternal = config.context as any;
      if (contextInternal._endpoint) {
        sdkEndpoint = contextInternal._endpoint;
      } else if (contextInternal._config?.endpoint) {
        sdkEndpoint = contextInternal._config.endpoint;
      } else if (contextInternal._dataProvider?._endpoint) {
        sdkEndpoint = contextInternal._dataProvider._endpoint;
      } else if (contextInternal._options?.endpoint) {
        sdkEndpoint = contextInternal._options.endpoint.replace('/v1', '');
      }
    }

    // For the full plugin, we should have an endpoint available
    if (!sdkEndpoint && !config.absmartlyEndpoint) {
      // Try one more time to get from context
      const contextInternal = config.context as any;
      if (!contextInternal._endpoint &&
          !contextInternal._config?.endpoint &&
          !contextInternal._dataProvider?._endpoint &&
          !contextInternal._options?.endpoint) {
        throw new Error(
          '[OverridesPlugin] SDK endpoint must be provided if not available from context'
        );
      }
    }

    // Setup full configuration
    this.fullConfig = {
      context: config.context,
      cookieName: config.cookieName,
      cookieAdapter: config.cookieAdapter,
      cookieOptions: config.cookieOptions ?? { path: '/' },
      useQueryString: config.useQueryString ?? !this.isServerSide,
      queryPrefix: config.queryPrefix ?? '_exp_',
      envParam: config.envParam ?? 'env',
      persistQueryToCookie: config.persistQueryToCookie ?? false,
      url: config.url,
      absmartlyEndpoint: config.absmartlyEndpoint ?? '',
      sdkEndpoint: sdkEndpoint || '',
      domChangesFieldName: config.domChangesFieldName ?? '__dom_changes',
      debug: config.debug ?? false,
    };

    if (this.fullConfig.debug) {
      console.log('[OverridesPlugin] Initialized with config:', {
        isServerSide: this.isServerSide,
        cookieName: this.fullConfig.cookieName,
        useQueryString: this.fullConfig.useQueryString,
        queryPrefix: this.fullConfig.queryPrefix,
        envParam: this.fullConfig.envParam,
        persistQueryToCookie: this.fullConfig.persistQueryToCookie,
        sdkEndpoint: this.fullConfig.sdkEndpoint,
        absmartlyEndpoint: this.fullConfig.absmartlyEndpoint,
      });
    }
  }

  async initialize(): Promise<void> {
    // Skip if already initialized (from base class)
    if ((this as any).initialized) {
      if (this.fullConfig.debug) {
        console.log('[OverridesPlugin] Already initialized, skipping re-initialization');
      }
      return;
    }

    // Mark as initialized immediately to prevent concurrent calls
    (this as any).initialized = true;

    // Get overrides using enhanced parsing
    const overridesData = this.getOverrides();

    if (Object.keys(overridesData.overrides).length === 0) {
      if (this.fullConfig.debug) {
        console.log('[OverridesPlugin] No overrides found');
      }
      return;
    }

    // Apply overrides with API fetching
    await this.applyOverridesWithFetching(overridesData.overrides, overridesData.devEnv);
  }

  private getOverrides(): ParsedCookie {
    let overridesData: ParsedCookie = { overrides: {}, devEnv: null };

    // Try query string first if enabled
    if (this.fullConfig.useQueryString) {
      overridesData = this.getEnhancedQueryStringOverrides();

      // Persist to cookie if requested and we have overrides
      if (
        this.fullConfig.persistQueryToCookie &&
        this.fullConfig.cookieName &&
        Object.keys(overridesData.overrides).length > 0
      ) {
        this.persistEnhancedOverridesToCookie(overridesData);
      }
    }

    // Fall back to cookie if no query string overrides and cookies are enabled
    if (Object.keys(overridesData.overrides).length === 0 && this.fullConfig.cookieName) {
      overridesData = this.getEnhancedCookieOverrides();
    }

    return overridesData;
  }

  private getEnhancedQueryStringOverrides(): ParsedCookie {
    try {
      let urlParams: URLSearchParams;

      if (this.isServerSide) {
        // Server-side: use provided URL
        if (!this.fullConfig.url) {
          return { overrides: {}, devEnv: null };
        }
        const url =
          typeof this.fullConfig.url === 'string'
            ? new URL(this.fullConfig.url)
            : this.fullConfig.url;
        urlParams = new URLSearchParams(url.search);
      } else {
        // Client-side: use window.location
        urlParams = new URLSearchParams(window.location.search);
      }

      const overrides: CookieOverrides = {};
      let devEnv: string | null = null;

      // Get environment from query param
      if (this.fullConfig.envParam) {
        const env = urlParams.get(this.fullConfig.envParam);
        if (env) {
          devEnv = env;
        }
      }

      // Check for experiment parameters with prefix
      const prefix = this.fullConfig.queryPrefix;
      for (const [key, value] of urlParams.entries()) {
        if (key.startsWith(prefix)) {
          const experimentName = key.substring(prefix.length);
          if (experimentName) {
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

      if (this.fullConfig.debug && Object.keys(overrides).length > 0) {
        console.log('[OverridesPlugin] Query string overrides:', overrides, 'env:', devEnv);
      }

      return { overrides, devEnv };
    } catch (error) {
      console.error('[OverridesPlugin] Error parsing query string:', error);
      return { overrides: {}, devEnv: null };
    }
  }

  private getEnhancedCookieOverrides(): ParsedCookie {
    if (!this.fullConfig.cookieName) {
      return { overrides: {}, devEnv: null };
    }

    let cookieValue: string | null = null;

    if (this.fullConfig.cookieAdapter) {
      // Server-side or custom adapter
      cookieValue = this.fullConfig.cookieAdapter.get(this.fullConfig.cookieName);
    } else if (typeof document !== 'undefined') {
      // Client-side: read directly from document.cookie
      const nameEQ = this.fullConfig.cookieName + '=';
      const cookies = document.cookie.split(';');

      for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
          cookieValue = decodeURIComponent(cookie.substring(nameEQ.length));
          break;
        }
      }
    }

    return this.parseEnhancedCookieValue(cookieValue);
  }

  private parseEnhancedCookieValue(value: string | null): ParsedCookie {
    if (!value) return { overrides: {}, devEnv: null };

    try {
      let devEnv: string | null = null;
      let experimentsStr = value;

      // Check if dev environment is included
      if (value.startsWith('devEnv=')) {
        const parts = value.split('|');
        devEnv = decodeURIComponent(parts[0].substring(7));
        experimentsStr = parts[1] || '';
      }

      const overrides: CookieOverrides = {};
      if (experimentsStr) {
        const experiments = experimentsStr.split(',');

        for (const exp of experiments) {
          const [name, values] = exp.split(':');
          if (!name || !values) continue;

          const decodedName = decodeURIComponent(name);
          const parts = values.split('.');

          if (parts.length === 1) {
            overrides[decodedName] = parseInt(parts[0], 10);
          } else {
            overrides[decodedName] = {
              variant: parseInt(parts[0], 10),
              env: parts[1] ? parseInt(parts[1], 10) : undefined,
              id: parts[2] ? parseInt(parts[2], 10) : undefined,
            };
          }
        }
      }

      return { overrides, devEnv };
    } catch (error) {
      console.error('[OverridesPlugin] Error parsing overrides:', error);
      return { overrides: {}, devEnv: null };
    }
  }

  private persistEnhancedOverridesToCookie(data: ParsedCookie): void {
    if (!this.fullConfig.cookieName) return;

    const parts: string[] = [];

    // Add dev environment if present
    if (data.devEnv) {
      parts.push(`devEnv=${encodeURIComponent(data.devEnv)}`);
    }

    // Add experiments
    const expParts: string[] = [];
    for (const [name, value] of Object.entries(data.overrides)) {
      const encodedName = encodeURIComponent(name);
      if (typeof value === 'number') {
        expParts.push(`${encodedName}:${value}`);
      } else {
        const v = value as OverrideValue;
        let str = `${encodedName}:${v.variant}`;
        if (v.env !== undefined) str += `.${v.env}`;
        if (v.id !== undefined) str += `.${v.id}`;
        expParts.push(str);
      }
    }

    const cookieValue =
      parts.length > 0 ? `${parts.join('|')}|${expParts.join(',')}` : expParts.join(',');

    if (this.fullConfig.cookieAdapter) {
      // Server-side or custom adapter
      const options: CookieOptions = { ...this.fullConfig.cookieOptions };

      // Server-side defaults
      if (this.isServerSide) {
        if (options.httpOnly === undefined) {
          options.httpOnly = true;
        }
        if (options.secure === undefined) {
          options.secure = true;
        }
        if (options.sameSite === undefined) {
          options.sameSite = 'lax' as const;
        }
      }

      this.fullConfig.cookieAdapter.set(this.fullConfig.cookieName, cookieValue, options);
    } else if (typeof document !== 'undefined') {
      // Client-side: write directly to document.cookie
      const options = this.fullConfig.cookieOptions || {};
      let cookieString = `${this.fullConfig.cookieName}=${encodeURIComponent(cookieValue)}`;

      if (options.path) cookieString += `;path=${options.path}`;
      if (options.maxAge) cookieString += `;max-age=${options.maxAge}`;
      if ((options as any).expires) {
        const expiresDate =
          (options as any).expires instanceof Date
            ? (options as any).expires.toUTCString()
            : (options as any).expires;
        cookieString += `;expires=${expiresDate}`;
      }
      if (options.domain) cookieString += `;domain=${options.domain}`;
      if (options.secure) cookieString += ';secure';
      if (options.sameSite) cookieString += `;samesite=${options.sameSite}`;

      document.cookie = cookieString;
    }

    if (this.fullConfig.debug) {
      console.log('[OverridesPlugin] Persisted to cookie:', cookieValue);
    }
  }

  private async applyOverridesWithFetching(
    overrides: CookieOverrides,
    devEnv: string | null
  ): Promise<void> {
    // Log all overrides at initialization
    console.log('[OverridesPlugin] Initializing with overrides:', overrides);
    console.log('[OverridesPlugin] Dev environment:', devEnv);

    // Collect experiments that need to be fetched
    const devExperiments: Array<[string, OverrideValue]> = [];
    const apiExperimentIds: Set<number> = new Set();

    // Categorize experiments
    for (const [name, value] of Object.entries(overrides)) {
      const override = typeof value === 'number' ? { variant: value } : value;

      if (override.env === 1) {
        // Development environment experiment
        console.log(`[OverridesPlugin] ${name} categorized as DEV experiment (env=1)`);
        devExperiments.push([name, override]);
      } else if (override.env === 2 && override.id) {
        // Draft experiment with ID
        console.log(
          `[OverridesPlugin] ${name} categorized as DRAFT experiment (env=2, id=${override.id})`
        );
        apiExperimentIds.add(override.id);
      } else {
        // Running experiment (env=0 or undefined)
        console.log(
          `[OverridesPlugin] ${name} categorized as RUNNING experiment (env=${override.env || 0})`
        );
      }
    }

    // Log summary
    console.log('[OverridesPlugin] Categorization summary:', {
      total_overrides: Object.keys(overrides).length,
      dev_experiments: devExperiments.length,
      draft_experiments: apiExperimentIds.size,
      running_experiments:
        Object.keys(overrides).length - devExperiments.length - apiExperimentIds.size,
      dev_environment: devEnv,
    });

    // Fetch non-running experiments if needed
    if (apiExperimentIds.size > 0) {
      console.log(
        `[OverridesPlugin] Will fetch ${apiExperimentIds.size} DRAFT experiments from API`
      );
      await this.fetchFromAPI(Array.from(apiExperimentIds));
    }

    // Fetch dev experiments if needed
    if (devExperiments.length > 0 && devEnv) {
      console.log(
        `[OverridesPlugin] Will fetch ${devExperiments.length} DEV experiments for environment: ${devEnv}`
      );
      await this.fetchFromDevSDK(devExperiments, devEnv);
    } else if (devExperiments.length > 0) {
      console.log(
        `[OverridesPlugin] Have ${devExperiments.length} DEV experiments but NO devEnv specified - NOT fetching`
      );
    }

    // Apply all overrides to context
    for (const [experimentName, value] of Object.entries(overrides)) {
      const variant = typeof value === 'number' ? value : value.variant;
      this.fullConfig.context.override(experimentName, variant);

      if (this.fullConfig.debug) {
        console.log(`[OverridesPlugin] Override: ${experimentName} -> variant ${variant}`);
      }
    }
  }

  private async fetchFromAPI(experimentIds: number[]): Promise<void> {
    if (experimentIds.length === 0) {
      if (this.fullConfig.debug) {
        console.log('[OverridesPlugin] No experiment IDs to fetch from API');
      }
      return;
    }

    // Determine API endpoint
    let apiEndpoint = this.fullConfig.absmartlyEndpoint;
    if (!apiEndpoint) {
      // Default: convert SDK endpoint to API endpoint
      apiEndpoint = this.fullConfig.sdkEndpoint.replace('.absmartly.io', '.absmartly.com');
    }

    // Remove trailing /v1 if it exists to avoid double /v1/v1
    if (apiEndpoint.endsWith('/v1')) {
      apiEndpoint = apiEndpoint.slice(0, -3);
    }

    // Ensure https protocol
    if (!apiEndpoint.startsWith('http')) {
      apiEndpoint = `https://${apiEndpoint}`;
    }

    const apiUrl = `${apiEndpoint}/v1/experiments?ids=${experimentIds.join(',')}`;

    if (this.fullConfig.debug) {
      console.log('[OverridesPlugin] Fetching non-running experiments from API:', apiUrl);
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include', // Include cookies for authentication
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });

      console.log('[OverridesPlugin] API Response status:', response.status, response.statusText);

      if (!response.ok) {
        console.error(`[OverridesPlugin] API request failed with status ${response.status}`);
        if (response.status === 401) {
          console.error(
            '[OverridesPlugin] Check if you need to log in to the ABsmartly console first'
          );
        }
        return;
      }

      const data = await response.json();

      if (data.experiments) {
        // Inject experiments into context data
        this.injectExperimentsIntoContext(data.experiments);
        // Notify listeners
        this.notifyExperimentsAdded();
      }
    } catch (error) {
      console.error('[OverridesPlugin] Failed to fetch experiments from API:', error);
    }
  }

  private async fetchFromDevSDK(
    _experiments: Array<[string, OverrideValue]>,
    devEnv: string
  ): Promise<void> {
    let sdkEndpoint = this.fullConfig.sdkEndpoint;

    // Ensure https protocol
    if (!sdkEndpoint.startsWith('http')) {
      sdkEndpoint = `https://${sdkEndpoint}`;
    }

    // Construct dev environment SDK URL
    const devSdkUrl = `${sdkEndpoint}/context?environment=${encodeURIComponent(devEnv)}`;

    if (this.fullConfig.debug) {
      console.log('[OverridesPlugin] Fetching development experiments from SDK:', devSdkUrl);
    }

    try {
      const response = await fetch(devSdkUrl, {
        method: 'GET',
        credentials: 'include', // Include cookies for consistency
      });

      console.log(
        '[OverridesPlugin] DEV Response status:',
        response.status,
        response.statusText
      );

      if (!response.ok) {
        console.error(`[OverridesPlugin] DEV SDK request failed with status ${response.status}`);
        return;
      }

      const data = await response.json();

      if (data.experiments) {
        // Convert to array format and inject into context
        const experimentsArray = Object.entries(data.experiments).map(
          ([name, exp]: [string, any]) => ({
            ...exp,
            name,
          })
        );
        this.injectExperimentsIntoContext(experimentsArray);
        // Notify listeners
        this.notifyExperimentsAdded();
      }
    } catch (error) {
      console.error('[OverridesPlugin] Failed to fetch experiments from dev SDK:', error);
    }
  }

  private injectExperimentsIntoContext(experiments: any[]): void {
    // Get original context data
    const originalData = this.fullConfig.context.data.bind(this.fullConfig.context);

    // Create a map of experiment names to new experiment data
    const newExperimentsMap = new Map<string, any>();

    for (const experiment of experiments) {
      // Transform API experiment format to context format
      const contextExperiment: any = {
        id: experiment.id,
        name: experiment.name,
        unitType: experiment.unit_type?.name || 'user_id',
        iteration: experiment.iteration || 1,
        seedHi: 0,
        seedLo: 0,
        split: experiment.split || [],
        trafficSeedHi: 0,
        trafficSeedLo: 0,
        trafficSplit: [0, 1],
        fullOnVariant: 0,
        applications:
          experiment.applications?.map((app: any) => ({
            name: app.application?.name || app.name,
          })) || [],
        variants: [],
        audience: experiment.audience || '',
        audienceStrict: experiment.audience_strict || false,
      };

      // Process variants
      if (experiment.variants && Array.isArray(experiment.variants)) {
        for (let i = 0; i < experiment.variants.length; i++) {
          const variant = experiment.variants[i];
          const variantData: any = {
            name: variant.name || `Variant ${i}`,
            config: variant.config || '{}',
          };

          // Check if variant already has variables (from dev SDK)
          if (variant.variables) {
            variantData.variables = variant.variables;
          }
          // Otherwise try to parse from config (from API)
          else if (variant.config) {
            try {
              const config =
                typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;
              const domChangesField = this.fullConfig.domChangesFieldName;

              if (config[domChangesField]) {
                // Store in variables format that VariantExtractor expects
                variantData.variables = {
                  [domChangesField]: config[domChangesField],
                };
                console.log(
                  `[OverridesPlugin] Variant ${i} has DOM changes field '${domChangesField}'`
                );
              }
            } catch (e) {
              console.error(`[OverridesPlugin] Failed to parse variant config:`, e);
            }
          }

          contextExperiment.variants[i] = variantData;
        }
      }

      newExperimentsMap.set(experiment.name, contextExperiment);
    }

    // Override the context.data() method to include our experiments
    (this.fullConfig.context as any).data = () => {
      const data = originalData();
      if (!data) return data;

      // Merge experiments
      const existingExperiments = data.experiments || [];
      const existingNames = new Set(existingExperiments.map((exp: any) => exp.name));

      // Add new experiments that don't exist
      for (const [name, experiment] of newExperimentsMap) {
        if (!existingNames.has(name)) {
          existingExperiments.push(experiment);
        } else {
          // Replace existing experiment with fetched one
          const index = existingExperiments.findIndex((exp: any) => exp.name === name);
          if (index >= 0) {
            existingExperiments[index] = experiment;
          }
        }
      }

      return {
        ...data,
        experiments: existingExperiments,
      };
    };

    if (this.fullConfig.debug) {
      console.log(`[OverridesPlugin] Injected ${experiments.length} experiments into context`);
    }
  }

  // Register a callback to be called when experiments are added
  public onExperimentsAdded(callback: () => void): void {
    this.onExperimentsAddedCallbacks.push(callback);
  }

  private notifyExperimentsAdded(): void {
    if (this.fullConfig.debug) {
      console.log(
        `[OverridesPlugin] Notifying ${this.onExperimentsAddedCallbacks.length} listeners about new experiments`
      );
    }
    for (const callback of this.onExperimentsAddedCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('[OverridesPlugin] Error in experiments added callback:', error);
      }
    }
  }

  destroy(): void {
    super.destroy();
    this.onExperimentsAddedCallbacks = [];
  }
}