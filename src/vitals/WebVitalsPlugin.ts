/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from '@absmartly/javascript-sdk';
import { logDebug } from '../utils/debug';

export interface WebVitalsPluginOptions {
  context?: Context;
  debug?: boolean;
  trackWebVitals?: boolean;
  trackPageMetrics?: boolean;
  autoTrack?: boolean;
}

export interface Metric {
  value: number;
  delta?: number;
  id?: string;
  name?: string;
  rating?: 'good' | 'needs-improvement' | 'poor';
  entries?: unknown[];
}

export class WebVitalsPlugin {
  private context?: Context;
  private debug: boolean;
  private trackWebVitals: boolean;
  private trackPageMetrics: boolean;
  private autoTrack: boolean;
  private webVitalsLoaded: boolean = false;
  private metricsTracked: boolean = false;
  private webVitalsPromise?: Promise<void>;

  constructor(options: WebVitalsPluginOptions = {}) {
    this.context = options.context;
    this.debug = options.debug || false;
    this.trackWebVitals = options.trackWebVitals !== false;
    this.trackPageMetrics = options.trackPageMetrics !== false;
    this.autoTrack = options.autoTrack !== false;

    // ✨ OPTIMIZATION: Start loading web-vitals library immediately in constructor
    // This allows the HTTP request to happen in parallel with other initialization
    if (typeof window !== 'undefined' && this.trackWebVitals) {
      this.webVitalsPromise = this.loadWebVitalsLibrary();
      this.debugLog('Started pre-loading web-vitals library');
    }
  }

  private debugLog(...args: unknown[]): void {
    if (this.debug) {
      logDebug('[WebVitalsPlugin]', ...args);
    }
  }

  public setContext(context: Context): void {
    this.context = context;
    this.debugLog('Context set for WebVitalsPlugin');
  }

  private async loadWebVitalsLibrary(): Promise<any> {
    if (this.webVitalsLoaded || typeof window === 'undefined') {
      return null;
    }

    try {
      // ✨ OPTIMIZATION: Import from bundled package instead of CDN
      // Much faster and more reliable than script tag injection
      const webVitals = await import('web-vitals');
      this.webVitalsLoaded = true;
      this.debugLog('Web Vitals library loaded from bundle');
      return webVitals;
    } catch (error) {
      logDebug('[WebVitalsPlugin] Failed to load Web Vitals library:', error);
      throw error;
    }
  }

  public async trackWebVitalsMetrics(context?: Context): Promise<void> {
    const ctx = context || this.context;
    if (!ctx) {
      logDebug('[WebVitalsPlugin] No context available for tracking web vitals');
      return;
    }

    if (!this.trackWebVitals) {
      return;
    }

    try {
      // ✨ OPTIMIZATION: Use pre-loaded promise from constructor
      // If the promise exists, it's already loading in the background
      let webVitals: any;
      if (this.webVitalsPromise) {
        webVitals = await this.webVitalsPromise;
      } else {
        // Fallback: Load now if not started in constructor
        webVitals = await this.loadWebVitalsLibrary();
      }

      if (!webVitals) {
        logDebug('[WebVitalsPlugin] Web Vitals library not available');
        return;
      }

      // Track Core Web Vitals
      webVitals.onCLS((metric: Metric) => {
        this.debugLog('CLS:', metric);
        ctx.track('cls_score', { ...metric });
      });

      webVitals.onLCP((metric: Metric) => {
        this.debugLog('LCP:', metric);
        ctx.track('lcp_score', { ...metric });
      });

      webVitals.onFCP((metric: Metric) => {
        this.debugLog('FCP:', metric);
        ctx.track('fcp_score', { ...metric });
      });

      webVitals.onINP((metric: Metric) => {
        this.debugLog('INP:', metric);
        ctx.track('inp_score', { ...metric });
      });

      webVitals.onTTFB((metric: Metric) => {
        this.debugLog('TTFB:', metric);
        ctx.track('ttfb_score', { ...metric });
      });

      this.debugLog('Web Vitals tracking initialized');
    } catch (error) {
      logDebug('[WebVitalsPlugin] Error tracking web vitals:', error);
      ctx.track('vitals_tracking_error', {
        error: (error as Error).message,
        type: (error as Error).name,
      });
    }
  }

