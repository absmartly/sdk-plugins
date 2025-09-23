/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChange, ContextData, ABsmartlyContext, ExperimentData } from '../types';
import { logDebug } from '../utils/debug';

export class VariantExtractor {
  private context: ABsmartlyContext;
  private dataSource: 'variable' | 'customField';
  private dataFieldName: string;
  private debug: boolean;
  private cachedAllChanges: Map<string, Map<number, DOMChange[]>> | null = null;

  constructor(
    context: ABsmartlyContext,
    dataSource: 'variable' | 'customField' = 'variable',
    dataFieldName: string = '__dom_changes',
    debug = false
  ) {
    this.context = context;
    this.dataSource = dataSource;
    this.dataFieldName = dataFieldName;
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
      '[DEBUG] Processing experiment:',
      experiment.name,
      'with',
      experiment.variants?.length || 0,
      'variants'
    );

    if (!experiment.variants) {
      logDebug('[DEBUG] No variants found for experiment:', experiment.name);
      return variantChanges;
    }

    for (let i = 0; i < experiment.variants.length; i++) {
      const variant = experiment.variants[i];
      if (!variant) continue;

      let changesData = null;

      if (this.dataSource === 'variable') {
        // First check variant.variables (common in tests and some setups)
        if (variant.variables && variant.variables[this.dataFieldName]) {
          changesData = variant.variables[this.dataFieldName];
          logDebug(
            `[VariantExtractor DEBUG] ✓ Found DOM changes in variables[${this.dataFieldName}]:`,
            changesData
          );
        }
        // Then check variant.config (ABSmartly SDK provides data here as a JSON string)
        else if (variant.config) {
          try {
            const config =
              typeof variant.config === 'string' ? JSON.parse(variant.config) : variant.config;

            if (config && config[this.dataFieldName]) {
              changesData = config[this.dataFieldName];
              logDebug(
                `[VariantExtractor DEBUG] ✓ Found DOM changes in config[${this.dataFieldName}]:`,
                changesData
              );
            } else {
              logDebug(
                '[VariantExtractor DEBUG] ✗ No',
                this.dataFieldName,
                'field found in parsed config'
              );
            }
          } catch (e) {
            logDebug(
              '[VariantExtractor DEBUG] ✗ Failed to parse variant.config:',
              e,
              'Raw config:',
              typeof variant.config === 'string' ? variant.config.substring(0, 100) : ''
            );
          }
        }
      } else {
        // For custom field, we would need to handle it per experiment
        // This is a limitation of the current approach when extracting all variants
        continue;
      }

      if (changesData) {
        const changes = this.parseChanges(changesData);
        if (changes && changes.length > 0) {
          variantChanges.set(i, changes);
        }
      }
    }

    return variantChanges;
  }

  // Get changes for the current variant of a specific experiment
  // Note: Requires context to be ready for peek() to work correctly
  getExperimentChanges(experimentName: string): DOMChange[] | null {
    const allChanges = this.extractAllChanges();
    const experimentVariants = allChanges.get(experimentName);

    if (!experimentVariants || experimentVariants.size === 0) {
      return null;
    }

    // Use peek to get the current variant without triggering exposure
    // Important: peek() returns 0 if context is not ready
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
    if (!obj.selector || !obj.type) {
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
}
