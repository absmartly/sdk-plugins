import { SDK } from '@absmartly/javascript-sdk';
import type { EventLogger, EventName, EventLoggerData } from '@absmartly/javascript-sdk/types/sdk';
import type { ContextData, ExperimentData } from '@absmartly/javascript-sdk/types/context';
import type { ABsmartlyContext } from '../types';

export interface CapturedEvent {
  context: ABsmartlyContext;
  name: EventName;
  data?: EventLoggerData;
}

export function createTestSDK(eventLogger?: EventLogger): typeof SDK.prototype {
  return new SDK({
    endpoint: 'https://test.absmartly.io',
    apiKey: 'test-key',
    environment: 'test',
    application: 'test-app',
    retries: 0,
    timeout: 1,
    eventLogger,
  });
}

export function createTestContext(
  sdk: typeof SDK.prototype,
  contextData: ContextData,
  userId: string = 'test-user',
  customAssignments?: Record<string, number>
): ABsmartlyContext {
  const context = sdk.createContextWith(
    {
      units: {
        user_id: userId,
        session_id: `${userId}_test_session`,
      },
    },
    contextData
  ) as ABsmartlyContext;

  if (customAssignments && Object.keys(customAssignments).length > 0) {
    for (const [experimentName, variantIndex] of Object.entries(customAssignments)) {
      context.override(experimentName, variantIndex);
    }
  }

  return context;
}

export function createEventCapture(filterEventName?: EventName): {
  events: CapturedEvent[];
  eventLogger: EventLogger;
} {
  const events: CapturedEvent[] = [];
  const eventLogger: EventLogger = (context, eventName, data) => {
    if (!filterEventName || eventName === filterEventName) {
      events.push({
        context: context as ABsmartlyContext,
        name: eventName,
        data,
      });
    }
  };
  return { events, eventLogger };
}

export function createTestExperiment(
  name: string,
  variants: Array<{
    variables?: Record<string, unknown>;
    config?: Record<string, unknown> | null;
  }>
): ExperimentData {
  return {
    id: 1,
    name,
    unitType: 'user_id',
    iteration: 1,
    seedHi: 0,
    seedLo: 0,
    split: variants.map(() => 1),
    trafficSeedHi: 0,
    trafficSeedLo: 0,
    trafficSplit: [1, 0],
    fullOnVariant: 0,
    audience: '',
    audienceStrict: false,
    variants: variants.map(v => ({
      config: v.config !== undefined ? (v.config ? JSON.stringify(v.config) : null) : null,
    })),
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

/**
 * Create a test context with experiments and automatic variant overrides
 *
 * @param sdk - The SDK instance
 * @param experiments - Array of experiments
 * @param variantOverrides - Map of experiment name to desired variant index
 * @param userId - Optional user ID for context
 */
export function createTestContextWithOverrides(
  sdk: typeof SDK.prototype,
  experiments: ExperimentData[],
  variantOverrides: Record<string, number>,
  userId: string = 'test-user'
): ABsmartlyContext {
  const contextData: ContextData = { experiments };
  return createTestContext(sdk, contextData, userId, variantOverrides);
}

export function createTreatmentTracker(
  experiments: Array<ExperimentData | any>,
  assignedVariants: Record<string, number>
) {
  const treatmentSpy = jest.fn();

  const fullExperiments = experiments.map(exp => {
    const variants = exp.variants || [];
    return {
      id: 1,
      name: exp.name,
      unitType: 'user_id',
      iteration: 1,
      seedHi: 0,
      seedLo: 0,
      split: variants.map(() => 1),
      trafficSeedHi: 0,
      trafficSeedLo: 0,
      trafficSplit: [1, 0],
      fullOnVariant: 0,
      audience: '',
      audienceStrict: false,
      variants: variants.map((v: any) => {
        if (typeof v.config === 'string') {
          return { config: v.config };
        } else if (v.config?.__dom_changes) {
          return {
            config: JSON.stringify({ __dom_changes: v.config.__dom_changes }),
          };
        } else {
          const domChanges = v.variables?.__dom_changes;
          return {
            config: domChanges ? JSON.stringify({ __dom_changes: domChanges }) : null,
          };
        }
      }),
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
  });

  const sdk = createTestSDK();
  const contextData: ContextData = { experiments: fullExperiments };
  const mockContext = createTestContext(sdk, contextData, 'test-user', assignedVariants);

  const originalTreatment = mockContext.treatment.bind(mockContext);
  mockContext.treatment = jest.fn((expName: string) => {
    treatmentSpy(expName);
    return originalTreatment(expName);
  });

  return { mockContext, treatmentSpy };
}

export default {
  createTestSDK,
  createTestContext,
  createTestContextWithOverrides,
  createEventCapture,
  createTestExperiment,
  createTreatmentTracker,
};
