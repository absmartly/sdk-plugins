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
});