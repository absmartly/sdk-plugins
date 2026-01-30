/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DOMChange,
  ContextData,
  ABsmartlyContext,
  ExperimentData,
  DOMChangesData,
  DOMChangesConfig,
  RawInjectionData,
  InjectionDataWithFilter,
} from '../types';
import { logDebug } from '../utils/debug';
import { URLMatcher } from '../utils/URLMatcher';

export class VariantExtractor {
  private context: ABsmartlyContext;
  private variableName: string;
  private debug: boolean;
  private cachedAllChanges: Map<string, Map<number, DOMChange[]>> | null = null;

  constructor(context: ABsmartlyContext, variableName: string = '__dom_changes', debug = false) {
    this.context = context;
    this.variableName = variableName;
    this.debug = debug;
  }

  // Clear cache when context changes
  clearCache(): void {
    this.cachedAllChanges = null;
  }

  // Extract ALL variants for ALL experiments (efficient single pass)
  extractAllChanges(): Map<string, Map<number, DOMChange[]>> {
    // Return cached version if available
    if (this.cachedAllChanges) {
      if (this.debug) {
        logDebug('[ABsmartly VariantExtractor] Returning cached changes');
      }
      return this.cachedAllChanges;
    }

    const allChanges = new Map<string, Map<number, DOMChange[]>>();

    try {
      const contextData = this.context.data() as ContextData;

      // Always log the raw context data structure for debugging
      logDebug('[VariantExtractor DEBUG] Raw context data structure:', {
        hasData: !!contextData,
        contextKeys: contextData ? Object.keys(contextData) : [],
        experimentCount: contextData?.experiments?.length || 0,
        firstExperiment: contextData?.experiments?.[0]
          ? {
              name: contextData.experiments[0].name,
              // id: contextData.experiments[0].id, // id field might not exist
              variantCount: contextData.experiments[0].variants?.length || 0,
              firstVariantStructure: contextData.experiments[0].variants?.[0]
                ? Object.keys(contextData.experiments[0].variants[0])
                : [],
            }
          : null,
        rawContextData: JSON.stringify(contextData).substring(0, 500) + '...',
      });

      if (this.debug) {
        logDebug('[ABsmartly VariantExtractor] Extracting changes from context:', {
          hasData: !!contextData,
          experimentCount: contextData?.experiments?.length || 0,
        });
      }

      // Extract from SDK context data
      if (contextData?.experiments) {
        if (this.debug) {
          logDebug(
            '[ABsmartly VariantExtractor] Available experiments:',
            contextData.experiments.map((exp: any) => ({
              name: exp.name,
              // id: exp.id, // id field might not exist
              hasVariants: !!exp.variants,
              variantCount: exp.variants?.length || 0,
            }))
          );
        }

        for (const experiment of contextData.experiments) {
          const variantChanges = this.extractAllVariantsForExperiment(experiment);
          if (variantChanges.size > 0) {
            allChanges.set(experiment.name, variantChanges);
            if (this.debug) {
              logDebug(
                `[ABsmartly VariantExtractor] Experiment '${experiment.name}' has DOM changes:`,
                {
                  variantsWithChanges: Array.from(variantChanges.keys()),
                  changesByVariant: Array.from(variantChanges.entries()).map(([v, changes]) => ({
                    variant: v,
                    changeCount: changes.length,
                    changeTypes: [...new Set(changes.map(c => c.type))],
                  })),
                }
              );
            }
          } else if (this.debug) {
            logDebug(
              `[ABsmartly VariantExtractor] Experiment '${experiment.name}' has no DOM changes`
            );
          }
        }
      }

      // No need to check window storage - experiments are now injected into context data
    } catch (error) {
      logDebug('[ABsmartly] Error extracting DOM changes:', error);
    }

    // Cache the result
    this.cachedAllChanges = allChanges;
    return allChanges;
  }

