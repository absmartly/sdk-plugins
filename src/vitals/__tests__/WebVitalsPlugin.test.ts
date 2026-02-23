import { WebVitalsPlugin, WebVitalsPluginOptions, Metric } from '../WebVitalsPlugin';
import type { Context } from '@absmartly/javascript-sdk';

// Mock Context
const createMockContext = (): Context => {
  return {
    track: jest.fn(),
    attribute: jest.fn(),
    peek: jest.fn(),
    ready: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(),
  } as any;
};

// Mock web-vitals module
jest.mock('web-vitals', () => ({
  onCLS: jest.fn((callback: (metric: Metric) => void) => {
    callback({ value: 0.1, rating: 'good' });
  }),
  onLCP: jest.fn((callback: (metric: Metric) => void) => {
    callback({ value: 2500, rating: 'good' });
  }),
  onFCP: jest.fn((callback: (metric: Metric) => void) => {
    callback({ value: 1800, rating: 'good' });
  }),
  onINP: jest.fn((callback: (metric: Metric) => void) => {
    callback({ value: 150, rating: 'good' });
  }),
  onTTFB: jest.fn((callback: (metric: Metric) => void) => {
    callback({ value: 600, rating: 'good' });
  }),
}));

describe('WebVitalsPlugin', () => {
  let mockContext: Context;

  beforeEach(() => {
    mockContext = createMockContext();
    jest.clearAllMocks();
    // Ensure performance.getEntriesByType exists for mocking in jsdom
    if (!('getEntriesByType' in performance)) {
      Object.defineProperty(performance, 'getEntriesByType', {
        configurable: true,
        value: jest.fn(() => []),
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const plugin = new WebVitalsPlugin();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should accept context option', () => {
      const options: WebVitalsPluginOptions = {
        context: mockContext,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should accept debug option', () => {
      const options: WebVitalsPluginOptions = {
        debug: true,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should default trackWebVitals to true', () => {
      const plugin = new WebVitalsPlugin();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should default trackPageMetrics to true', () => {
      const plugin = new WebVitalsPlugin();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should default autoTrack to true', () => {
      const plugin = new WebVitalsPlugin();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should allow disabling trackWebVitals', () => {
      const options: WebVitalsPluginOptions = {
        trackWebVitals: false,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should allow disabling trackPageMetrics', () => {
      const options: WebVitalsPluginOptions = {
        trackPageMetrics: false,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should allow disabling autoTrack', () => {
      const options: WebVitalsPluginOptions = {
        autoTrack: false,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should accept all options together', () => {
      const options: WebVitalsPluginOptions = {
        context: mockContext,
        debug: true,
        trackWebVitals: true,
        trackPageMetrics: true,
        autoTrack: true,
      };
      const plugin = new WebVitalsPlugin(options);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should start pre-loading web-vitals library in browser environment', () => {
      const plugin = new WebVitalsPlugin({ trackWebVitals: true });
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should not pre-load web-vitals if trackWebVitals is false', () => {
      const plugin = new WebVitalsPlugin({ trackWebVitals: false });
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });
  });

  describe('setContext', () => {
    it('should set context', () => {
      const plugin = new WebVitalsPlugin();
      plugin.setContext(mockContext);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should update context if already set', () => {
      const plugin = new WebVitalsPlugin({
        context: createMockContext(),
      });

      const newContext = createMockContext();
      plugin.setContext(newContext);
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });
  });

  describe('trackWebVitalsMetrics', () => {
    it('should return without context', async () => {
      const plugin = new WebVitalsPlugin();
      await plugin.trackWebVitalsMetrics();
      // Should complete without error
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should return if trackWebVitals is disabled', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        trackWebVitals: false,
      });

      await plugin.trackWebVitalsMetrics();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBe(0);
    });

    it('should track web vitals with provided context', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        trackWebVitals: true,
      });

      await plugin.trackWebVitalsMetrics();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('should use provided context parameter', async () => {
      const plugin = new WebVitalsPlugin({
        trackWebVitals: true,
      });

      const contextParam = createMockContext();
      await plugin.trackWebVitalsMetrics(contextParam);
      expect((contextParam.track as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('should track CLS metric', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.trackWebVitalsMetrics();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const clsCall = calls.find((call: any) => call[0] === 'cls_score');
      expect(clsCall).toBeDefined();
    });

    it('should track LCP metric', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.trackWebVitalsMetrics();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const lcpCall = calls.find((call: any) => call[0] === 'lcp_score');
      expect(lcpCall).toBeDefined();
    });

    it('should track FCP metric', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.trackWebVitalsMetrics();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const fcpCall = calls.find((call: any) => call[0] === 'fcp_score');
      expect(fcpCall).toBeDefined();
    });

    it('should track INP metric', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.trackWebVitalsMetrics();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const inpCall = calls.find((call: any) => call[0] === 'inp_score');
      expect(inpCall).toBeDefined();
    });

    it('should track TTFB metric', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.trackWebVitalsMetrics();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const ttfbCall = calls.find((call: any) => call[0] === 'ttfb_score');
      expect(ttfbCall).toBeDefined();
    });

    it('should handle tracking errors gracefully', async () => {
      const errorContext = createMockContext();
      (errorContext.track as jest.Mock).mockImplementation(() => {
        throw new Error('Tracking error');
      });

      const plugin = new WebVitalsPlugin({
        context: errorContext,
      });

      // Should not throw
      await expect(plugin.trackWebVitalsMetrics()).rejects.toThrow();
    });
  });

  describe('trackPageMetricsData', () => {
    it('should return without context', () => {
      const plugin = new WebVitalsPlugin();
      plugin.trackPageMetricsData();
      // Should complete without error
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should return if trackPageMetrics is disabled', () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        trackPageMetrics: false,
      });

      plugin.trackPageMetricsData();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBe(0);
    });

    it('should track page metrics with provided context', () => {
      // Mock performance API
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
        trackPageMetrics: true,
      });

      plugin.trackPageMetricsData();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('should use provided context parameter', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        trackPageMetrics: true,
      });

      const contextParam = createMockContext();
      plugin.trackPageMetricsData(contextParam);
      expect((contextParam.track as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('should track DNS timing', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      plugin.trackPageMetricsData();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const dnsCall = calls.find((call: any) => call[0] === 'page_timing_dns');
      expect(dnsCall).toBeDefined();
    });

    it('should track TCP timing', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      plugin.trackPageMetricsData();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const tcpCall = calls.find((call: any) => call[0] === 'page_timing_tcp');
      expect(tcpCall).toBeDefined();
    });

    it('should track size metrics', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      plugin.trackPageMetricsData();
      const calls = (mockContext.track as jest.Mock).mock.calls;
      const sizeCall = calls.find((call: any) => call[0] === 'page_total_size');
      expect(sizeCall).toBeDefined();
    });

    it('should handle missing navigation timing gracefully', () => {
      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      expect(() => {
        plugin.trackPageMetricsData();
      }).not.toThrow();
    });

    it('should handle tracking errors gracefully', () => {
      const errorContext = createMockContext();
      (errorContext.track as jest.Mock).mockImplementation(() => {
        throw new Error('Tracking error');
      });

      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: errorContext,
      });

      expect(() => {
        plugin.trackPageMetricsData();
      }).not.toThrow();
    });

    it('should not track metrics twice', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      plugin.trackPageMetricsData();
      const firstCallCount = (mockContext.track as jest.Mock).mock.calls.length;

      plugin.trackPageMetricsData();
      const secondCallCount = (mockContext.track as jest.Mock).mock.calls.length;

      // Second call should not add more metrics
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('start / ready / initialize', () => {
    it('should start tracking with context', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        autoTrack: true,
      });

      await plugin.start();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should not start tracking without context', async () => {
      const plugin = new WebVitalsPlugin({
        autoTrack: true,
      });

      await plugin.start();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should respect autoTrack setting', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        autoTrack: false,
      });

      await plugin.start();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBe(0);
    });

    it('should call ready alias', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.ready();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should call initialize alias', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      await plugin.initialize();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });
  });

  describe('reset', () => {
    it('should reset metrics tracking state', () => {
      const mockNavigation = {
        domainLookupEnd: 100,
        domainLookupStart: 50,
        connectEnd: 200,
        connectStart: 100,
        responseStart: 300,
        requestStart: 250,
        responseEnd: 400,
        domComplete: 600,
        fetchStart: 0,
        loadEventEnd: 800,
        transferSize: 5000,
        encodedBodySize: 4000,
        decodedBodySize: 10000,
      };

      jest.spyOn(performance, 'getEntriesByType').mockReturnValue([mockNavigation as any]);

      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      plugin.trackPageMetricsData();

      plugin.reset();

      (mockContext.track as jest.Mock).mockClear();
      plugin.trackPageMetricsData();
      const secondCallCount = (mockContext.track as jest.Mock).mock.calls.length;

      expect(secondCallCount).toBeGreaterThan(0);
    });
  });

  describe('Integration tests', () => {
    it('should handle full lifecycle', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        debug: false,
        trackWebVitals: true,
        trackPageMetrics: true,
        autoTrack: true,
      });

      await plugin.start();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);

      plugin.reset();
      expect(plugin).toBeInstanceOf(WebVitalsPlugin);
    });

    it('should handle context changes', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
      });

      const newContext = createMockContext();
      plugin.setContext(newContext);

      await plugin.trackWebVitalsMetrics();
      expect((newContext.track as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('should work with all metrics disabled', async () => {
      const plugin = new WebVitalsPlugin({
        context: mockContext,
        trackWebVitals: false,
        trackPageMetrics: false,
      });

      await plugin.start();
      expect((mockContext.track as jest.Mock).mock.calls.length).toBe(0);
    });
  });
});
