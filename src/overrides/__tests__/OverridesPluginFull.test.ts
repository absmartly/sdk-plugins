import { OverridesPluginFull } from '../OverridesPluginFull';
import { OverridesPlugin } from '../OverridesPlugin';

describe('OverridesPluginFull', () => {
  it('should extend OverridesPlugin', () => {
    const mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({}),
      peek: jest.fn(),
      ready: jest.fn().mockResolvedValue(undefined),
    };

    const plugin = new OverridesPluginFull({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
    });

    // Verify it's an instance of both classes
    expect(plugin).toBeInstanceOf(OverridesPluginFull);
    expect(plugin).toBeInstanceOf(OverridesPlugin);
  });

  it('should have all methods from OverridesPlugin', () => {
    const mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({}),
      peek: jest.fn(),
      ready: jest.fn().mockResolvedValue(undefined),
    };

    const plugin = new OverridesPluginFull({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
    });

    // Check that key methods exist
    expect(typeof plugin.initialize).toBe('function');
    expect(typeof plugin.onExperimentsAdded).toBe('function');
    expect(typeof plugin.destroy).toBe('function');
  });

  it('should behave identically to OverridesPlugin', async () => {
    const mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({ experiments: [] }),
      peek: jest.fn(),
      ready: jest.fn().mockResolvedValue(undefined),
    };

    const fullPlugin = new OverridesPluginFull({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
      debug: false,
    });

    const basePlugin = new OverridesPlugin({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
      debug: false,
    });

    // Initialize both
    await fullPlugin.initialize();
    await basePlugin.initialize();

    // Both should have called context methods the same way
    expect(mockContext.override).toHaveBeenCalledTimes(0); // No overrides to apply
  });

  it('should register with context on initialization', async () => {
    const mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({ experiments: [] }),
      peek: jest.fn(),
      ready: jest.fn().mockResolvedValue(undefined),
      __plugins: undefined as any,
    };

    const plugin = new OverridesPluginFull({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
    });

    await plugin.initialize();

    // Check registration
    expect(mockContext.__plugins).toBeDefined();
    expect(mockContext.__plugins?.overridesPlugin).toBeDefined();
    expect(mockContext.__plugins?.overridesPlugin?.name).toBe('OverridesPlugin');
    expect(mockContext.__plugins?.overridesPlugin?.version).toBe('1.0.0');
    expect(mockContext.__plugins?.overridesPlugin?.initialized).toBe(true);
    expect(mockContext.__plugins?.overridesPlugin?.capabilities).toContain('cookie-overrides');
    expect(mockContext.__plugins?.overridesPlugin?.capabilities).toContain('api-fetch');
    expect(mockContext.__plugins?.overridesPlugin?.instance).toBe(plugin);
  });

  it('should unregister from context on destroy', async () => {
    const mockContext = {
      override: jest.fn(),
      data: jest.fn().mockReturnValue({ experiments: [] }),
      peek: jest.fn(),
      ready: jest.fn().mockResolvedValue(undefined),
      __plugins: undefined as any,
    };

    const plugin = new OverridesPluginFull({
      context: mockContext as any,
      sdkEndpoint: 'https://test.absmartly.io',
    });

    await plugin.initialize();
    expect(mockContext.__plugins?.overridesPlugin).toBeDefined();

    plugin.destroy();
    expect(mockContext.__plugins?.overridesPlugin).toBeUndefined();
  });
});