  // Extract all variants for a single experiment
  private extractAllVariantsForExperiment(experiment: ExperimentData): Map<number, DOMChange[]> {
    const variantChanges = new Map<number, DOMChange[]>();

    logDebug(
      `[DEBUG] Processing experiment: ${experiment.name} with ${experiment.variants?.length || 0} variants`
    );

    if (!experiment.variants) {
      logDebug(`[DEBUG] No variants found for experiment: ${experiment.name}`);
      return variantChanges;
    }

    for (let i = 0; i < experiment.variants.length; i++) {
      const variant = experiment.variants[i];
      if (!variant) continue;

      let changesData = null;

      // Check variant.config (ABSmartly SDK provides data here as a JSON string)
      if (variant.config) {
        try {
          // Parse config as JSON if it's a string
          const parsedConfig =
            typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;

          logDebug(
            `[VariantExtractor DEBUG] [${experiment.name}] Parsed config for variant ${i}:`,
            parsedConfig
          );

          // Look for __dom_changes inside the parsed config
          if (parsedConfig && parsedConfig[this.variableName]) {
            changesData = parsedConfig[this.variableName];
            logDebug(
              `[VariantExtractor DEBUG] [${experiment.name}] ✓ Found DOM changes in config[${this.variableName}]:`,
              changesData
            );
          } else {
            logDebug(
              `[VariantExtractor DEBUG] [${experiment.name}] ✗ No ${this.variableName} field found in parsed config for variant ${i}`
            );
          }
        } catch (e) {
          logDebug(
            `[VariantExtractor DEBUG] [${experiment.name}] ✗ Failed to parse variant.config for variant ${i}:`,
            e,
            'Raw config:',
            typeof variant.config === 'string' ? variant.config.substring(0, 100) : ''
          );
        }
      } else {
        logDebug(
          `[VariantExtractor DEBUG] [${experiment.name}] ✗ No config field found for variant ${i}`
        );
      }

      if (changesData) {
        // Extract changes - handles both legacy array and new wrapped format
        const changes = this.extractChangesFromData(changesData);
        if (changes && changes.length > 0) {
          variantChanges.set(i, changes);
        }
      }
    }

    return variantChanges;
  }

  /**
   * Extract changes from DOMChangesData (handles both legacy array and new wrapped format)
   */
  private extractChangesFromData(data: unknown): DOMChange[] | null {
    if (!data) {
      return null;
    }

    // If it's a string, try to parse it as JSON first
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (error) {
        logDebug('[ABsmartly] Failed to parse DOM changes JSON:', error);
        return null;
      }
    }

    // Check if it's the new wrapped format (DOMChangesConfig)
    if (data && typeof data === 'object' && !Array.isArray(data) && 'changes' in data) {
      const config = data as DOMChangesConfig;
      return this.parseChanges(config.changes);
    }

