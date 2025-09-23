/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comprehensive Test Utilities for DOM Changes Plugin
 *
 * This file provides advanced utilities, mocks, and setup functions
 * to facilitate thorough testing of the DOM Changes Plugin.
 */

import { DOMChange, ContextData, ExperimentData, ABsmartlyContext } from '../types';

/**
 * Test Data Factories for creating test data
 */
export class TestDataFactory {
  static createExperiment(
    name: string,
    changes: DOMChange[],
    variantIndex: number = 0
  ): ExperimentData {
    const variants = [];
    for (let i = 0; i <= variantIndex; i++) {
      variants.push({
        variables: {
          __dom_changes: i === variantIndex ? changes : [],
        },
      });
    }

    return {
      name,
      variants,
    };
  }

  static createMultiVariantExperiment(name: string, variantChanges: DOMChange[][]): ExperimentData {
    return {
      name,
      variants: variantChanges.map(changes => ({
        variables: {
          __dom_changes: changes,
        },
      })),
    };
  }

  static createTextChange(
    selector: string,
    value: string,
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type: 'text',
      value,
      ...options,
    };
  }

  static createStyleChange(
    selector: string,
    styles: Record<string, string>,
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type: 'style',
      value: styles,
      ...options,
    };
  }

  static createClassChange(
    selector: string,
    add: string[] = [],
    remove: string[] = [],
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type: 'class',
      add,
      remove,
      ...options,
    };
  }

  static createMoveChange(
    selector: string,
    targetSelector: string,
    position: 'before' | 'after' | 'firstChild' | 'lastChild' = 'lastChild',
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type: 'move',
      targetSelector,
      position,
      ...options,
    };
  }

  static createViewportChange(
    selector: string,
    type: 'text' | 'style' | 'class',
    value: any,
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type,
      value,
      trigger_on_view: true,
      ...options,
    };
  }

  static createPendingChange(
    selector: string,
    type: 'text' | 'style',
    value: any,
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type,
      value,
      waitForElement: true,
      ...options,
    };
  }
}

/**
 * Mock ABsmartly Context factory with advanced configuration
 */
export class MockContextFactory {
  static create(experiments: ExperimentData[] = []): ABsmartlyContext {
    return {
      data: jest.fn().mockReturnValue({ experiments } as ContextData),
      peek: jest.fn().mockReturnValue(0),
      treatment: jest.fn().mockReturnValue(0),
      override: jest.fn(),
      customFieldValue: jest.fn().mockReturnValue(null),
    };
  }

  static withVariants(
    experiments: ExperimentData[],
    variants: Record<string, number>
  ): ABsmartlyContext {
    const context = this.create(experiments);
    (context.peek as jest.Mock).mockImplementation(
      (experimentName: string) => variants[experimentName] ?? 0
    );
    (context.treatment as jest.Mock).mockImplementation(
      (experimentName: string) => variants[experimentName] ?? 0
    );
    return context;
  }

  static withCustomFields(
    experiments: ExperimentData[],
    customFields: Record<string, Record<string, any>>
  ): ABsmartlyContext {
    const context = this.create(experiments);
    (context.customFieldValue as jest.Mock).mockImplementation(
      (experimentName: string, fieldName: string) =>
        customFields[experimentName]?.[fieldName] || null
    );
    return context;
  }

  static withTreatmentTracking(experiments: ExperimentData[]): {
    context: ABsmartlyContext;
    treatmentCalls: jest.Mock;
  } {
    const context = this.create(experiments);
    const treatmentCalls = context.treatment as jest.Mock;
    return { context, treatmentCalls };
  }
}

/**
 * DOM Test Utilities
 */
export class TestDOMUtils {
  /**
   * Create a comprehensive test page structure
   */
  static createTestPage(): void {
    document.body.innerHTML = `
      <div class="page-container">
        <header class="header">
          <div class="logo">Logo</div>
          <nav class="navigation">
            <a class="nav-link" href="#home">Home</a>
            <a class="nav-link" href="#about">About</a>
            <a class="nav-link" href="#contact">Contact</a>
          </nav>
          <button class="header-cta">Get Started</button>
        </header>
        
        <main class="main-content">
          <section class="hero">
            <h1 class="hero-title">Welcome to Our Site</h1>
            <p class="hero-description">This is a great description</p>
            <button class="hero-cta">Learn More</button>
          </section>
          
          <section class="features">
            <div class="feature-card">
              <h3 class="feature-title">Feature 1</h3>
              <p class="feature-description">Feature 1 description</p>
            </div>
            <div class="feature-card">
              <h3 class="feature-title">Feature 2</h3>
              <p class="feature-description">Feature 2 description</p>
            </div>
          </section>
          
          <section class="testimonials">
            <blockquote class="testimonial">
              <p class="testimonial-text">"Great product!"</p>
              <cite class="testimonial-author">John Doe</cite>
            </blockquote>
          </section>
        </main>
        
        <aside class="sidebar">
          <div class="sidebar-widget">
            <h4 class="widget-title">Recent Posts</h4>
            <ul class="widget-list">
              <li class="widget-item">Post 1</li>
              <li class="widget-item">Post 2</li>
            </ul>
          </div>
        </aside>
        
        <footer class="footer">
          <div class="footer-content">
            <p class="footer-text">© 2024 Company Name</p>
          </div>
        </footer>
      </div>
    `;
  }

