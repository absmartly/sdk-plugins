import { DOMChangesPlugin } from '../index';
import { SDK } from '@absmartly/javascript-sdk';
import type { ContextData } from '@absmartly/javascript-sdk/types/context';
import type { ABsmartlyContext } from '../types';

describe('DOMChangesPlugin', () => {
  let sdk: typeof SDK.prototype;

  beforeEach(() => {
    sdk = new SDK({
      endpoint: 'https://test.absmartly.io',
      apiKey: 'test-key',
      environment: 'test',
      application: 'test-app',
      retries: 0,
      timeout: 1,
    });
  });

  it('should have a VERSION constant', () => {
    expect(DOMChangesPlugin.VERSION).toBe('1.0.0-lite');
  });

  it('should create an instance with DOMChangesPlugin alias', () => {
    const contextData: ContextData = {
      experiments: [],
    };

    const context = sdk.createContextWith(
      {
        units: {
          user_id: 'test-user',
          session_id: 'test-session',
        },
      },
      contextData
    ) as unknown as ABsmartlyContext;

    const plugin = new DOMChangesPlugin({
      context,
      autoApply: false,
    });

    expect(plugin).toBeInstanceOf(DOMChangesPlugin);
  });

  it('should create an instance with experiment data', () => {
    const contextData: ContextData = {
      experiments: [
        {
          id: 1,
          name: 'test_experiment',
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
                __dom_changes: [
                  {
                    selector: '.test',
                    type: 'text',
                    value: 'Test Value',
                  },
                ],
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
        },
      ],
    };

    const context = sdk.createContextWith(
      {
        units: {
          user_id: 'test-user',
          session_id: 'test-session',
        },
      },
      contextData
    ) as unknown as ABsmartlyContext;

    const plugin = new DOMChangesPlugin({
      context,
      autoApply: false,
      variableName: '__dom_changes',
    });

    expect(plugin).toBeInstanceOf(DOMChangesPlugin);
  });
});