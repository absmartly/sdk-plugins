import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTreatmentTracker } from '../../__tests__/sdk-helper';
import { ExperimentData } from '../../types';

describe('DOMChangesPluginLite - All Change Types Cross-Variant Exposure', () => {
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
      plugin.destroy();
    }
    jest.clearAllMocks();
  });

  async function triggerIntersection(
    element: Element,
    isIntersecting: boolean = true
  ): Promise<void> {
    const entry = observedElements.get(element);
    if (!entry) return;

    const updatedEntry: IntersectionObserverEntry = {
      ...entry,
      isIntersecting,
      intersectionRatio: isIntersecting ? 0.5 : 0,
    };

    intersectionObserverCallback([updatedEntry], {} as IntersectionObserver);
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  describe('Immediate Triggers - All Change Types', () => {
    it('should trigger immediately for javascript changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_javascript_immediate',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'javascript',
                  value: 'element.textContent = "JS";',
                  trigger_on_view: false,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_javascript_immediate: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).toHaveBeenCalledWith('test_javascript_immediate');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should trigger immediately for html changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_html_immediate',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.test', type: 'html', value: '<b>B</b>', trigger_on_view: false },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_html_immediate: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).toHaveBeenCalledWith('test_html_immediate');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should trigger immediately for style changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_style_immediate',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'style',
                  value: { color: 'red' },
                  trigger_on_view: false,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_style_immediate: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).toHaveBeenCalledWith('test_style_immediate');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should trigger immediately for attribute changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_attr_immediate',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'attribute',
                  value: { 'data-t': 'v' },
                  trigger_on_view: false,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_attr_immediate: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).toHaveBeenCalledWith('test_attr_immediate');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should trigger immediately for class changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_class_immediate',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.test', type: 'class', add: ['cls'], trigger_on_view: false },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_class_immediate: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).toHaveBeenCalledWith('test_class_immediate');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });
  });

  describe('Viewport Triggers - All Change Types', () => {
    it('should wait for viewport for javascript changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_javascript_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'javascript',
                  value: 'element.textContent = "JS";',
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_javascript_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_javascript_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for html changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_html_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.test', type: 'html', value: '<b>B</b>', trigger_on_view: true },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_html_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_html_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for style changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_style_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'style',
                  value: { color: 'red' },
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_style_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_style_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for attribute changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_attr_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'attribute',
                  value: { 'data-t': 'v' },
                  trigger_on_view: true,
                },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_attr_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_attr_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for class changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_class_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [
                { selector: '.test', type: 'class', add: ['cls'], trigger_on_view: true },
              ],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_class_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_class_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for move changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_move_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
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
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_move_viewport: userVariant,
        });
        const containerDiv = document.createElement('div');
        containerDiv.className = 'container';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item';
        itemDiv.textContent = 'Item';
        document.body.appendChild(itemDiv);
        document.body.appendChild(containerDiv);
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();
        const element = document.querySelector('.item')!;
        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_move_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });

    it('should wait for viewport for delete changes across variants', async () => {
      const experiment: ExperimentData = {
        name: 'test_delete_viewport',
        variants: [
          { variables: { __dom_changes: [] } },
          {
            variables: {
              __dom_changes: [{ selector: '.test', type: 'delete', trigger_on_view: true }],
            },
          },
        ],
      };

      for (const userVariant of [0, 1]) {
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_delete_viewport: userVariant,
        });
        document.body.innerHTML = '<div class="test">Original</div>';
        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();
        expect(treatmentSpy).not.toHaveBeenCalled();

        // For v1 (delete variant), element is replaced with placeholder
        // For v0 (no delete), element still exists
        const element =
          userVariant === 1
            ? document.getElementById('absmartly-delete-test_delete_viewport-_test-0')!
            : document.querySelector('.test')!;

        await triggerIntersection(element, true);
        expect(treatmentSpy).toHaveBeenCalledWith('test_delete_viewport');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
        plugin.destroy();
      }
    });
  });
});
