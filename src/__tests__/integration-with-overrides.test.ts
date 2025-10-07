/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../core/DOMChangesPluginLite';
import { OverridesPlugin } from '../overrides/OverridesPlugin';
import * as debugModule from '../utils/debug';

// Mock fetch globally
global.fetch = jest.fn();

describe('Integration: DOMChangesPlugin with OverridesPlugin', () => {
  let domPlugin: DOMChangesPluginLite;
  let overridesPlugin: OverridesPlugin;
  let mockContext: any;
  let originalData: any;
  let cookieStore: { [key: string]: string } = {};

  beforeEach(() => {
    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();

    // Reset cookie store
    cookieStore = {};

    // Mock document.cookie properly for jsdom
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: jest.fn(() => {
        return Object.entries(cookieStore)
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('; ');
      }),
      set: jest.fn((value: string) => {
        const [nameValue] = value.split(';');
        const [name, val] = nameValue.split('=');
        if (val) {
          cookieStore[name.trim()] = val;
        } else {
          delete cookieStore[name.trim()];
        }
      }),
    });

    // Clear DOM
    document.body.innerHTML = '';

    // Create mock context data with one running experiment
    originalData = {
      experiments: [
        {
          id: 1,
          name: 'running_experiment',
          unitType: 'user_id',
          iteration: 1,
          seedHi: 0,
          seedLo: 0,
          split: [0.5, 0.5],
          trafficSeedHi: 0,
          trafficSeedLo: 0,
          trafficSplit: [0, 1],
          fullOnVariant: 0,
          applications: [{ name: 'www' }],
          variants: [
            {
              name: 'Control',
              config: '{}',
              variables: {
                __dom_changes: [
                  { selector: '.running-test', type: 'text', value: 'Running Control' },
                ],
              },
            },
            {
              name: 'Treatment',
              config: '{}',
              variables: {
                __dom_changes: [
                  { selector: '.running-test', type: 'text', value: 'Running Treatment' },
                ],
              },
            },
          ],
          audience: '',
          audienceStrict: false,
        },
      ],
    };

    // Create mock context
    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      data: jest.fn(() => originalData),
      override: jest.fn(),
      peek: jest.fn(),
      treatment: jest.fn(),
      customFieldValue: jest.fn(),
    };

    // Clear cookies
    cookieStore = {};
  });

  afterEach(() => {
    if (domPlugin) {
      domPlugin.destroy();
    }
    if (overridesPlugin) {
      overridesPlugin.destroy();
    }
  });

  describe('Full integration flow', () => {
    it('should work with running experiments only', async () => {
      // Set up DOM
      document.body.innerHTML = '<div class="running-test">Original</div>';

      // Set override for running experiment
      cookieStore['absmartly_overrides'] = 'running_experiment:1';

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
      });
      await overridesPlugin.initialize();

      // Mock peek to return variant 1
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'running_experiment') return 1;
        return undefined;
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
        debug: true,
      });
      await domPlugin.initialize();

      // Check DOM was modified
      const element = document.querySelector('.running-test');
      expect(element?.textContent).toBe('Running Treatment');
    });

    it('should integrate API-fetched experiments seamlessly', async () => {
      // Set up DOM
      document.body.innerHTML = `
        <div class="running-test">Original Running</div>
        <div class="api-test">Original API</div>
      `;

      // Set overrides for both running and API experiments
      cookieStore['absmartly_overrides'] = 'running_experiment:0,api_experiment:1.2.22846';

      // Mock API response
      const apiResponse = {
        experiments: [
          {
            id: 22846,
            name: 'api_experiment',
            unit_type: { name: 'session_id' },
            split: [0.5, 0.5],
            applications: [{ application: { name: 'www' } }],
            variants: [
              {
                variant: 0,
                name: 'Control',
                config: JSON.stringify({
                  __dom_changes: [{ selector: '.api-test', type: 'text', value: 'API Control' }],
                }),
              },
              {
                variant: 1,
                name: 'Treatment',
                config: JSON.stringify({
                  __dom_changes: [
                    { selector: '.api-test', type: 'text', value: 'API Treatment' },
                    { selector: '.api-test', type: 'style', value: { color: 'red' } },
                  ],
                }),
              },
            ],
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      });

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      // Verify API was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.com/v1/experiments?ids=22846',
        expect.any(Object)
      );

      // Mock peek to return configured variants
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'running_experiment') return 0;
        if (expName === 'api_experiment') return 1;
        return undefined;
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
        debug: true,
      });
      await domPlugin.initialize();

      // Check DOM was modified for both experiments
      const runningElement = document.querySelector('.running-test');
      expect(runningElement?.textContent).toBe('Running Control');

      const apiElement = document.querySelector('.api-test') as HTMLElement;
      expect(apiElement?.textContent).toBe('API Treatment');
      expect(apiElement?.style.color).toBe('red');

      // Verify context.data() includes both experiments
      const contextData = mockContext.data();
      expect(contextData.experiments).toHaveLength(2);
      expect(
        contextData.experiments.find((e: any) => e.name === 'running_experiment')
      ).toBeDefined();
      expect(contextData.experiments.find((e: any) => e.name === 'api_experiment')).toBeDefined();
    });

    it('should handle development experiments from SDK dev endpoint', async () => {
      // Set up DOM
      document.body.innerHTML = `
        <div class="dev-test">Original Dev</div>
      `;

      // Set overrides with dev environment
      cookieStore['absmartly_overrides'] = 'devEnv=staging|dev_experiment:1.1';

      // Mock SDK dev endpoint response
      const devResponse = {
        experiments: {
          dev_experiment: {
            id: 100,
            name: 'dev_experiment',
            unitType: 'user_id',
            iteration: 1,
            split: [0.33, 0.33, 0.34],
            variants: [
              {
                name: 'Control',
                variables: {
                  __dom_changes: [{ selector: '.dev-test', type: 'text', value: 'Dev Control' }],
                },
              },
              {
                name: 'Treatment A',
                variables: {
                  __dom_changes: [
                    { selector: '.dev-test', type: 'text', value: 'Dev Treatment A' },
                    { selector: '.dev-test', type: 'style', value: { 'font-weight': 'bold' } },
                  ],
                },
              },
              {
                name: 'Treatment B',
                variables: {
                  __dom_changes: [
                    { selector: '.dev-test', type: 'text', value: 'Dev Treatment B' },
                  ],
                },
              },
            ],
          },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => devResponse,
      });

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      // Verify SDK dev endpoint was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=staging',
        expect.any(Object)
      );

      // Mock peek for dev experiment
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'dev_experiment') return 1;
        return undefined;
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });
      await domPlugin.initialize();

      // Check DOM was modified
      const devElement = document.querySelector('.dev-test') as HTMLElement;
      expect(devElement?.textContent).toBe('Dev Treatment A');
      expect(devElement?.style.fontWeight).toBe('bold');
    });

    it('should handle mixed experiment types in one session', async () => {
      // Set up DOM
      document.body.innerHTML = `
        <div class="running-test">Original Running</div>
        <div class="dev-test">Original Dev</div>
        <div class="api-test">Original API</div>
      `;

      // Set mixed overrides
      cookieStore['absmartly_overrides'] =
        'devEnv=development|running_experiment:1,dev_experiment:0.1,api_experiment:2.2.30000';

      // Mock API response (fetched first)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          experiments: [
            {
              id: 30000,
              name: 'api_experiment',
              unit_type: { name: 'user_id' },
              split: [0.33, 0.33, 0.34],
              variants: [
                { variant: 0, config: '{}' },
                { variant: 1, config: '{}' },
                {
                  variant: 2,
                  config: JSON.stringify({
                    __dom_changes: [
                      {
                        selector: '.api-test',
                        type: 'html',
                        value: '<strong>API Variant 2</strong>',
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
      });

      // Mock dev SDK response (fetched second)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          experiments: {
            dev_experiment: {
              id: 200,
              name: 'dev_experiment',
              variants: [
                {
                  variables: {
                    __dom_changes: [
                      { selector: '.dev-test', type: 'text', value: 'Dev Control' },
                      { selector: '.dev-test', type: 'class', add: ['dev-control'] },
                    ],
                  },
                },
              ],
            },
          },
        }),
      });

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      // Verify both endpoints were called
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=development',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.com/v1/experiments?ids=30000',
        expect.any(Object)
      );

      // Mock peek for all experiments
      mockContext.peek.mockImplementation((expName: string) => {
        switch (expName) {
          case 'running_experiment':
            return 1;
          case 'dev_experiment':
            return 0;
          case 'api_experiment':
            return 2;
          default:
            return undefined;
        }
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });
      await domPlugin.initialize();

      // Check all DOM modifications
      const runningElement = document.querySelector('.running-test');
      expect(runningElement?.textContent).toBe('Running Treatment');

      const devElement = document.querySelector('.dev-test') as HTMLElement;
      expect(devElement?.textContent).toBe('Dev Control');
      expect(devElement?.classList.contains('dev-control')).toBe(true);

      const apiElement = document.querySelector('.api-test');
      expect(apiElement?.innerHTML).toBe('<strong>API Variant 2</strong>');

      // Verify all experiments are in context
      const contextData = mockContext.data();
      expect(contextData.experiments).toHaveLength(3);
      expect(contextData.experiments.map((e: any) => e.name).sort()).toEqual([
        'api_experiment',
        'dev_experiment',
        'running_experiment',
      ]);
    });

    it('should handle experiment updates when the same experiment exists', async () => {
      // Override the existing running_experiment with API data
      cookieStore['absmartly_overrides'] = 'running_experiment:1.2.1';

      // Mock API response with updated DOM changes
      const apiResponse = {
        experiments: [
          {
            id: 1,
            name: 'running_experiment',
            unit_type: { name: 'user_id' },
            split: [0.5, 0.5],
            variants: [
              {
                variant: 0,
                config: JSON.stringify({
                  __dom_changes: [
                    { selector: '.updated', type: 'text', value: 'Updated Control from API' },
                  ],
                }),
              },
              {
                variant: 1,
                config: JSON.stringify({
                  __dom_changes: [
                    { selector: '.updated', type: 'text', value: 'Updated Treatment from API' },
                    {
                      selector: '.updated',
                      type: 'style',
                      value: { 'background-color': 'yellow' },
                    },
                  ],
                }),
              },
            ],
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      });

      // Set up DOM
      document.body.innerHTML = '<div class="updated">Original</div>';

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      // Mock peek
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'running_experiment') return 1;
        return undefined;
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });
      await domPlugin.initialize();

      // Check DOM uses updated changes from API
      const element = document.querySelector('.updated') as HTMLElement;
      expect(element?.textContent).toBe('Updated Treatment from API');
      expect(element?.style.backgroundColor).toBe('yellow');

      // Verify context still has one experiment but with updated data
      const contextData = mockContext.data();
      expect(contextData.experiments).toHaveLength(1);
      const experiment = contextData.experiments[0];
      expect(experiment.name).toBe('running_experiment');
      expect(experiment.variants[1].variables.__dom_changes).toHaveLength(2);
    });

    it('should work correctly when no overrides are present', async () => {
      // No cookie set
      document.body.innerHTML = '<div class="running-test">Original</div>';

      // Initialize overrides plugin (should do nothing)
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
      });
      await overridesPlugin.initialize();

      // No fetch should be called
      expect(global.fetch).not.toHaveBeenCalled();

      // Mock peek for running experiment
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'running_experiment') return 0;
        return undefined;
      });

      // Initialize DOM plugin
      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });
      await domPlugin.initialize();

      // Should use original experiment data
      const element = document.querySelector('.running-test');
      expect(element?.textContent).toBe('Running Control');

      // Context should remain unchanged
      const contextData = mockContext.data();
      expect(contextData.experiments).toHaveLength(1);
      expect(contextData.experiments[0].name).toBe('running_experiment');
    });
  });

  describe('Error handling', () => {
    it('should handle API fetch failure gracefully', async () => {
      cookieStore['absmartly_overrides'] = 'api_experiment:1.2.12345';

      // Mock fetch failure
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      expect(logDebugSpy).toHaveBeenCalled();

      // DOM plugin should still work with existing experiments
      mockContext.peek.mockImplementation((expName: string) => {
        if (expName === 'running_experiment') return 0;
        return undefined;
      });

      document.body.innerHTML = '<div class="running-test">Original</div>';

      domPlugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });
      await domPlugin.initialize();

      const element = document.querySelector('.running-test');
      expect(element?.textContent).toBe('Running Control');

      logDebugSpy.mockRestore();
    });

    it('should handle malformed API response gracefully', async () => {
      cookieStore['absmartly_overrides'] = 'api_experiment:1.2.12345';

      // Mock malformed response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'response' }),
      });

      // Initialize overrides plugin
      overridesPlugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
      });
      await overridesPlugin.initialize();

      // Should not crash, context should remain unchanged
      const contextData = mockContext.data();
      expect(contextData.experiments).toHaveLength(1);
      expect(contextData.experiments[0].name).toBe('running_experiment');
    });
  });
});
