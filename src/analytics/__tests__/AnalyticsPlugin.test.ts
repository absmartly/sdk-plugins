import { AnalyticsPlugin } from '../AnalyticsPlugin';

describe('AnalyticsPlugin', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      track: jest.fn(),
      attributes: jest.fn(),
      __plugins: {},
    };
  });

  it('should prepend context.track to onEvent handlers', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    const config = (plugin as any).tracker.config;
    expect(Array.isArray(config.onEvent)).toBe(true);
    config.onEvent[0]('test_event', { key: 'val' });
    expect(mockContext.track).toHaveBeenCalledWith('test_event', { key: 'val' });
  });

  it('should prepend context.attributes to onAttribute handlers', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    const config = (plugin as any).tracker.config;
    expect(Array.isArray(config.onAttribute)).toBe(true);
    config.onAttribute[0]({ returning: true });
    expect(mockContext.attributes).toHaveBeenCalledWith({ returning: true });
  });

  it('should include custom onEvent handler', () => {
    const custom = jest.fn();
    const plugin = new AnalyticsPlugin({ context: mockContext, onEvent: custom });
    const config = (plugin as any).tracker.config;
    expect(config.onEvent.length).toBe(2);
    config.onEvent[1]('test', {});
    expect(custom).toHaveBeenCalled();
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

  it('should work without custom onEvent', () => {
    const plugin = new AnalyticsPlugin({ context: mockContext });
    const config = (plugin as any).tracker.config;
    expect(config.onEvent.length).toBe(1);
  });
});