  /**
   * Create elements for viewport testing
   */
  static createViewportTestElements(): void {
    document.body.innerHTML = `
      <div class="viewport-container" style="height: 200vh;">
        <div class="above-fold" style="height: 50vh;">
          <div class="visible-element">Visible Element</div>
        </div>
        <div class="below-fold" style="height: 50vh; margin-top: 100vh;">
          <div class="hidden-element">Hidden Element</div>
        </div>
      </div>
    `;
  }

  /**
   * Create dynamic content container for SPA testing
   */
  static createSPAContainer(): void {
    document.body.innerHTML = `
      <div class="spa-container">
        <div class="initial-content">Initial Content</div>
        <div class="dynamic-container"></div>
      </div>
    `;
  }

  /**
   * Add dynamic content (simulates SPA navigation)
   */
  static addDynamicContent(content: string): void {
    const container = document.querySelector('.dynamic-container');
    if (container) {
      container.innerHTML = content;
    }
  }

  /**
   * Simulate element intersection (visibility)
   */
  static simulateIntersection(element: Element, isIntersecting: boolean = true): void {
    // Find all IntersectionObserver instances and trigger their callbacks
    const observers = (globalThis as any).__intersectionObservers || [];
    observers.forEach((observer: any) => {
      if (observer.callback) {
        observer.callback([
          {
            target: element,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: isIntersecting ? element.getBoundingClientRect() : null,
            rootBounds: null,
            time: performance.now(),
          },
        ]);
      }
    });
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsync(ms: number = 10): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all ABsmartly modified elements
   */
  static getModifiedElements(): Element[] {
    return Array.from(document.querySelectorAll('[data-absmartly-modified="true"]'));
  }

  /**
   * Get elements modified by specific experiment
   */
  static getElementsByExperiment(experimentName: string): Element[] {
    return Array.from(document.querySelectorAll(`[data-absmartly-experiment="${experimentName}"]`));
  }
}

/**
 * Performance testing utilities
 */
export class TestPerformanceUtils {
  /**
   * Measure execution time of an async operation
   */
  static async measureAsync<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await operation();
    const duration = performance.now() - start;
    return { result, duration };
  }

  /**
   * Measure execution time of a sync operation
   */
  static measure<T>(operation: () => T): { result: T; duration: number } {
    const start = performance.now();
    const result = operation();
    const duration = performance.now() - start;
    return { result, duration };
  }

  /**
   * Create performance test scenario with many elements
   */
  static createPerformanceTestDOM(elementCount: number = 1000): void {
    const elements = Array.from(
      { length: elementCount },
      (_, i) => `<div class="perf-item-${i}" data-index="${i}">Performance Test Item ${i}</div>`
    ).join('');

    document.body.innerHTML = `
      <div class="performance-container">
        ${elements}
      </div>
    `;
  }

  /**
   * Generate bulk changes for performance testing
   */
  static createBulkChanges(count: number): DOMChange[] {
    return Array.from({ length: count }, (_, i) =>
      TestDataFactory.createTextChange(`.perf-item-${i}`, `Modified Item ${i}`)
    );
  }
}

/**
 * Memory testing utilities
 */
