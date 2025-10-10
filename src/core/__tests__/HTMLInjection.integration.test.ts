/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { ABsmartlyContext, ContextData } from '../../types';

describe('HTML Injection Integration', () => {
  let mockContext: ABsmartlyContext;
  let plugin: DOMChangesPluginLite;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      data: jest.fn(),
      peek: jest.fn(),
      treatment: jest.fn(),
      override: jest.fn(),
      customFieldValue: jest.fn(),
    };
  });

  afterEach(() => {
    if (plugin) {
      plugin.destroy();
    }
  });

  describe('basic injection', () => {
    it('should inject HTML from __inject_html variable', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>console.log("injected")</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
        debug: false,
      });

      await plugin.ready();

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>console.log("injected")</script>');
    });

    it('should inject at all four locations', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>head-start</script>',
                    headEnd: '<style>head-end</style>',
                    bodyStart: '<div>body-start</div>',
                    bodyEnd: '<div>body-end</div>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.head.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
      expect(document.body.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
    });
  });

  describe('priority handling', () => {
    it('should inject in priority order (higher priority first)', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>priority-0</script>',
                    headStart15: '<script>priority-15</script>',
                    headStart10: '<script>priority-10</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    'headStart-5': '<script>negative</script>',
                    headStart: '<script>zero</script>',
                    headStart10: '<script>positive</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>exp1</script>',
                  },
                },
              },
            ],
          },
          {
            name: 'exp2',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>exp2</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.head.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
    });

    it('should merge priorities across experiments', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart10: '<script>exp1-priority-10</script>',
                  },
                },
              },
            ],
          },
          {
            name: 'exp2',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart15: '<script>exp2-priority-15</script>',
                    headStart5: '<script>exp2-priority-5</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
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
            ],
          },
        ],
      };

      document.body.innerHTML = '<div id="test">Original</div>';

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>test</script>',
                    bodyEnd: '<div>footer</div>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '#test',
                      type: 'text',
                      value: 'Modified',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should handle invalid __inject_html format', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: 'invalid format' as any,
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: true,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should handle invalid injection keys gracefully', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    invalidKey: '<script>should not inject</script>',
                    headStart: '<script>valid</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
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
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __inject_html: {
                    headStart: '<script>test</script>',
                  },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      plugin = new DOMChangesPluginLite({
        context: mockContext,
        autoApply: false,
      });

      await plugin.ready();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });
  });
});
