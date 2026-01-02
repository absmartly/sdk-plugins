import { URLRedirectExtractor } from '../URLRedirectExtractor';
import { createTestSDK, createTestContext, createTestExperiment } from '../../__tests__/sdk-helper';
import type { SDK } from '@absmartly/javascript-sdk';
import type { ABsmartlyContext } from '../../types';

describe('URLRedirectExtractor', () => {
  let extractor: URLRedirectExtractor;
  let context: ABsmartlyContext;
  let sdk: typeof SDK.prototype;

  beforeEach(() => {
    sdk = createTestSDK();
  });

  describe('extractAllConfigs', () => {
    it('should extract redirect config from variant config', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(1);
      expect(configs.has('redirect-exp')).toBe(true);

      const variantConfigs = configs.get('redirect-exp');
      expect(variantConfigs?.size).toBe(1);
      expect(variantConfigs?.get(0)).toEqual({
        redirects: [
          { from: 'https://old.com', to: 'https://new.com', type: 'domain', preservePath: true },
        ],
        urlFilter: undefined,
        controlBehavior: 'no-redirect',
      });
    });

    it('should extract configs from multiple variants', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: null,
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new1.com', type: 'domain' }],
            },
          },
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new2.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfigs = configs.get('redirect-exp');

      expect(variantConfigs?.size).toBe(2);
      expect(variantConfigs?.has(0)).toBe(false);
      expect(variantConfigs?.has(1)).toBe(true);
      expect(variantConfigs?.has(2)).toBe(true);
    });

    it('should cache configs after first extraction', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs1 = extractor.extractAllConfigs();
      const configs2 = extractor.extractAllConfigs();

      expect(configs1).toBe(configs2);
    });

    it('should clear cache when clearCache is called', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs1 = extractor.extractAllConfigs();
      extractor.clearCache();
      const configs2 = extractor.extractAllConfigs();

      expect(configs1).not.toBe(configs2);
      expect(configs1).toEqual(configs2);
    });

    it('should handle experiments without redirect config', () => {
      const experiment = createTestExperiment('other-exp', [
        {
          config: {
            other_variable: 'value',
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should handle empty experiments', () => {
      context = createTestContext(sdk, { experiments: [] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });
  });

  describe('config parsing', () => {
    it('should parse page redirects', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://example.com/old', to: 'https://example.com/new', type: 'page' },
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.redirects[0].type).toBe('page');
    });

    it('should default preservePath to true', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.redirects[0].preservePath).toBe(true);
    });

    it('should respect explicit preservePath: false', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [
                {
                  from: 'https://old.com',
                  to: 'https://new.com',
                  type: 'domain',
                  preservePath: false,
                },
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.redirects[0].preservePath).toBe(false);
    });

    it('should parse urlFilter', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
              urlFilter: { include: ['https://old.com/*'] },
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.urlFilter).toEqual({ include: ['https://old.com/*'] });
    });

    it('should parse controlBehavior', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
              controlBehavior: 'redirect-same',
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.controlBehavior).toBe('redirect-same');
    });

    it('should default controlBehavior to no-redirect', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.controlBehavior).toBe('no-redirect');
    });
  });

  describe('validation', () => {
    it('should reject redirects without from', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ to: 'https://new.com', type: 'domain' } as any],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should reject redirects without to', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', type: 'domain' } as any],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should reject redirects without type', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com' } as any],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should reject redirects with invalid type', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://old.com', to: 'https://new.com', type: 'invalid' } as any,
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should filter out invalid redirects but keep valid ones', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://old.com', to: 'https://new.com', type: 'domain' },
                { to: 'https://invalid.com', type: 'domain' } as any,
                { from: 'https://page.com/old', to: 'https://page.com/new', type: 'page' },
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();
      const variantConfig = configs.get('redirect-exp')?.get(0);

      expect(variantConfig?.redirects).toHaveLength(2);
    });

    it('should reject config without redirects array', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              controlBehavior: 'redirect-same',
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });

    it('should reject config with non-array redirects', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: 'not-an-array',
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(0);
    });
  });

  describe('getConfigForExperiment', () => {
    it('should return config for current variant', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: null,
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const config = extractor.getConfigForExperiment('redirect-exp');

      expect(config).not.toBeNull();
      expect(config?.redirects).toHaveLength(1);
    });

    it('should return null when variant has no redirect config', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: null,
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 0,
      });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const config = extractor.getConfigForExperiment('redirect-exp');

      expect(config).toBeNull();
    });

    it('should return null for non-existent experiment', () => {
      context = createTestContext(sdk, { experiments: [] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const config = extractor.getConfigForExperiment('non-existent');

      expect(config).toBeNull();
    });
  });

  describe('getAllVariantConfigs', () => {
    it('should return all variant configs for an experiment', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: null,
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new1.com', type: 'domain' }],
            },
          },
        },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://old.com', to: 'https://new2.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const variantConfigs = extractor.getAllVariantConfigs('redirect-exp');

      expect(variantConfigs.size).toBe(2);
      expect(variantConfigs.has(1)).toBe(true);
      expect(variantConfigs.has(2)).toBe(true);
    });

    it('should return empty map for non-existent experiment', () => {
      context = createTestContext(sdk, { experiments: [] });
      extractor = new URLRedirectExtractor(context, '__url_redirect', false);

      const variantConfigs = extractor.getAllVariantConfigs('non-existent');

      expect(variantConfigs.size).toBe(0);
    });
  });

  describe('custom variable name', () => {
    it('should use custom variable name', () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            my_redirects: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      extractor = new URLRedirectExtractor(context, 'my_redirects', false);

      const configs = extractor.extractAllConfigs();

      expect(configs.size).toBe(1);
    });
  });
});
