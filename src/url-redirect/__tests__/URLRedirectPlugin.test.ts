import { URLRedirectPlugin } from '../URLRedirectPlugin';
import { createTestSDK, createTestContext, createTestExperiment } from '../../__tests__/sdk-helper';
import type { SDK } from '@absmartly/javascript-sdk';
import type { ABsmartlyContext } from '../../types';

const originalLocation = window.location;

function mockLocation(url: string) {
  const parsedUrl = new URL(url);
  Object.defineProperty(window, 'location', {
    value: {
      href: url,
      origin: parsedUrl.origin,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
      protocol: parsedUrl.protocol,
      host: parsedUrl.host,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      assign: jest.fn(),
      reload: jest.fn(),
      replace: jest.fn(),
    },
    writable: true,
    configurable: true,
  });
}

function restoreLocation() {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
}

describe('URLRedirectPlugin', () => {
  let sdk: typeof SDK.prototype;
  let context: ABsmartlyContext;

  beforeEach(() => {
    sdk = createTestSDK();
    mockLocation('https://example.com/page');
  });

  afterEach(() => {
    restoreLocation();
  });

  describe('initialization', () => {
    it('should throw if context is not provided', () => {
      expect(() => {
        new URLRedirectPlugin({} as any);
      }).toThrow('[ABsmartly URLRedirect] Context is required');
    });

    it('should initialize with default config', async () => {
      const experiment = createTestExperiment('redirect-exp', [{ config: null }]);

      context = createTestContext(sdk, { experiments: [experiment] });
      const plugin = new URLRedirectPlugin({ context });

      const match = await plugin.ready();

      expect(match).toBeNull();
    });

    it('should use custom variable name', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            my_redirect_var: {
              redirects: [{ from: 'https://old.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 0,
      });
      mockLocation('https://old.com/page');

      const plugin = new URLRedirectPlugin({
        context,
        variableName: 'my_redirect_var',
        autoApply: false,
      });

      const match = await plugin.ready();

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://new.com/page');
    });
  });

  describe('findRedirectMatch', () => {
    it('should find domain redirect match', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://old.example.com', to: 'https://new.example.com', type: 'domain' },
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      mockLocation('https://old.example.com/some/path?query=1');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).not.toBeNull();
      expect(match?.experimentName).toBe('redirect-exp');
      expect(match?.variant).toBe(1);
      expect(match?.targetUrl).toBe('https://new.example.com/some/path?query=1');
      expect(match?.isControl).toBe(false);
    });

    it('should find page redirect match', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [
                {
                  from: 'https://example.com/old-page',
                  to: 'https://example.com/new-page',
                  type: 'page',
                },
              ],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      mockLocation('https://example.com/old-page?utm=test');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).not.toBeNull();
      expect(match?.targetUrl).toBe('https://example.com/new-page?utm=test');
    });

    it('should return null when no redirect match', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://other.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      mockLocation('https://example.com/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).toBeNull();
    });

    it('should return null when variant not selected', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      mockLocation('https://example.com/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).toBeNull();
    });

    it('should handle control variant with redirect-same behavior', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
              controlBehavior: 'redirect-same',
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 0,
      });
      mockLocation('https://example.com/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).not.toBeNull();
      expect(match?.isControl).toBe(true);
      expect(match?.targetUrl).toBe('https://example.com/page');
    });
  });

  describe('URL filtering', () => {
    it('should skip redirect when URL does not match filter', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
              urlFilter: { include: ['/specific/*'] },
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      mockLocation('https://example.com/other/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).toBeNull();
    });

    it('should find redirect when URL matches filter', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
              urlFilter: { include: ['/specific/*'] },
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      mockLocation('https://example.com/specific/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).not.toBeNull();
    });
  });

  describe('executeRedirect', () => {
    it('should call treatment before redirect', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      const treatmentSpy = jest.spyOn(context, 'treatment');
      const publishSpy = jest.spyOn(context, 'publish').mockResolvedValue();
      mockLocation('https://example.com/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch()!;
      await plugin.executeRedirect(match);

      expect(treatmentSpy).toHaveBeenCalledWith('redirect-exp');
      expect(publishSpy).toHaveBeenCalled();
    });

    it('should call onBeforeRedirect callback', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      jest.spyOn(context, 'publish').mockResolvedValue();
      mockLocation('https://example.com/page');

      const onBeforeRedirect = jest.fn();
      const plugin = new URLRedirectPlugin({
        context,
        autoApply: false,
        onBeforeRedirect,
      });
      await plugin.ready();

      const match = plugin.findRedirectMatch()!;
      await plugin.executeRedirect(match);

      expect(onBeforeRedirect).toHaveBeenCalledWith(match);
    });

    it('should not change location when target URL is same as current', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://example.com', to: 'https://example.com', type: 'domain' },
              ],
            },
          },
        },
      ]);

      const currentUrl = 'https://example.com/page';
      context = createTestContext(sdk, { experiments: [experiment] }, 'test-user', {
        'redirect-exp': 1,
      });
      jest.spyOn(context, 'publish').mockResolvedValue();
      mockLocation(currentUrl);

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch()!;
      await plugin.executeRedirect(match);

      expect(window.location.href).toBe(currentUrl);
    });
  });

  describe('plugin registration', () => {
    it('should register with context after initialization', async () => {
      const experiment = createTestExperiment('redirect-exp', [{ config: null }]);

      context = createTestContext(sdk, { experiments: [experiment] });

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      expect(context.__plugins?.urlRedirectPlugin).toBeDefined();
      expect(context.__plugins?.urlRedirectPlugin?.name).toBe('URLRedirectPlugin');
      expect(context.__plugins?.urlRedirectPlugin?.instance).toBe(plugin);
    });

    it('should unregister from context on destroy', async () => {
      const experiment = createTestExperiment('redirect-exp', [{ config: null }]);

      context = createTestContext(sdk, { experiments: [experiment] });

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      expect(context.__plugins?.urlRedirectPlugin).toBeDefined();

      plugin.destroy();

      expect(context.__plugins?.urlRedirectPlugin).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should refresh experiments by clearing cache', async () => {
      const experiment = createTestExperiment('redirect-exp', [
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const extractor = plugin.getExtractor();
      const cacheClearSpy = jest.spyOn(extractor, 'clearCache');

      plugin.refreshExperiments();

      expect(cacheClearSpy).toHaveBeenCalled();
    });
  });

  describe('multiple experiments', () => {
    it('should find first matching redirect across experiments', async () => {
      const exp1 = createTestExperiment('exp1', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [
                { from: 'https://other.com', to: 'https://new-other.com', type: 'domain' },
              ],
            },
          },
        },
      ]);

      const exp2 = createTestExperiment('exp2', [
        { config: null },
        {
          config: {
            __url_redirect: {
              redirects: [{ from: 'https://example.com', to: 'https://new.com', type: 'domain' }],
            },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [exp1, exp2] }, 'test-user', {
        exp1: 1,
        exp2: 1,
      });
      mockLocation('https://example.com/page');

      const plugin = new URLRedirectPlugin({ context, autoApply: false });
      await plugin.ready();

      const match = plugin.findRedirectMatch();

      expect(match).not.toBeNull();
      expect(match?.experimentName).toBe('exp2');
    });
  });
});