export class TestMemoryUtils {
  /**
   * Get current memory usage (if available)
   */
  static getMemoryUsage(): number | null {
    if ((performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }

  /**
   * Test for memory leaks by comparing before/after usage
   */
  static async testMemoryLeak<T>(
    setup: () => Promise<T>,
    teardown: (context: T) => Promise<void>,
    iterations: number = 10
  ): Promise<{ leaked: boolean; initialMemory: number | null; finalMemory: number | null }> {
    const initialMemory = this.getMemoryUsage();

    // Run multiple iterations to detect leaks
    for (let i = 0; i < iterations; i++) {
      const context = await setup();
      await teardown(context);

      // Force garbage collection if possible
      if (global.gc) {
        global.gc();
      }
    }

    const finalMemory = this.getMemoryUsage();

    return {
      leaked: initialMemory !== null && finalMemory !== null && finalMemory > initialMemory * 1.1,
      initialMemory,
      finalMemory,
    };
  }
}

/**
 * Advanced assertion utilities
 */
export class TestAssertions {
  /**
   * Assert that an element has been properly modified by ABsmartly
   */
  static expectElementModified(selector: string, experimentName?: string): void {
    const element = document.querySelector(selector);
    expect(element).not.toBeNull();
    expect(element?.getAttribute('data-absmartly-modified')).toBe('true');

    if (experimentName) {
      expect(element?.getAttribute('data-absmartly-experiment')).toBe(experimentName);
    }
  }

  /**
   * Assert that an element is in its original state
   */
  static expectElementUnmodified(selector: string): void {
    const element = document.querySelector(selector);
    expect(element).not.toBeNull();
    expect(element?.hasAttribute('data-absmartly-modified')).toBe(false);
    expect(element?.hasAttribute('data-absmartly-experiment')).toBe(false);
  }

  /**
   * Assert performance is within acceptable bounds
   */
  static expectPerformantOperation(
    duration: number,
    maxMs: number,
    operation: string = 'Operation'
  ): void {
    expect(duration).toBeLessThan(maxMs);
    if (duration > maxMs * 0.8) {
      logDebug(`${operation} took ${duration}ms, approaching limit of ${maxMs}ms`);
    }
  }

  /**
   * Assert no memory leaks
   */
  static expectNoMemoryLeak(memoryResult: {
    leaked: boolean;
    initialMemory: number | null;
    finalMemory: number | null;
  }): void {
    if (memoryResult.initialMemory !== null && memoryResult.finalMemory !== null) {
      expect(memoryResult.leaked).toBe(false);

      if (memoryResult.finalMemory > memoryResult.initialMemory) {
        // const increase = memoryResult.finalMemory - memoryResult.initialMemory;
        // const percentIncrease = (increase / memoryResult.initialMemory) * 100;
        // console.log(`Memory increased by ${increase} bytes (${percentIncrease.toFixed(2)}%)`);
      }
    }
  }

  /**
   * Assert DOM structure integrity
   */
  static expectValidDOMStructure(): void {
    // Check for orphaned ABsmartly attributes
    const modifiedWithoutExperiment = document.querySelectorAll(
      '[data-absmartly-modified]:not([data-absmartly-experiment])'
    );
    expect(modifiedWithoutExperiment).toHaveLength(0);

    const experimentWithoutModified = document.querySelectorAll(
      '[data-absmartly-experiment]:not([data-absmartly-modified])'
    );
    expect(experimentWithoutModified).toHaveLength(0);
  }

  /**
   * Assert that style modifications are applied correctly
   */
  static expectStylesApplied(selector: string, expectedStyles: Record<string, string>): void {
    const element = document.querySelector(selector) as HTMLElement;
    expect(element).not.toBeNull();

    Object.entries(expectedStyles).forEach(([property, value]) => {
      const computedStyle = getComputedStyle(element);
      expect(computedStyle.getPropertyValue(property)).toBe(value);
    });
  }
}

/**
 * Integration test helpers
 */
export class IntegrationTestHelpers {
  /**
   * Create a complete A/B test scenario
   */
  static createABTestScenario(testName: string): {
    experiment: ExperimentData;
    setupDOM: () => void;
    verifyVariantA: () => void;
    verifyVariantB: () => void;
  } {
    const experiment = TestDataFactory.createMultiVariantExperiment(testName, [
      [], // Control variant
      [
        // Treatment variant
        TestDataFactory.createTextChange('.hero-title', 'Treatment Title'),
        TestDataFactory.createStyleChange('.hero-cta', { backgroundColor: 'red' }),
      ],
    ]);

    return {
      experiment,
      setupDOM: TestDOMUtils.createTestPage,
      verifyVariantA: () => {
        expect(document.querySelector('.hero-title')?.textContent).toBe('Welcome to Our Site');
        expect((document.querySelector('.hero-cta') as HTMLElement)?.style.backgroundColor).toBe(
          ''
        );
      },
      verifyVariantB: () => {
        expect(document.querySelector('.hero-title')?.textContent).toBe('Treatment Title');
        expect((document.querySelector('.hero-cta') as HTMLElement)?.style.backgroundColor).toBe(
          'red'
        );
      },
    };
  }

  /**
   * Create a viewport-triggered test scenario
   */
  static createViewportTestScenario(): {
    experiment: ExperimentData;
    setupDOM: () => void;
    triggerViewport: () => void;
  } {
    const experiment = TestDataFactory.createExperiment('viewport_test', [
      TestDataFactory.createViewportChange('.hidden-element', 'text', 'Now Visible!'),
    ]);

    return {
      experiment,
      setupDOM: TestDOMUtils.createViewportTestElements,
      triggerViewport: () => {
        const element = document.querySelector('.hidden-element');
        if (element) {
          TestDOMUtils.simulateIntersection(element, true);
        }
      },
    };
  }
}

export default {
  TestDataFactory,
  MockContextFactory,
  TestDOMUtils,
  TestPerformanceUtils,
  TestMemoryUtils,
  TestAssertions,
  IntegrationTestHelpers,
};
