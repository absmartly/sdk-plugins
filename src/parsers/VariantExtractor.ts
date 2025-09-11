import { DOMChange, ContextData, ABsmartlyContext, ExperimentData } from '../types';

export class VariantExtractor {
  private context: ABsmartlyContext;
  private dataSource: 'variable' | 'customField';
  private dataFieldName: string;
  private debug: boolean;

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

  extractAllChanges(): Map<string, DOMChange[]> {
    const changesMap = new Map<string, DOMChange[]>();

    try {
      const contextData = this.context.data() as ContextData;

      if (!contextData || !contextData.experiments) {
        if (this.debug) {
          console.log('[ABsmartly] No experiments found in context data');
        }
        return changesMap;
      }

      for (const experiment of contextData.experiments) {
        const changes = this.extractExperimentChanges(experiment);
        if (changes && changes.length > 0) {
          changesMap.set(experiment.name, changes);
        }
      }
    } catch (error) {
      console.error('[ABsmartly] Error extracting DOM changes:', error);
    }

    return changesMap;
  }

  private extractExperimentChanges(experiment: ExperimentData): DOMChange[] | null {
    try {
      if (this.dataSource === 'variable') {
        return this.extractFromVariables(experiment);
      } else {
        return this.extractFromCustomField(experiment.name);
      }
    } catch (error) {
      if (this.debug) {
        console.error(`[ABsmartly] Error extracting changes for ${experiment.name}:`, error);
      }
      return null;
    }
  }

  private extractFromVariables(experiment: ExperimentData): DOMChange[] | null {
    // Use peek to get the current variant without triggering exposure
    const variantIndex = this.context.peek(experiment.name);

    if (variantIndex === undefined || variantIndex === null) {
      if (this.debug) {
        console.log(`[ABsmartly] No variant selected for ${experiment.name}`);
      }
      return null;
    }

    const variant = experiment.variants?.[variantIndex];
    if (!variant || !variant.variables) {
      if (this.debug) {
        console.log(
          `[ABsmartly] No variables found for variant ${variantIndex} of ${experiment.name}`
        );
      }
      return null;
    }

    const changesData = variant.variables[this.dataFieldName];
    if (!changesData) {
      if (this.debug) {
        console.log(`[ABsmartly] No ${this.dataFieldName} found in ${experiment.name}`);
      }
      return null;
    }

    return this.parseChanges(changesData);
  }

  private extractFromCustomField(experimentName: string): DOMChange[] | null {
    const changesData = this.context.customFieldValue(experimentName, this.dataFieldName);

    if (!changesData) {
      if (this.debug) {
        console.log(
          `[ABsmartly] No custom field ${this.dataFieldName} found for ${experimentName}`
        );
      }
      return null;
    }

    return this.parseChanges(changesData);
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
        console.error('[ABsmartly] Failed to parse DOM changes JSON:', error);
        return null;
      }
    }

    // Ensure it's an array
    if (!Array.isArray(changesData)) {
      if (this.debug) {
        console.warn('[ABsmartly] DOM changes data is not an array');
      }
      return null;
    }

    // Validate and filter changes
    const validChanges: DOMChange[] = [];

    for (const change of changesData) {
      if (this.isValidChange(change)) {
        validChanges.push(change);
      } else if (this.debug) {
        console.warn('[ABsmartly] Invalid DOM change:', change);
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

  getExperimentChanges(experimentName: string): DOMChange[] | null {
    const contextData = this.context.data() as ContextData;

    if (!contextData || !contextData.experiments) {
      return null;
    }

    const experiment = contextData.experiments.find(exp => exp.name === experimentName);
    if (!experiment) {
      return null;
    }

    return this.extractExperimentChanges(experiment);
  }
}
