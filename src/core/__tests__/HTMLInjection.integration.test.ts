/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTestSDK, createTestContext, createTestExperiment } from '../../__tests__/sdk-helper';

describe('HTML Injection Integration', () => {
  let plugin: DOMChangesPluginLite;
  const sdk = createTestSDK();

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (plugin) {
      plugin.destroy();
    }
  });

  describe('basic injection', () => {
    it('should inject HTML from __inject_html variable', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>console.log("injected")</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
        debug: false,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>console.log("injected")</script>');
    });

    it('should inject at all four locations', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>head-start</script>',
              headEnd: '<style>head-end</style>',
              bodyStart: '<div>body-start</div>',
              bodyEnd: '<div>body-end</div>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.head.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
      expect(document.body.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
    });
  });

  describe('priority handling', () => {
    it('should inject in priority order (higher priority first)', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>priority-0</script>',
              headStart15: '<script>priority-15</script>',
              headStart10: '<script>priority-10</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelectorAll('[data-absmartly-injection]');
      expect(injected).toHaveLength(3);

      // Higher priority should be first in DOM
      expect(injected[0].innerHTML).toBe('<script>priority-15</script>');
      expect(injected[1].innerHTML).toBe('<script>priority-10</script>');
      expect(injected[2].innerHTML).toBe('<script>priority-0</script>');
    });

    it('should handle negative priorities', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              'headStart-5': '<script>negative</script>',
              headStart: '<script>zero</script>',
              headStart10: '<script>positive</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelectorAll('[data-absmartly-injection]');

      // Order: 10, 0, -5
      expect(injected[0].innerHTML).toBe('<script>positive</script>');
      expect(injected[1].innerHTML).toBe('<script>zero</script>');
      expect(injected[2].innerHTML).toBe('<script>negative</script>');
    });
  });

  describe('multiple experiments', () => {
    it('should inject from multiple experiments', async () => {
      const exp1 = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>exp1</script>',
            },
          },
        },
      ]);

      const exp2 = createTestExperiment('exp2', [
        {
          config: {
            __inject_html: {
              headStart: '<script>exp2</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [exp1, exp2] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.head.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
    });

    it('should merge priorities across experiments', async () => {
      const exp1 = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart10: '<script>exp1-priority-10</script>',
            },
          },
        },
      ]);

      const exp2 = createTestExperiment('exp2', [
        {
          config: {
            __inject_html: {
              headStart15: '<script>exp2-priority-15</script>',
              headStart5: '<script>exp2-priority-5</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [exp1, exp2] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelectorAll('[data-absmartly-injection]');
      expect(injected).toHaveLength(3);

      // Order: 15, 10, 5
      expect(injected[0].innerHTML).toContain('exp2-priority-15');
      expect(injected[1].innerHTML).toContain('exp1-priority-10');
      expect(injected[2].innerHTML).toContain('exp2-priority-5');
    });
  });

  describe('combined with DOM changes', () => {
    it('should apply both injections and DOM changes in parallel', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>injected</script>',
            },
            __dom_changes: [
              {
                selector: '#test',
                type: 'text',
                value: 'Modified',
              },
            ],
          },
        },
      ]);

      document.body.innerHTML = '<div id="test">Original</div>';

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      // Both should be applied
      const injected = document.head.querySelector('[data-absmartly-injection]');
      const modified = document.getElementById('test');

      expect(injected).toBeTruthy();
      expect(modified?.textContent).toBe('Modified');
    });
  });

  describe('cleanup', () => {
    it('should remove injections on destroy', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>test</script>',
              bodyEnd: '<div>footer</div>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);

      plugin.destroy();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle experiments without __inject_html', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              {
                selector: '#test',
                type: 'text',
                value: 'Modified',
              },
            ],
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should handle invalid __inject_html format', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: 'invalid format' as any,
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should handle invalid injection keys gracefully', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              invalidKey: '<script>should not inject</script>',
              headStart: '<script>valid</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      // Only valid injection should be applied
      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(1);
      expect(document.head.querySelector('[data-absmartly-injection]')?.innerHTML).toBe(
        '<script>valid</script>'
      );
    });
  });

  describe('autoApply false', () => {
    it('should not inject when autoApply is false', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>test</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: false,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });
  });

  describe('URL filtering', () => {
    beforeEach(() => {
      // Set a known URL for testing
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/products' },
        writable: true,
      });
    });

    it('should inject when URL matches filter', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>matched</script>',
              urlFilter: {
                include: ['/products'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>matched</script>');
    });

    it('should NOT inject when URL does not match filter', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>should-not-inject</script>',
              urlFilter: {
                include: ['/checkout'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should inject when URL matches exclude pattern', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>excluded</script>',
              urlFilter: {
                exclude: ['/checkout'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>excluded</script>');
    });

    it('should NOT inject when URL matches exclude pattern', async () => {
      // Change URL to /checkout
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/checkout' },
        writable: true,
      });

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>should-not-inject</script>',
              urlFilter: {
                exclude: ['/checkout'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should handle multiple experiments with different URL filters', async () => {
      const exp1 = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>exp1-products</script>',
              urlFilter: {
                include: ['/products'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const exp2 = createTestExperiment('exp2', [
        {
          config: {
            __inject_html: {
              headStart: '<script>exp2-checkout</script>',
              urlFilter: {
                include: ['/checkout'],
                mode: 'simple',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [exp1, exp2] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      // Only exp1 should be injected (URL is /products)
      const injected = document.head.querySelectorAll('[data-absmartly-injection]');
      expect(injected).toHaveLength(1);
      expect(injected[0].innerHTML).toBe('<script>exp1-products</script>');
    });

    it('should inject when no urlFilter is specified (legacy behavior)', async () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>no-filter</script>',
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>no-filter</script>');
    });

    it('should support regex URL matching', async () => {
      // Set URL to /products/123
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/products/123' },
        writable: true,
      });

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __inject_html: {
              headStart: '<script>regex-matched</script>',
              urlFilter: {
                include: ['^/products/\\d+$'],
                mode: 'regex',
                matchType: 'path',
              },
            },
          },
        },
      ]);

      const context = createTestContext(sdk, { experiments: [experiment] });

      plugin = new DOMChangesPluginLite({
        context,
        autoApply: true,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>regex-matched</script>');
    });
  });
});
