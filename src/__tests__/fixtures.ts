import type { ContextData, ExperimentData } from '@absmartly/javascript-sdk/types/context';

export function createEmptyContextData(): ContextData {
  return {
    experiments: [],
  };
}

export function createBasicExperiment(
  name: string = 'test_experiment',
  domChanges: unknown[] = []
): ExperimentData {
  return {
    id: 1,
    name,
    unitType: 'user_id',
    iteration: 1,
    seedHi: 0,
    seedLo: 0,
    split: [1, 1],
    trafficSeedHi: 0,
    trafficSeedLo: 0,
    trafficSplit: [1, 0],
    fullOnVariant: 0,
    audience: '',
    audienceStrict: false,
    variants: [
      {
        config: JSON.stringify({
          __dom_changes: [],
        }),
      },
      {
        config: JSON.stringify({
          __dom_changes: domChanges,
        }),
      },
    ],
    variables: {},
    variant: 0,
    overridden: false,
    assigned: true,
    exposed: false,
    eligible: true,
    fullOn: false,
    custom: false,
    audienceMismatch: false,
    customFieldValues: null,
  };
}

export function createContextDataWithExperiment(experiment: ExperimentData): ContextData {
  return {
    experiments: [experiment],
  };
}

export function createContextDataWithExperiments(experiments: ExperimentData[]): ContextData {
  return {
    experiments,
  };
}

/**
 * Helper to extract variant overrides from experiments with _testVariantIndex
 */
export function extractVariantOverrides(
  experiments: Array<ExperimentData & { _testVariantIndex?: number }>
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const exp of experiments) {
    if (exp._testVariantIndex !== undefined && exp._testVariantIndex !== 0) {
      overrides[exp.name] = exp._testVariantIndex;
    }
  }
  return overrides;
}

export default {
  createEmptyContextData,
  createBasicExperiment,
  createContextDataWithExperiment,
  createContextDataWithExperiments,
  extractVariantOverrides,
};
