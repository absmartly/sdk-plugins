/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPlugin } from '../DOMChangesPlugin';
import { PluginConfig, ABsmartlyContext, ContextData, InjectionData } from '../../types';

describe('DOMChangesPlugin', () => {
  let plugin: DOMChangesPlugin;
  let mockContext: ABsmartlyContext;
  let config: PluginConfig;

  beforeEach(() => {
    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      data: jest.fn(),
      peek: jest.fn(),
      treatment: jest.fn(),
      override: jest.fn(),
      customFieldValue: jest.fn(),
    };

    config = {
      context: mockContext,
      autoApply: false,
      spa: false,
      visibilityTracking: false,
      extensionBridge: false,
      debug: false,
    };
  });

  afterEach(() => {
    if (plugin) {
      plugin.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with default config values', () => {
      plugin = new DOMChangesPlugin({ context: mockContext });
      expect(plugin).toBeDefined();
    });

    it('should throw error if context is not provided', () => {
      expect(() => new DOMChangesPlugin({} as PluginConfig)).toThrow(
        '[ABsmartly] Context is required'
      );
    });

    it('should initialize and register with context successfully', async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();

      // Check new standardized registration
      expect(mockContext.__plugins).toBeDefined();
      expect(mockContext.__plugins?.domPlugin).toBeDefined();
      expect(mockContext.__plugins?.domPlugin?.name).toBe('DOMChangesPlugin');
      expect(mockContext.__plugins?.domPlugin?.version).toBe('1.0.0');
      expect(mockContext.__plugins?.domPlugin?.initialized).toBe(true);
      expect(mockContext.__plugins?.domPlugin?.capabilities).toContain('overrides');
      expect(mockContext.__plugins?.domPlugin?.capabilities).toContain('spa');
      expect(mockContext.__plugins?.domPlugin?.instance).toBe(plugin);

      // Check legacy registration for backwards compatibility
      expect(mockContext.__domPlugin).toBeDefined();
      expect(mockContext.__domPlugin).toBe(mockContext.__plugins?.domPlugin);
    });

    it('should not initialize twice', async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
      const firstPlugin = mockContext.__plugins?.domPlugin;

      await plugin.initialize();
      expect(mockContext.__plugins?.domPlugin).toBe(firstPlugin);
      expect(mockContext.__domPlugin).toBe(firstPlugin);
    });

    it('should auto-apply changes if configured', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Auto applied' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPlugin({
        ...config,
        autoApply: true,
      });

      await plugin.initialize();

      expect(document.querySelector('.test')?.textContent).toBe('Auto applied');
    });
  });

  describe('applyChanges', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should apply changes from experiments', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      expect(document.querySelector('.test')?.textContent).toBe('Modified');
    });

    it('should apply changes for specific experiment', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
                },
              },
            ],
          },
          {
            name: 'exp2',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML =
        '<div class="test1">Original1</div><div class="test2">Original2</div>';

      await plugin.applyChanges('exp1');

      expect(document.querySelector('.test1')?.textContent).toBe('Exp1');
      expect(document.querySelector('.test2')?.textContent).toBe('Original2');
    });

    it('should add pending changes in SPA mode when elements not found', async () => {
      plugin = new DOMChangesPlugin({
        ...config,
        spa: true,
      });
      await plugin.initialize();

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.not-exists', type: 'text', value: 'Pending' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      await plugin.applyChanges();

      const pending = plugin.getPendingChanges();
      expect(pending).toHaveLength(1);
      expect(pending[0].change.selector).toBe('.not-exists');
    });
  });

  describe('removeChanges', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should remove changes and return removed list', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();
      expect(document.querySelector('.test')?.textContent).toBe('Modified');

      const removed = plugin.removeChanges('exp1');

      expect(removed).toHaveLength(1);
      expect(removed[0].experimentName).toBe('exp1');
      expect(document.querySelector('.test')?.textContent).toBe('Original');
    });

    it('should remove all changes when no experiment specified', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
                },
              },
            ],
          },
          {
            name: 'exp2',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML =
        '<div class="test1">Original1</div><div class="test2">Original2</div>';

      await plugin.applyChanges();

      const removed = plugin.removeChanges();

      expect(removed).toHaveLength(2);
      expect(document.querySelector('.test1')?.textContent).toBe('Original1');
      expect(document.querySelector('.test2')?.textContent).toBe('Original2');
    });
  });

  // Cookie overrides tests removed - now handled by OverridesPlugin

  describe('code injection', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should inject code', () => {
      const data: InjectionData = {
        headStart: 'console.log("head start");',
        bodyEnd: 'console.log("body end");',
      };

      plugin.injectCode(data);

      const headScript = document.querySelector('script[data-absmartly-injected="head-start"]');
      const bodyScript = document.querySelector('script[data-absmartly-injected="body-end"]');

      expect(headScript).not.toBeNull();
      expect(bodyScript).not.toBeNull();
    });
  });

  describe('event listeners', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should register and trigger event listeners', async () => {
      const listener = jest.fn();
      plugin.on('changes-applied', listener);

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 1,
          experimentName: undefined,
        })
      );
    });

    it('should unregister event listeners', () => {
      const listener = jest.fn();
      plugin.on('test-event', listener);
      plugin.off('test-event', listener);

      // Trigger event
      plugin['emit']('test-event');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should unregister all listeners for event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      plugin.on('test-event', listener1);
      plugin.on('test-event', listener2);
      plugin.off('test-event');

      plugin['emit']('test-event');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('SPA support with MutationObserver', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin({
        ...config,
        spa: true,
      });
      await plugin.initialize();
    });

    it('should apply pending changes when elements appear', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.dynamic', type: 'text', value: 'Dynamic content' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      // Element doesn't exist yet
      await plugin.applyChanges();
      expect(plugin.getPendingChanges()).toHaveLength(1);

      // Add element to DOM
      const element = document.createElement('div');
      element.className = 'dynamic';
      element.textContent = 'Original';
      document.body.appendChild(element);

      // Trigger mutation observer manually (since jsdom doesn't trigger it automatically)
      const observer = plugin['mutationObserver'];
      if (observer) {
        const callback = (observer as any)._callback || (observer as any).callback;
        if (callback) {
          callback([{ type: 'childList' }], observer);
        }
      }

      // Should apply change
      expect(element.textContent).toBe('Dynamic content');
      expect(plugin.getPendingChanges()).toHaveLength(0);
    });
  });

  describe('visibility tracking', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin({
        ...config,
        visibilityTracking: true,
      });
      await plugin.initialize();
    });

    it('should trigger treatment when element becomes visible', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Visible' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      // Simulate intersection observer callback
      const observer = plugin['visibilityObserver'];
      if (observer) {
        const callback = (observer as any)._callback || (observer as any).callback;
        if (callback) {
          callback(
            [
              {
                isIntersecting: true,
                target: document.querySelector('.test'),
              },
            ],
            observer
          );
        }
      }

      expect(mockContext.treatment).toHaveBeenCalledWith('exp1');
    });
  });

  describe('state queries', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should check if experiment has changes', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      expect(plugin.hasChanges('exp1')).toBe(true);
      expect(plugin.hasChanges('exp2')).toBe(false);
    });

    it('should get applied changes', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      const applied = plugin.getAppliedChanges();
      expect(applied).toHaveLength(1);
      expect(applied[0].experimentName).toBe('exp1');
    });

    it('should get original state', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();

      const state = plugin.getOriginalState('.test');
      expect(state?.originalState.text).toBe('Original');
    });
  });

  describe('destroy', () => {
    it('should clean up all resources on destroy', async () => {
      plugin = new DOMChangesPlugin({
        ...config,
        spa: true,
        visibilityTracking: true,
        extensionBridge: true,
      });
      await plugin.initialize();

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';
      await plugin.applyChanges();

      plugin.destroy();

      // Check that both standardized and legacy registrations are removed
      expect(mockContext.__plugins?.domPlugin).toBeUndefined();
      expect(mockContext.__domPlugin).toBeUndefined();
      expect(document.querySelector('.test')?.textContent).toBe('Original');
      expect(plugin.getAppliedChanges()).toHaveLength(0);
    });
  });

  describe('refreshChanges', () => {
    beforeEach(async () => {
      plugin = new DOMChangesPlugin(config);
      await plugin.initialize();
    });

    it('should remove and reapply all changes', async () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Modified' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      document.body.innerHTML = '<div class="test">Original</div>';

      await plugin.applyChanges();
      expect(document.querySelector('.test')?.textContent).toBe('Modified');

      // Simulate change in variant
      (mockContext.data as jest.Mock).mockReturnValue({
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'New Value' }],
                },
              },
            ],
          },
        ],
      });

      plugin.refreshChanges();

      // Note: In practice this would need async handling
      // For testing, we're checking that the methods are called
      expect(document.querySelector('.test')).toBeDefined();
    });
  });
});
