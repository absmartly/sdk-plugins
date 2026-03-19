let capturedConfig: any;

jest.mock('@absmartly/dom-tracker', () => ({
  DOMTracker: jest.fn().mockImplementation((config: any) => {
    capturedConfig = config;
    return { destroy: jest.fn(), config };
  }),
}));

import { AnalyticsPlugin } from '../AnalyticsPlugin';

describe('AnalyticsPlugin', () => {
  let mockContext: any;

  beforeEach(() => {
    capturedConfig = null;
    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      track: jest.fn(),
      attributes: jest.fn(),
      __plugins: {},
    };
  });

  it('should create a DOMTracker with context.track prepended to onEvent', () => {
    new AnalyticsPlugin({ context: mockContext });
    expect(capturedConfig).toBeDefined();
    expect(Array.isArray(capturedConfig.onEvent)).toBe(true);
    capturedConfig.onEvent[0]('test_event', { key: 'val' });
    expect(mockContext.track).toHaveBeenCalledWith('test_event', { key: 'val' });
  });

  it('should create a DOMTracker with context.attributes prepended to onAttribute', () => {
    new AnalyticsPlugin({ context: mockContext });
    expect(Array.isArray(capturedConfig.onAttribute)).toBe(true);
    capturedConfig.onAttribute[0]({ returning: true });
    expect(mockContext.attributes).toHaveBeenCalledWith({ returning: true });
  });

  it('should include custom onEvent handler after context.track', () => {
    const custom = jest.fn();
    new AnalyticsPlugin({ context: mockContext, onEvent: custom });
    expect(capturedConfig.onEvent.length).toBe(2);
    capturedConfig.onEvent[1]('test', {});
    expect(custom).toHaveBeenCalled();
  });

  it('should pass through trackerConfig to DOMTracker', () => {
    new AnalyticsPlugin({ context: mockContext, spa: true, debug: true });
    expect(capturedConfig.spa).toBe(true);
    expect(capturedConfig.debug).toBe(true);
  });

  it('should register in context.__plugins', () => {
    new AnalyticsPlugin({ context: mockContext });
    expect(mockContext.__plugins.analytics).toBeDefined();
    expect(mockContext.__plugins.analytics.name).toBe('analytics');
  });

  it('should unregister on destroy', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    plugin.destroy();
    expect(mockContext.__plugins.analytics).toBeUndefined();
  });

  it('should be idempotent on destroy', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    plugin.destroy();
    plugin.destroy();
  });

  it('should call DOMTracker.destroy on destroy', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    const destroySpy = (plugin as any).tracker.destroy;
    plugin.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('should work without custom onEvent — only context.track', () => {
    new AnalyticsPlugin({ context: mockContext });
    expect(capturedConfig.onEvent.length).toBe(1);
  });
});
