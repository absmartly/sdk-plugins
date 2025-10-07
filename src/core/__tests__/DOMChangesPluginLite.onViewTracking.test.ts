import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { MockContextFactory } from '../../__tests__/test-utils';
import { ExperimentData } from '../../types';

describe('DOMChangesPluginLite - On-View Tracking', () => {
  let plugin: DOMChangesPluginLite;
  let intersectionObserverCallback: IntersectionObserverCallback;
  let observedElements: Map<Element, IntersectionObserverEntry>;

  beforeEach(() => {
    document.body.innerHTML = '';
    observedElements = new Map();

    if (typeof DOMRect === 'undefined') {
      global.DOMRect = class DOMRect {
        constructor(
          public x = 0,
          public y = 0,
          public width = 0,
          public height = 0
        ) {}
        get left() {
          return this.x;
        }
        get right() {
          return this.x + this.width;
        }
        get top() {
          return this.y;
        }
        get bottom() {
          return this.y + this.height;
        }
        toJSON() {
          return JSON.stringify(this);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }

    global.IntersectionObserver = jest.fn().mockImplementation(callback => {
      intersectionObserverCallback = callback;
      return {
        observe: jest.fn((element: Element) => {
          observedElements.set(element, {
            target: element,
            isIntersecting: false,
            intersectionRatio: 0,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: new DOMRect(),
            rootBounds: null,
            time: Date.now(),
          } as IntersectionObserverEntry);
        }),
        unobserve: jest.fn((element: Element) => {
          observedElements.delete(element);
        }),
        disconnect: jest.fn(() => {
          observedElements.clear();
        }),
        root: null,
        rootMargin: '',
        thresholds: [0.01],
        takeRecords: jest.fn(() => []),
      };
    });
  });

  afterEach(() => {
    if (plugin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exposureTracker = (plugin as any).exposureTracker;
      if (exposureTracker) {
        exposureTracker.destroy();
      }
    }
    jest.clearAllMocks();
  });

  async function triggerIntersection(
    element: Element,
    isIntersecting: boolean = true
  ): Promise<void> {
    const entry = observedElements.get(element);
    if (!entry) {
      // Element not observed - this can happen if the experiment was already triggered and cleaned up
      // Just return silently as this is expected behavior
      return;
    }

    const updatedEntry: IntersectionObserverEntry = {
      ...entry,
      isIntersecting,
      intersectionRatio: isIntersecting ? 0.5 : 0,
    };

    intersectionObserverCallback([updatedEntry], {} as IntersectionObserver);

    await new Promise(resolve => setTimeout(resolve, 10));
  }

  function createTreatmentTracker(
    experiments: ExperimentData[],
    assignedVariants: Record<string, number>
  ) {
    const treatmentSpy = jest.fn();
    const mockContext = MockContextFactory.create(experiments);

    (mockContext.peek as jest.Mock).mockImplementation(
      (expName: string) => assignedVariants[expName] ?? 0
    );

    (mockContext.ready as jest.Mock).mockResolvedValue(undefined);

    (mockContext.treatment as jest.Mock).mockImplementation((expName: string) => {
      treatmentSpy(expName);
      return assignedVariants[expName] ?? 0;
    });

    return { mockContext, treatmentSpy };
  }

  function findPlaceholders(experimentName: string): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-absmartly-placeholder="true"]')).filter(
      el => el.getAttribute('data-absmartly-experiment') === experimentName
    ) as HTMLElement[];
  }

  function verifyPlaceholderExists(experimentName: string, originalSelector: string): boolean {
    const placeholders = findPlaceholders(experimentName);
    return placeholders.some(
      p => p.getAttribute('data-absmartly-original-selector') === originalSelector
    );
  }

  describe('Basic Viewport Triggers', () => {
    it('should call treatment() immediately for changes without trigger_on_view', async () => {
      const experiment: ExperimentData = {
        name: 'immediate_test',
        variants: [
          {
            variables: {
              __dom_changes: [{ selector: '.test', type: 'text', value: 'Control' }],
            },
          },
          {
            variables: {
              __dom_changes: [{ selector: '.test', type: 'text', value: 'Treatment' }],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        immediate_test: 1,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('immediate_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should wait for element visibility before calling treatment() with trigger_on_view', async () => {
      const experiment: ExperimentData = {
        name: 'viewport_test',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Treatment', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        viewport_test: 1,
      });
      document.body.innerHTML = '<div class="hero">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const heroElement = document.querySelector('.hero')!;
      await triggerIntersection(heroElement, true);

      expect(treatmentSpy).toHaveBeenCalledWith('viewport_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should trigger exposure only once even when multiple elements become visible', async () => {
      const experiment: ExperimentData = {
        name: 'once_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'style',
                  value: { color: 'red' },
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { once_test: 0 });
      document.body.innerHTML =
        '<div class="item">Item 1</div><div class="item">Item 2</div><div class="item">Item 3</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const items = document.querySelectorAll('.item');
      for (const item of items) {
        await triggerIntersection(item, true);
      }

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should not trigger exposure when element is not intersecting', async () => {
      const experiment: ExperimentData = {
        name: 'not_visible_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Treatment', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        not_visible_test: 0,
      });
      document.body.innerHTML = '<div class="hero">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const heroElement = document.querySelector('.hero')!;
      await triggerIntersection(heroElement, false);

      expect(treatmentSpy).not.toHaveBeenCalled();
    });
  });

  describe('Cross-Variant Tracking (SRM Prevention)', () => {
    it('should track exposure when user is in variant 0 and variant 1 has trigger_on_view', async () => {
      const experiment: ExperimentData = {
        name: 'cross_variant_test',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Treatment', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        cross_variant_test: 0,
      });
      document.body.innerHTML = '<div class="hero">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const heroElement = document.querySelector('.hero')!;
      await triggerIntersection(heroElement, true);

      expect(treatmentSpy).toHaveBeenCalledWith('cross_variant_test');
    });

    it('should track all variants when any variant element with trigger_on_view becomes visible', async () => {
      const experiment: ExperimentData = {
        name: 'multi_variant_tracking',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Control', trigger_on_view: true },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Treatment A', trigger_on_view: true },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                { selector: '.other', type: 'text', value: 'Treatment B', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_variant_tracking: 0,
      });
      document.body.innerHTML = '<div class="hero">Original</div><div class="other">Other</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const heroElement = document.querySelector('.hero')!;
      await triggerIntersection(heroElement, true);

      expect(treatmentSpy).toHaveBeenCalledWith('multi_variant_tracking');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      const otherElement = document.querySelector('.other')!;
      await triggerIntersection(otherElement, true);

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should track when different selectors in different variants become visible', async () => {
      const experiment: ExperimentData = {
        name: 'different_selectors',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.element-a', type: 'text', value: 'Control A', trigger_on_view: true },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.element-b',
                  type: 'text',
                  value: 'Treatment B',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        different_selectors: 0,
      });
      document.body.innerHTML = '<div class="element-a">A</div><div class="element-b">B</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const elementA = document.querySelector('.element-a')!;
      await triggerIntersection(elementA, true);

      expect(treatmentSpy).toHaveBeenCalledWith('different_selectors');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Move Changes Cross-Variant Tracking', () => {
    it('should create placeholder for move change in other variant', async () => {
      const experiment: ExperimentData = {
        name: 'move_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'style',
                  value: { color: 'blue' },
                  trigger_on_view: true,
                },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.target-container',
                  position: 'lastChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { move_test: 0 });
      document.body.innerHTML = `
        <div class="original-container">
          <div class="item">Item</div>
        </div>
        <div class="target-container"></div>
      `;

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const placeholders = findPlaceholders('move_test');
      expect(placeholders.length).toBeGreaterThan(0);

      const targetContainer = document.querySelector('.target-container');
      const placeholderInTarget = Array.from(targetContainer?.children || []).some(el =>
        el.hasAttribute('data-absmartly-placeholder')
      );
      expect(placeholderInTarget).toBe(true);

      const placeholder = placeholders[0];
      await triggerIntersection(placeholder, true);

      expect(treatmentSpy).toHaveBeenCalledWith('move_test');
    });

    it('should track moved element when user is in variant with move change', async () => {
      const experiment: ExperimentData = {
        name: 'move_user_test',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.target-container',
                  position: 'firstChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        move_user_test: 1,
      });
      document.body.innerHTML = `
        <div class="original-container">
          <div class="item">Item</div>
        </div>
        <div class="target-container"></div>
      `;

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const item = document.querySelector('.item');
      const targetContainer = document.querySelector('.target-container');
      expect(targetContainer?.contains(item)).toBe(true);

      await triggerIntersection(item!, true);

      expect(treatmentSpy).toHaveBeenCalledWith('move_user_test');
    });

    it('should create placeholders with correct attributes', async () => {
      const experiment: ExperimentData = {
        name: 'placeholder_test',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.target',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext } = createTreatmentTracker([experiment], { placeholder_test: 0 });
      document.body.innerHTML = '<div class="item">Item</div><div class="target"></div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const placeholders = findPlaceholders('placeholder_test');
      expect(placeholders.length).toBeGreaterThan(0);

      const placeholder = placeholders[0];
      expect(placeholder.getAttribute('data-absmartly-placeholder')).toBe('true');
      expect(placeholder.getAttribute('data-absmartly-experiment')).toBe('placeholder_test');
      expect(placeholder.getAttribute('data-absmartly-original-selector')).toBe('.item');
      expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    });

    it('should verify placeholder exists for specific selector', async () => {
      const experiment: ExperimentData = {
        name: 'verify_placeholder',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.special-item',
                  type: 'move',
                  targetSelector: '.special-target',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext } = createTreatmentTracker([experiment], { verify_placeholder: 0 });
      document.body.innerHTML =
        '<div class="special-item">Item</div><div class="special-target"></div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(verifyPlaceholderExists('verify_placeholder', '.special-item')).toBe(true);
    });

    it('should NOT create placeholders when experiment has immediate trigger', async () => {
      const experiment: ExperimentData = {
        name: 'no_placeholder_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                // Immediate trigger - no trigger_on_view
                { selector: '.item', type: 'style', value: { color: 'blue' } },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.target-container',
                  position: 'lastChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        no_placeholder_test: 0,
      });
      document.body.innerHTML = `
        <div class="original-container">
          <div class="item">Item</div>
        </div>
        <div class="target-container"></div>
      `;

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      // Experiment should be triggered immediately (immediate trigger takes precedence)
      expect(treatmentSpy).toHaveBeenCalledWith('no_placeholder_test');

      // NO placeholders should be created because immediate trigger fires first
      const placeholders = findPlaceholders('no_placeholder_test');
      expect(placeholders.length).toBe(0);

      // Verify no elements are being observed since experiment was already triggered
      const targetContainer = document.querySelector('.target-container');
      expect(targetContainer?.children.length).toBe(0);
    });
  });

  describe('Mixed Trigger Types', () => {
    it('should handle mixed immediate and viewport triggers in same experiment', async () => {
      const experiment: ExperimentData = {
        name: 'mixed_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.immediate', type: 'text', value: 'Immediate' },
                { selector: '.viewport', type: 'text', value: 'Viewport', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { mixed_test: 0 });
      document.body.innerHTML = '<div class="immediate">A</div><div class="viewport">B</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('mixed_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      const viewportElement = document.querySelector('.viewport')!;
      await triggerIntersection(viewportElement, true);

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should prioritize immediate trigger over viewport trigger', async () => {
      const experiment: ExperimentData = {
        name: 'priority_test',
        variants: [
          {
            variables: {
              __dom_changes: [{ selector: '.immediate', type: 'text', value: 'Control Immediate' }],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.viewport',
                  type: 'text',
                  value: 'Treatment Viewport',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        priority_test: 0,
      });
      document.body.innerHTML = '<div class="immediate">A</div><div class="viewport">B</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('priority_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dynamic Element Tracking', () => {
    it('should track dynamically added elements via MutationObserver', async () => {
      const experiment: ExperimentData = {
        name: 'dynamic_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.dynamic', type: 'text', value: 'Dynamic', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        dynamic_test: 0,
      });
      document.body.innerHTML = '<div id="container"></div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const container = document.getElementById('container')!;
      const dynamicElement = document.createElement('div');
      dynamicElement.className = 'dynamic';
      dynamicElement.textContent = 'Original';
      container.appendChild(dynamicElement);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(observedElements.has(dynamicElement)).toBe(true);

      await triggerIntersection(dynamicElement, true);

      expect(treatmentSpy).toHaveBeenCalledWith('dynamic_test');
    });

    it('should track multiple dynamically added elements', async () => {
      const experiment: ExperimentData = {
        name: 'multi_dynamic_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.dynamic', type: 'text', value: 'Dynamic', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_dynamic_test: 0,
      });
      document.body.innerHTML = '<div id="container"></div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const container = document.getElementById('container')!;

      for (let i = 0; i < 3; i++) {
        const dynamicElement = document.createElement('div');
        dynamicElement.className = 'dynamic';
        dynamicElement.textContent = `Item ${i}`;
        container.appendChild(dynamicElement);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const dynamicElements = document.querySelectorAll('.dynamic');
      expect(dynamicElements.length).toBe(3);

      dynamicElements.forEach(element => {
        expect(observedElements.has(element)).toBe(true);
      });

      await triggerIntersection(dynamicElements[0], true);

      expect(treatmentSpy).toHaveBeenCalledWith('multi_dynamic_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('IntersectionObserver Edge Cases', () => {
    it('should not trigger exposure for off-screen element until scrolled into view', async () => {
      const experiment: ExperimentData = {
        name: 'offscreen_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.below-fold', type: 'text', value: 'Below', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        offscreen_test: 0,
      });
      document.body.innerHTML = '<div class="below-fold">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const element = document.querySelector('.below-fold')!;
      await triggerIntersection(element, false);

      expect(treatmentSpy).not.toHaveBeenCalled();

      await triggerIntersection(element, true);

      expect(treatmentSpy).toHaveBeenCalledWith('offscreen_test');
    });

    it('should handle multiple experiments with viewport triggers independently', async () => {
      const experiment1: ExperimentData = {
        name: 'exp1',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.test1', type: 'text', value: 'Exp1', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const experiment2: ExperimentData = {
        name: 'exp2',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.test2', type: 'text', value: 'Exp2', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment1, experiment2], {
        exp1: 0,
        exp2: 0,
      });
      document.body.innerHTML = '<div class="test1">T1</div><div class="test2">T2</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const test1 = document.querySelector('.test1')!;
      await triggerIntersection(test1, true);

      expect(treatmentSpy).toHaveBeenCalledWith('exp1');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      const test2 = document.querySelector('.test2')!;
      await triggerIntersection(test2, true);

      expect(treatmentSpy).toHaveBeenCalledWith('exp2');
      expect(treatmentSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle element visibility toggle correctly', async () => {
      const experiment: ExperimentData = {
        name: 'toggle_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.toggle', type: 'text', value: 'Toggle', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        toggle_test: 0,
      });
      document.body.innerHTML = '<div class="toggle">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const element = document.querySelector('.toggle')!;

      await triggerIntersection(element, false);
      expect(treatmentSpy).not.toHaveBeenCalled();

      await triggerIntersection(element, true);
      expect(treatmentSpy).toHaveBeenCalledWith('toggle_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      await triggerIntersection(element, false);
      await triggerIntersection(element, true);
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle experiments with multiple viewport-triggered changes', async () => {
      const experiment: ExperimentData = {
        name: 'multi_viewport_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Hero', trigger_on_view: true },
                { selector: '.cta', type: 'text', value: 'CTA', trigger_on_view: true },
                { selector: '.footer', type: 'text', value: 'Footer', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_viewport_test: 0,
      });
      document.body.innerHTML =
        '<div class="hero">H</div><div class="cta">C</div><div class="footer">F</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      const hero = document.querySelector('.hero')!;
      await triggerIntersection(hero, true);

      expect(treatmentSpy).toHaveBeenCalledWith('multi_viewport_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      const cta = document.querySelector('.cta')!;
      const footer = document.querySelector('.footer')!;
      await triggerIntersection(cta, true);
      await triggerIntersection(footer, true);

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle viewport triggers with move changes to different positions', async () => {
      const experiment: ExperimentData = {
        name: 'move_positions_test',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.container',
                  position: 'firstChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.container',
                  position: 'lastChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.item',
                  type: 'move',
                  targetSelector: '.other-container',
                  position: 'lastChild',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        move_positions_test: 0,
      });
      document.body.innerHTML = `
        <div class="item">Item</div>
        <div class="container"></div>
        <div class="other-container"></div>
      `;

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const placeholders = findPlaceholders('move_positions_test');
      expect(placeholders.length).toBeGreaterThan(0);

      const item = document.querySelector('.item')!;
      await triggerIntersection(item, true);

      expect(treatmentSpy).toHaveBeenCalledWith('move_positions_test');
    });

    it('should cleanup observers after exposure is triggered', async () => {
      const experiment: ExperimentData = {
        name: 'cleanup_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.hero', type: 'text', value: 'Hero', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        cleanup_test: 0,
      });
      document.body.innerHTML = '<div class="hero">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      const hero = document.querySelector('.hero')!;
      await triggerIntersection(hero, true);

      expect(treatmentSpy).toHaveBeenCalledWith('cleanup_test');

      await new Promise(resolve => setTimeout(resolve, 10));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exposureTracker = (plugin as any).exposureTracker;
      expect(exposureTracker.isTriggered('cleanup_test')).toBe(true);

      await triggerIntersection(hero, true);
      expect(treatmentSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle experiments without viewport triggers', async () => {
      const experiment: ExperimentData = {
        name: 'no_viewport_test',
        variants: [
          {
            variables: {
              __dom_changes: [{ selector: '.hero', type: 'text', value: 'Control' }],
            },
          },
          {
            variables: {
              __dom_changes: [{ selector: '.hero', type: 'text', value: 'Treatment' }],
            },
          },
        ],
      };

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        no_viewport_test: 1,
      });
      document.body.innerHTML = '<div class="hero">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('no_viewport_test');
      expect(treatmentSpy).toHaveBeenCalledTimes(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exposureTracker = (plugin as any).exposureTracker;
      expect(exposureTracker.needsViewportTracking('no_viewport_test')).toBe(false);
    });
  });
});