    // Legacy array format
    return this.parseChanges(data);
  }

  getExperimentChanges(experimentName: string): DOMChange[] | null {
    const allChanges = this.extractAllChanges();
    const experimentVariants = allChanges.get(experimentName);

    if (!experimentVariants || experimentVariants.size === 0) {
      return null;
    }

    const currentVariant = this.context.peek(experimentName);

    if (currentVariant === undefined || currentVariant === null) {
      if (this.debug) {
        logDebug(`[ABsmartly] No variant selected for ${experimentName}`);
      }
      return null;
    }

    return experimentVariants.get(currentVariant) || null;
  }

  private parseChanges(changesData: unknown): DOMChange[] | null {
    if (!changesData) {
      return null;
    }

    // If it's a string, try to parse it as JSON
    if (typeof changesData === 'string') {
      try {
        changesData = JSON.parse(changesData);
      } catch (error) {
        logDebug('[ABsmartly] Failed to parse DOM changes JSON:', error);
        return null;
      }
    }

    // Ensure it's an array
    if (!Array.isArray(changesData)) {
      if (this.debug) {
        logDebug('[ABsmartly] DOM changes data is not an array');
      }
      return null;
    }

    // Validate and filter changes
    const validChanges: DOMChange[] = [];

    for (const change of changesData) {
      if (this.isValidChange(change)) {
        validChanges.push(change);
      } else if (this.debug) {
        logDebug('[ABsmartly] Invalid DOM change:', change);
      }
    }

    return validChanges.length > 0 ? validChanges : null;
  }

  private isValidChange(change: unknown): change is DOMChange {
    if (!change || typeof change !== 'object') {
      return false;
    }

    const obj = change as Record<string, unknown>;

    // Check required fields
    // Note: selector can be empty string for 'create' and 'styleRules' types
    if (obj.selector === undefined || obj.selector === null || !obj.type) {
      return false;
    }

    // Check type is valid
    const validTypes = [
      'text',
      'html',
      'style',
      'class',
      'attribute',
      'javascript',
      'move',
      'create',
      'delete',
      'styleRules',
    ];
    if (!validTypes.includes(obj.type as string)) {
      return false;
    }

    // Type-specific validation
    switch (obj.type) {
      case 'class':
        if (!obj.add && !obj.remove) {
          return false;
        }
        if (obj.add && !Array.isArray(obj.add)) {
          return false;
        }
        if (obj.remove && !Array.isArray(obj.remove)) {
          return false;
        }
        break;

      case 'move':
        if (!obj.targetSelector) {
          return false;
        }
        break;

      case 'create':
        if (!obj.element || !obj.targetSelector) {
          return false;
        }
        break;

      case 'style':
      case 'attribute':
        if (!obj.value || typeof obj.value !== 'object') {
          return false;
        }
        break;
    }

    return true;
  }

  /**
   * Get all variant changes for an experiment (not just the current variant)
   * This is needed for proper exposure tracking across variants
   */
  getAllVariantChanges(experimentName: string): DOMChange[][] {
    const allChanges = this.extractAllChanges();
    const experimentVariants = allChanges.get(experimentName);

    if (!experimentVariants) {
      return [];
    }

    // Convert Map to array indexed by variant number
    const maxVariant = Math.max(...experimentVariants.keys());
    const variantArray: DOMChange[][] = [];

    for (let i = 0; i <= maxVariant; i++) {
      variantArray.push(experimentVariants.get(i) || []);
    }

    return variantArray;
  }

  /**
   * Get the experiment data by name
   * Note: This requires the context to be ready, otherwise it will throw
   */
  getExperiment(experimentName: string): ExperimentData | null {
    try {
      const contextData = this.context.data() as ContextData;

      if (!contextData || !contextData.experiments) {
        return null;
      }

      return contextData.experiments.find(exp => exp.name === experimentName) || null;
    } catch (error) {
      if (this.debug) {
        logDebug(
          `[ABsmartly VariantExtractor] Failed to get experiment '${experimentName}' - context may not be ready:`,
          error
        );
      }
      return null;
    }
  }

  /**
   * Get the raw DOMChangesData for all variants of an experiment (includes URL filters and metadata)
   * This is needed for URL filtering logic
   */
  getAllVariantsData(experimentName: string): Map<number, DOMChangesData> {
    const variantsData = new Map<number, DOMChangesData>();

    try {
      const contextData = this.context.data() as ContextData;

      if (!contextData?.experiments) {
        return variantsData;
      }

      const experiment = contextData.experiments.find(exp => exp.name === experimentName);

      if (!experiment?.variants) {
        return variantsData;
      }

      for (let i = 0; i < experiment.variants.length; i++) {
        const variant = experiment.variants[i];
        if (!variant) continue;

        let changesData = null;

        // First check variant.variables
        if (variant.variables && variant.variables[this.variableName]) {
          changesData = variant.variables[this.variableName];
        }
        // Then check variant.config
        else if (variant.config) {
          try {
            const config =
              typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;

            if (config && config[this.variableName]) {
              changesData = config[this.variableName];
            }
          } catch (e) {
            logDebug('[VariantExtractor] Failed to parse variant.config:', e);
          }
        }

        if (changesData) {
          // Parse JSON string if needed
          if (typeof changesData === 'string') {
            try {
              changesData = JSON.parse(changesData);
            } catch (error) {
              logDebug('[ABsmartly] Failed to parse DOM changes JSON:', error);
              continue;
            }
          }

          // Store the raw data (could be array or wrapped format)
          variantsData.set(i, changesData as DOMChangesData);
        }
      }
    } catch (error) {
      logDebug('[ABsmartly] Error getting all variants data:', error);
    }

    return variantsData;
  }

  /**
   * Check if any variant of an experiment has changes that match the current URL
   * This is critical for SRM prevention - if ANY variant matches URL, ALL variants must be tracked
   */
  anyVariantMatchesURL(experimentName: string, url: string = window.location.href): boolean {
    const variantsData = this.getAllVariantsData(experimentName);

    let hasAnyURLFilter = false;

    for (const [, data] of variantsData) {
      // Check if this variant has URL filter in wrapped format
      if (data && typeof data === 'object' && !Array.isArray(data) && 'urlFilter' in data) {
        const config = data as DOMChangesConfig;
        if (config.urlFilter) {
          hasAnyURLFilter = true;
          if (URLMatcher.matches(config.urlFilter, url)) {
            return true; // At least one variant matches this URL
          }
        }
      }
      // Note: Legacy array format or wrapped format without urlFilter doesn't affect matching
      // We only check URL filters that exist
    }

    // If NO variant has a URL filter, match all URLs (legacy behavior)
    // If at least one variant has a URL filter, we checked them all above
    return !hasAnyURLFilter;
  }

  /**
   * Extract __inject_html from all variants for all experiments
   * Checks both variant.variables and variant.config
   */
  extractAllInjectHTML(): Map<string, Map<number, InjectionDataWithFilter>> {
    const allInjectHTML = new Map<string, Map<number, InjectionDataWithFilter>>();

    try {
      const contextData = this.context.data() as ContextData;

      if (this.debug) {
        logDebug('[ABsmartly VariantExtractor] Extracting __inject_html from context');
      }

      if (contextData?.experiments) {
        for (const experiment of contextData.experiments) {
          const variantInjections = this.extractInjectHTMLForExperiment(experiment);
          if (variantInjections.size > 0) {
            allInjectHTML.set(experiment.name, variantInjections);
            if (this.debug) {
              logDebug(
                `[ABsmartly VariantExtractor] Experiment '${experiment.name}' has HTML injections:`,
                {
                  variantsWithInjections: Array.from(variantInjections.keys()),
                }
              );
            }
          }
        }
      }
    } catch (error) {
      logDebug('[ABsmartly] Error extracting __inject_html:', error);
    }

    return allInjectHTML;
  }

  /**
   * Extract __inject_html for a single experiment
   * Checks both variant.variables and variant.config
   */
  private extractInjectHTMLForExperiment(
    experiment: ExperimentData
  ): Map<number, InjectionDataWithFilter> {
    const variantInjections = new Map<number, InjectionDataWithFilter>();

    if (!experiment.variants) {
      return variantInjections;
    }

    for (let i = 0; i < experiment.variants.length; i++) {
      const variant = experiment.variants[i];
      if (!variant) continue;

      let injectionData = null;

      // First check variant.variables (common in tests and some setups)
      if (variant.variables && variant.variables.__inject_html) {
        injectionData = variant.variables.__inject_html;
        if (this.debug) {
          logDebug(
            `[VariantExtractor] Found __inject_html in variables for ${experiment.name} variant ${i}`
          );
        }
      }
      // Then check variant.config (ABSmartly SDK provides data here as a JSON string)
      else if (variant.config) {
        try {
          const config =
            typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;

          if (config && config.__inject_html) {
            injectionData = config.__inject_html;
            if (this.debug) {
              logDebug(
                `[VariantExtractor] Found __inject_html in config for ${experiment.name} variant ${i}`
              );
            }
          }
        } catch (e) {
          logDebug(
            `[VariantExtractor] Failed to parse variant.config for ${experiment.name} variant ${i}:`,
            e
          );
        }
      }

      if (injectionData && typeof injectionData === 'object' && !Array.isArray(injectionData)) {
        // Extract urlFilter if present
        const { urlFilter, ...rawData } = injectionData as Record<string, any>;

        // Create InjectionDataWithFilter
        const dataWithFilter: InjectionDataWithFilter = {
          data: rawData as RawInjectionData,
          urlFilter: urlFilter || undefined,
        };

        variantInjections.set(i, dataWithFilter);

        if (this.debug) {
          logDebug(
            `[VariantExtractor] Extracted __inject_html for ${experiment.name} variant ${i}:`,
            {
              keys: Object.keys(rawData),
              hasUrlFilter: !!urlFilter,
            }
          );
        }
      } else if (injectionData && this.debug) {
        logDebug(
          `[VariantExtractor] Invalid __inject_html format in ${experiment.name} variant ${i}`,
          injectionData
        );
      }
    }

    return variantInjections;
  }
}