  public trackPageMetricsData(context?: Context): void {
    const ctx = context || this.context;
    if (!ctx) {
      logDebug('[WebVitalsPlugin] No context available for tracking page metrics');
      return;
    }

    if (!this.trackPageMetrics || this.metricsTracked) {
      return;
    }

    try {
      // Track immediate metrics
      this.trackImmediateMetrics(ctx);

      // Track load-dependent metrics
      if (document.readyState === 'complete') {
        this.trackLoadMetrics(ctx);
      } else {
        window.addEventListener('load', () => this.trackLoadMetrics(ctx));
      }

      this.metricsTracked = true;
    } catch (error) {
      logDebug('[WebVitalsPlugin] Error tracking page metrics:', error);
      ctx.track('metrics_tracking_error', {
        error: (error as Error).message,
        type: (error as Error).name,
      });
    }
  }

  private trackImmediateMetrics(context: Context): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!navigation) {
      this.debugLog('Navigation timing not available');
      return;
    }

    // Network timing metrics
    const timingMetrics: Record<string, number> = {
      dns: navigation.domainLookupEnd - navigation.domainLookupStart,
      tcp: navigation.connectEnd - navigation.connectStart,
      ttfb: navigation.responseStart - navigation.requestStart,
      download: navigation.responseEnd - navigation.responseStart,
      total_fetch: navigation.responseEnd - navigation.requestStart,
    };

    for (const [metric, value] of Object.entries(timingMetrics)) {
      context.track(`page_timing_${metric}`, {
        value,
        unit: 'ms',
      });
      this.debugLog(`Page timing ${metric}:`, value);
    }

    // Size metrics
    const sizeMetrics: Record<string, number> = {
      total_size: navigation.transferSize,
      header_size: navigation.transferSize - navigation.encodedBodySize,
      html_size: navigation.decodedBodySize,
      compressed_html_size: navigation.encodedBodySize,
    };

    for (const [metric, value] of Object.entries(sizeMetrics)) {
      context.track(`page_${metric}`, {
        value,
        unit: 'bytes',
      });
      this.debugLog(`Page ${metric}:`, value);
    }

    // Compression ratio
    if (navigation.encodedBodySize > 0) {
      const compressionRatio = navigation.decodedBodySize / navigation.encodedBodySize;
      context.track('page_compression_ratio', {
        value: compressionRatio,
      });
      this.debugLog('Compression ratio:', compressionRatio);
    }
  }

  private trackLoadMetrics(context: Context): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!navigation) {
      return;
    }

    // DOM processing and total load time
    const domProcessing = navigation.domComplete - navigation.responseEnd;
    context.track('page_timing_dom_processing', {
      value: domProcessing,
      metric: 'DOM Processing',
      unit: 'ms',
      rating: domProcessing <= 500 ? 'good' : domProcessing <= 1000 ? 'needs-improvement' : 'poor',
    });
    this.debugLog('DOM processing:', domProcessing);

    const totalLoad = navigation.loadEventEnd - navigation.fetchStart;
    context.track('page_timing_total_load', {
      value: totalLoad,
      metric: 'Total Load',
      unit: 'ms',
      rating: totalLoad <= 2000 ? 'good' : totalLoad <= 4000 ? 'needs-improvement' : 'poor',
    });
    this.debugLog('Total load:', totalLoad);

    // DOM element counts
    const domMetrics: Record<string, number> = {
      elements: document.getElementsByTagName('*').length,
      imageCount: document.getElementsByTagName('img').length,
      scriptCount: document.getElementsByTagName('script').length,
      styleCount: document.getElementsByTagName('style').length,
      linkCount: document.getElementsByTagName('link').length,
    };

    for (const [metric, value] of Object.entries(domMetrics)) {
      context.track(`dom_${metric}`, {
        value,
        metric,
        unit: 'count',
        rating: value <= 1000 ? 'good' : value <= 2000 ? 'needs-improvement' : 'poor',
      });
      this.debugLog(`DOM ${metric}:`, value);
    }
  }

  public async initialize(): Promise<void> {
    this.debugLog('Initializing WebVitalsPlugin');

    if (!this.context) {
      this.debugLog('No context available during initialization');
      return;
    }

    if (this.autoTrack) {
      // ✨ OPTIMIZATION: Don't await - let tracking start in background
      // context.track() can be called before context.ready()
      if (this.trackWebVitals) {
        // Start tracking (don't await - runs in parallel)
        this.trackWebVitalsMetrics();
      }

      // Start tracking page metrics (also doesn't need to wait)
      if (this.trackPageMetrics) {
        this.trackPageMetricsData();
      }
    }

    this.debugLog('WebVitalsPlugin initialized successfully');
  }

  public reset(): void {
    this.metricsTracked = false;
    this.debugLog('WebVitalsPlugin reset');
  }
}
