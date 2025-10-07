/* eslint-disable @typescript-eslint/no-explicit-any */
import { OverridesPlugin } from '../OverridesPlugin';
import { OverridesPluginConfig } from '../types';
import * as debugModule from '../../utils/debug';

// Mock fetch globally
global.fetch = jest.fn();

describe('OverridesPlugin', () => {
  let plugin: OverridesPlugin;
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

    // Create mock context data
    originalData = {
      experiments: [
        {
          id: 1,
          name: 'existing_experiment',
          unitType: 'user_id',
          variants: [
            {
              name: 'Control',
              variables: { __dom_changes: [{ selector: '.test', type: 'text', value: 'Control' }] },
            },
            {
              name: 'Treatment',
              variables: {
                __dom_changes: [{ selector: '.test', type: 'text', value: 'Treatment' }],
              },
            },
          ],
          split: [0.5, 0.5],
        },
      ],
    };

    // Create mock context
    mockContext = {
      data: jest.fn(() => originalData),
      override: jest.fn(),
      peek: jest.fn(),
      treatment: jest.fn(),
      customFieldValue: jest.fn(),
    };

    // Clear cookies
    cookieStore = {};
  });

  describe('initialization', () => {
    it('should initialize with SDK endpoint from config', () => {
      const config: OverridesPluginConfig = {
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        debug: false,
      };

      plugin = new OverridesPlugin(config);
      expect(plugin).toBeDefined();
    });

    it('should throw error if context is not provided', () => {
      expect(() => {
        new OverridesPlugin({} as OverridesPluginConfig);
      }).toThrow('Context is required');
    });

    it('should throw error if SDK endpoint cannot be determined', () => {
      expect(() => {
        new OverridesPlugin({
          context: {},
        } as OverridesPluginConfig);
      }).toThrow('[OverridesPlugin] SDK endpoint must be provided if not available from context');
    });
  });

  describe('cookie parsing', () => {
    beforeEach(() => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
      });
    });

    it('should parse simple override format', async () => {
      // Using comma separator between experiments
      cookieStore['absmartly_overrides'] = 'exp1:1,exp2:0';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('exp2', 0);
    });

    it('should parse overrides with env flags', async () => {
      cookieStore['absmartly_overrides'] = 'exp1:1.0,exp2:0.1,exp3:2.2.12345';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('exp2', 0);
      expect(mockContext.override).toHaveBeenCalledWith('exp3', 2);
    });

    it('should parse overrides with dev environment', async () => {
      cookieStore['absmartly_overrides'] = 'devEnv=staging|exp1:1.1,exp2:0.1';

      // Mock SDK dev endpoint response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          experiments: {
            exp1: {
              id: 100,
              name: 'exp1',
              variants: [
                {
                  variables: {
                    __dom_changes: [{ selector: '.dev1', type: 'text', value: 'Dev Control' }],
                  },
                },
                {
                  variables: {
                    __dom_changes: [{ selector: '.dev1', type: 'text', value: 'Dev Treatment' }],
                  },
                },
              ],
            },
            exp2: {
              id: 101,
              name: 'exp2',
              variants: [
                {
                  variables: {
                    __dom_changes: [{ selector: '.dev2', type: 'text', value: 'Dev2 Control' }],
                  },
                },
              ],
            },
          },
        }),
      });

      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('exp2', 0);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=staging',
        expect.any(Object)
      );
    });

    it('should handle empty cookie', async () => {
      cookieStore['absmartly_overrides'] = '';
      await plugin.initialize();

      expect(mockContext.override).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle malformed cookie gracefully', async () => {
      cookieStore['absmartly_overrides'] = 'invalid:data:format';
      await plugin.initialize();

      expect(mockContext.override).not.toHaveBeenCalled();
    });
  });

  describe('query string parsing', () => {
    let originalLocation: Location;

    beforeEach(() => {
      // Save original location
      originalLocation = window.location;

      // Mock window.location
      delete (window as any).location;
      (window as any).location = {
        ...originalLocation,
        search: '',
      };
    });

    afterEach(() => {
      // Restore original location
      (window as any).location = originalLocation;
    });

    it('should parse new query string format with prefix', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      window.location.search = '?_exp_button_color=1&_exp_hero_title=0';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('button_color', 1);
      expect(mockContext.override).toHaveBeenCalledWith('hero_title', 0);
    });

    it('should parse query string with variant, env and id', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      window.location.search = '?_exp_test1=1,1&_exp_test2=2,2,12345';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('test1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('test2', 2);
    });

    it('should parse environment from query string', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: '_exp_',
        envParam: 'env',
      });

      window.location.search = '?env=staging&_exp_exp1=1,1&_exp_exp2=0,1';

      // Mock SDK dev endpoint response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          experiments: {
            exp1: {
              id: 100,
              name: 'exp1',
              variants: [
                { variables: { __dom_changes: [] } },
                { variables: { __dom_changes: [] } },
              ],
            },
            exp2: {
              id: 101,
              name: 'exp2',
              variants: [{ variables: { __dom_changes: [] } }],
            },
          },
        }),
      });

      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('exp2', 0);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=staging',
        expect.any(Object)
      );
    });

    it('should prefer query string over cookie', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      // Set both cookie and query string with same experiment
      cookieStore['absmartly_overrides'] = 'test_exp:0';
      window.location.search = '?_exp_test_exp=1';

      await plugin.initialize();

      // Should only use query string value when there are query overrides
      expect(mockContext.override).toHaveBeenCalledTimes(1);
      expect(mockContext.override).toHaveBeenCalledWith('test_exp', 1);
    });

    it('should use cookie when useQueryString is false', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
        useQueryString: false,
      });

      cookieStore['absmartly_overrides'] = 'cookie_exp:2';
      window.location.search = '?_exp_query_exp=1'; // Should be ignored

      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('cookie_exp', 2);
      expect(mockContext.override).not.toHaveBeenCalledWith('query_exp', 1);
    });

    it('should handle custom prefix correctly', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: 'test_',
      });

      window.location.search = '?test_custom=1&_exp_ignored=2';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('custom', 1);
      expect(mockContext.override).not.toHaveBeenCalledWith('ignored', 2);
    });

    it('should ignore non-prefixed query parameters', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: '_exp_',
      });

      window.location.search = '?other=value&_exp_exp1=1&another=param';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('exp1', 1);
      expect(mockContext.override).not.toHaveBeenCalledWith('other', expect.anything());
      expect(mockContext.override).not.toHaveBeenCalledWith('another', expect.anything());
    });

    it('should persist query params to cookie when enabled', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
        useQueryString: true,
        queryPrefix: '_exp_',
        persistQueryToCookie: true,
      });

      window.location.search = '?_exp_test=1';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('test', 1);
      // Check that cookie was set
      expect(document.cookie).toContain('absmartly_overrides');
      // Cookie value should be URL encoded
      const decodedValue = decodeURIComponent(cookieStore['absmartly_overrides']);
      expect(decodedValue).toContain('test:1');
    });

    it('should not use cookies when cookieName is not provided', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        useQueryString: true,
        queryPrefix: '_exp_',
        // No cookieName provided
      });

      cookieStore['absmartly_overrides'] = 'should_be_ignored:1';
      window.location.search = '?_exp_test=2';
      await plugin.initialize();

      expect(mockContext.override).toHaveBeenCalledWith('test', 2);
      expect(mockContext.override).not.toHaveBeenCalledWith('should_be_ignored', 1);
    });
  });

  describe('API fetching for non-running experiments', () => {
    beforeEach(() => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
        debug: true,
      });
    });

    it('should fetch non-running experiments from API', async () => {
      cookieStore['absmartly_overrides'] = 'api_exp1:1.2.22846,api_exp2:0.2.22847';

      // Mock API response
      const apiResponse = {
        experiments: [
          {
            id: 22846,
            name: 'api_exp1',
            unit_type: { name: 'user_id' },
            split: [0.5, 0.5],
            variants: [
              {
                variant: 0,
                name: 'Control',
                config:
                  '{"__dom_changes":[{"selector":".api-test","type":"style","value":{"background":"blue"}}]}',
              },
              {
                variant: 1,
                name: 'Treatment',
                config:
                  '{"__dom_changes":[{"selector":".api-test","type":"style","value":{"background":"red"}}]}',
              },
            ],
          },
          {
            id: 22847,
            name: 'api_exp2',
            unit_type: { name: 'user_id' },
            split: [0.5, 0.5],
            variants: [
              {
                variant: 0,
                name: 'Control',
                config:
                  '{"__dom_changes":[{"selector":".api-test2","type":"text","value":"API Control"}]}',
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

      await plugin.initialize();

      // Check fetch was called with correct URL
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.com/v1/experiments?ids=22846,22847',
        expect.any(Object)
      );

      // Check overrides were applied
      expect(mockContext.override).toHaveBeenCalledWith('api_exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('api_exp2', 0);

      // Check context.data() was modified to include fetched experiments
      const modifiedData = mockContext.data();
      expect(modifiedData.experiments).toHaveLength(3); // 1 original + 2 fetched

      const apiExp1 = modifiedData.experiments.find((e: any) => e.name === 'api_exp1');
      expect(apiExp1).toBeDefined();
      expect(apiExp1.variants[0].variables.__dom_changes).toEqual([
        { selector: '.api-test', type: 'style', value: { background: 'blue' } },
      ]);
      expect(apiExp1.variants[1].variables.__dom_changes).toEqual([
        { selector: '.api-test', type: 'style', value: { background: 'red' } },
      ]);
    });

    it('should use default API endpoint when not specified', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
      });

      cookieStore['absmartly_overrides'] = 'api_exp:1.2.12345';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ experiments: [] }),
      });

      await plugin.initialize();

      // Should convert .io to .com for API endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.com/v1/experiments?ids=12345',
        expect.any(Object)
      );
    });

    it('should handle API fetch errors gracefully', async () => {
      cookieStore['absmartly_overrides'] = 'api_exp:1.2.12345';

      // Mock fetch error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      await plugin.initialize();

      expect(logDebugSpy).toHaveBeenCalledWith(
        '[OverridesPlugin] Failed to fetch experiments from API:',
        expect.any(Error)
      );

      logDebugSpy.mockRestore();
    });
  });

  describe('SDK dev endpoint fetching', () => {
    beforeEach(() => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        cookieName: 'absmartly_overrides',
        debug: true,
      });
    });

    it('should fetch development experiments from SDK dev endpoint', async () => {
      cookieStore['absmartly_overrides'] = 'devEnv=development|dev_exp1:1.1,dev_exp2:0.1';

      const devResponse = {
        experiments: {
          dev_exp1: {
            id: 200,
            name: 'dev_exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.dev1', type: 'text', value: 'Dev Control' }],
                },
              },
              {
                variables: {
                  __dom_changes: [{ selector: '.dev1', type: 'text', value: 'Dev Treatment' }],
                },
              },
            ],
          },
          dev_exp2: {
            id: 201,
            name: 'dev_exp2',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.dev2', type: 'html', value: '<p>Dev HTML</p>' }],
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

      await plugin.initialize();

      // Check fetch was called with correct URL
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=development',
        expect.any(Object)
      );

      // Check overrides were applied
      expect(mockContext.override).toHaveBeenCalledWith('dev_exp1', 1);
      expect(mockContext.override).toHaveBeenCalledWith('dev_exp2', 0);

      // Check context.data() was modified
      const modifiedData = mockContext.data();
      const devExp1 = modifiedData.experiments.find((e: any) => e.name === 'dev_exp1');
      expect(devExp1).toBeDefined();
      expect(devExp1.variants[1].variables.__dom_changes).toEqual([
        { selector: '.dev1', type: 'text', value: 'Dev Treatment' },
      ]);
    });

    it('should handle SDK fetch errors gracefully', async () => {
      cookieStore['absmartly_overrides'] = 'devEnv=staging|dev_exp:1.1';

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('SDK error'));

      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      await plugin.initialize();

      expect(logDebugSpy).toHaveBeenCalledWith(
        '[OverridesPlugin] Failed to fetch experiments from dev SDK:',
        expect.any(Error)
      );

      logDebugSpy.mockRestore();
    });
  });

  describe('context.data() injection', () => {
    beforeEach(() => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
        absmartlyEndpoint: 'https://demo-2.absmartly.com',
        cookieName: 'absmartly_overrides',
      });
    });

    it('should merge fetched experiments with existing context data', async () => {
      cookieStore['absmartly_overrides'] = 'new_exp:1.2.30000';

      const apiResponse = {
        experiments: [
          {
            id: 30000,
            name: 'new_exp',
            unit_type: { name: 'session_id' },
            split: [0.33, 0.33, 0.34],
            variants: [
              { variant: 0, name: 'Control', config: '{}' },
              {
                variant: 1,
                name: 'Treatment A',
                config: '{"__dom_changes":[{"selector":"h1","type":"text","value":"New Title"}]}',
              },
              { variant: 2, name: 'Treatment B', config: '{}' },
            ],
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      });

      await plugin.initialize();

      // Get modified context data
      const modifiedData = mockContext.data();

      // Should have both original and new experiments
      expect(modifiedData.experiments).toHaveLength(2);
      expect(
        modifiedData.experiments.find((e: any) => e.name === 'existing_experiment')
      ).toBeDefined();
      expect(modifiedData.experiments.find((e: any) => e.name === 'new_exp')).toBeDefined();

      // Check new experiment structure
      const newExp = modifiedData.experiments.find((e: any) => e.name === 'new_exp');
      expect(newExp.id).toBe(30000);
      expect(newExp.unitType).toBe('session_id');
      expect(newExp.variants).toHaveLength(3);
      expect(newExp.variants[1].variables.__dom_changes).toEqual([
        { selector: 'h1', type: 'text', value: 'New Title' },
      ]);
    });

    it('should update existing experiment with fetched variant data', async () => {
      cookieStore['absmartly_overrides'] = 'existing_experiment:1.2.1';

      const apiResponse = {
        experiments: [
          {
            id: 1,
            name: 'existing_experiment',
            unit_type: { name: 'user_id' },
            split: [0.5, 0.5],
            variants: [
              {
                variant: 0,
                name: 'Control',
                config:
                  '{"__dom_changes":[{"selector":".updated","type":"text","value":"Updated Control"}]}',
              },
              {
                variant: 1,
                name: 'Treatment',
                config:
                  '{"__dom_changes":[{"selector":".updated","type":"text","value":"Updated Treatment"}]}',
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

      await plugin.initialize();

      const modifiedData = mockContext.data();
      expect(modifiedData.experiments).toHaveLength(1);

      const existingExp = modifiedData.experiments.find(
        (e: any) => e.name === 'existing_experiment'
      );
      expect(existingExp.variants[0].variables.__dom_changes).toEqual([
        { selector: '.updated', type: 'text', value: 'Updated Control' },
      ]);
      expect(existingExp.variants[1].variables.__dom_changes).toEqual([
        { selector: '.updated', type: 'text', value: 'Updated Treatment' },
      ]);
    });

    it('should handle mixed override types', async () => {
      cookieStore['absmartly_overrides'] = 'devEnv=dev|running:1,dev_exp:0.1,api_exp:2.2.40000';

      // Mock API response (fetched first)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          experiments: [
            {
              id: 40000,
              name: 'api_exp',
              variants: [
                { variant: 0, config: '{}' },
                { variant: 1, config: '{}' },
                {
                  variant: 2,
                  config: '{"__dom_changes":[{"selector":".api","type":"text","value":"API"}]}',
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
            dev_exp: {
              id: 300,
              name: 'dev_exp',
              variants: [
                {
                  variables: { __dom_changes: [{ selector: '.dev', type: 'text', value: 'Dev' }] },
                },
              ],
            },
          },
        }),
      });

      await plugin.initialize();

      // Check all overrides were applied
      expect(mockContext.override).toHaveBeenCalledWith('running', 1);
      expect(mockContext.override).toHaveBeenCalledWith('dev_exp', 0);
      expect(mockContext.override).toHaveBeenCalledWith('api_exp', 2);

      // Check both fetch calls were made
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.io/v1/context?environment=dev',
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://demo-2.absmartly.com/v1/experiments?ids=40000',
        expect.any(Object)
      );

      // Check all experiments are in context
      const modifiedData = mockContext.data();
      expect(
        modifiedData.experiments.find((e: any) => e.name === 'existing_experiment')
      ).toBeDefined();
      expect(modifiedData.experiments.find((e: any) => e.name === 'dev_exp')).toBeDefined();
      expect(modifiedData.experiments.find((e: any) => e.name === 'api_exp')).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('should clean up on destroy', async () => {
      plugin = new OverridesPlugin({
        context: mockContext,
        sdkEndpoint: 'https://demo-2.absmartly.io',
      });

      await plugin.initialize();
      plugin.destroy();

      // Should be able to reinitialize
      await expect(plugin.initialize()).resolves.not.toThrow();
    });
  });
});
