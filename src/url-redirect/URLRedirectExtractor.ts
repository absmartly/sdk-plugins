import { ABsmartlyContext, ContextData, ExperimentData } from '../types';
import { URLRedirectConfig, URLRedirect } from './types';
import { logDebug } from '../utils/debug';

export class URLRedirectExtractor {
  private context: ABsmartlyContext;
  private variableName: string;
  private debug: boolean;
  private cachedConfigs: Map<string, Map<number, URLRedirectConfig>> | null = null;

  constructor(context: ABsmartlyContext, variableName: string = '__url_redirect', debug = false) {
    this.context = context;
    this.variableName = variableName;
    this.debug = debug;
  }

  clearCache(): void {
    this.cachedConfigs = null;
  }

  extractAllConfigs(): Map<string, Map<number, URLRedirectConfig>> {
    if (this.cachedConfigs) {
      if (this.debug) {
        logDebug('[ABsmartly URLRedirectExtractor] Returning cached configs');
      }
      return this.cachedConfigs;
    }

    const allConfigs = new Map<string, Map<number, URLRedirectConfig>>();

    try {
      const contextData = this.context.data() as ContextData;

      if (this.debug) {
        logDebug('[ABsmartly URLRedirectExtractor] Extracting configs from context:', {
          hasData: !!contextData,
          experimentCount: contextData?.experiments?.length || 0,
        });
      }

      if (contextData?.experiments) {
        for (const experiment of contextData.experiments) {
          const variantConfigs = this.extractConfigsForExperiment(experiment);
          if (variantConfigs.size > 0) {
            allConfigs.set(experiment.name, variantConfigs);
            if (this.debug) {
              logDebug(
                `[ABsmartly URLRedirectExtractor] Experiment '${experiment.name}' has URL redirect configs:`,
                {
                  variantsWithConfigs: Array.from(variantConfigs.keys()),
                }
              );
            }
          }
        }
      }
    } catch (error) {
      logDebug('[ABsmartly URLRedirectExtractor] Error extracting configs:', error);
    }

    this.cachedConfigs = allConfigs;
    return allConfigs;
  }

  private extractConfigsForExperiment(experiment: ExperimentData): Map<number, URLRedirectConfig> {
    const variantConfigs = new Map<number, URLRedirectConfig>();

    if (!experiment.variants) {
      return variantConfigs;
    }

    for (let i = 0; i < experiment.variants.length; i++) {
      const variant = experiment.variants[i];
      if (!variant) continue;

      let redirectData = null;

      if (variant.config) {
        try {
          const parsedConfig =
            typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;

          if (parsedConfig && parsedConfig[this.variableName]) {
            redirectData = parsedConfig[this.variableName];
          }
        } catch (e) {
          logDebug(`[URLRedirectExtractor] Failed to parse variant.config for variant ${i}:`, e);
        }
      }

      if (redirectData) {
        const config = this.parseConfig(redirectData);
        if (config) {
          variantConfigs.set(i, config);
        }
      }
    }

    return variantConfigs;
  }

  private parseConfig(data: unknown): URLRedirectConfig | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (error) {
        logDebug('[ABsmartly URLRedirectExtractor] Failed to parse config JSON:', error);
        return null;
      }
    }

    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.redirects)) {
      return null;
    }

    const redirects: URLRedirect[] = [];

    for (const item of obj.redirects) {
      if (this.isValidRedirect(item)) {
        redirects.push({
          from: item.from,
          to: item.to,
          preservePath: item.preservePath ?? true,
          type: item.type,
        });
      } else if (this.debug) {
        logDebug('[ABsmartly URLRedirectExtractor] Invalid redirect:', item);
      }
    }

    if (redirects.length === 0) {
      return null;
    }

    return {
      redirects,
      urlFilter: obj.urlFilter as URLRedirectConfig['urlFilter'],
      controlBehavior:
        (obj.controlBehavior as URLRedirectConfig['controlBehavior']) || 'no-redirect',
    };
  }

  private isValidRedirect(item: unknown): item is URLRedirect {
    if (!item || typeof item !== 'object') return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.from === 'string' &&
      typeof obj.to === 'string' &&
      (obj.type === 'domain' || obj.type === 'page')
    );
  }

  getConfigForExperiment(experimentName: string): URLRedirectConfig | null {
    const allConfigs = this.extractAllConfigs();
    const experimentConfigs = allConfigs.get(experimentName);

    if (!experimentConfigs || experimentConfigs.size === 0) {
      return null;
    }

    const currentVariant = this.context.peek(experimentName);

    if (currentVariant === undefined || currentVariant === null) {
      if (this.debug) {
        logDebug(`[ABsmartly URLRedirectExtractor] No variant selected for ${experimentName}`);
      }
      return null;
    }

    return experimentConfigs.get(currentVariant) || null;
  }

  getAllVariantConfigs(experimentName: string): Map<number, URLRedirectConfig> {
    const allConfigs = this.extractAllConfigs();
    return allConfigs.get(experimentName) || new Map();
  }
}
