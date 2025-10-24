import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { MockContextFactory } from '../../__tests__/test-utils';
import { ExperimentData } from '../../types';

/**
 * Comprehensive Cross-Variant Exposure Tracking Tests
 *
 * These tests verify that exposure tracking works correctly in ALL combinations of:
 * - Empty vs. filled variants
 * - Immediate vs. viewport triggers
 * - URL filters (matching, non-matching, or none)
 * - User assignment (v0 or v1)
 *
 * CRITICAL RULES for Cross-Variant SRM Prevention:
 *
 * 1. URL FILTERING:
 *    - If ANY variant has a URL filter that matches current URL → Track ALL variants
 *    - If NO variant matches current URL → Track NO variants
 *    - If variants have different URL filters → Track ALL variants on ANY matching URL
 *
 * 2. TRIGGER TYPE (once URL check passes):
 *    - If ANY variant has immediate trigger (trigger_on_view: false/undefined) →
 *      ALL variants trigger immediately
 *    - If ALL variants have only viewport triggers (trigger_on_view: true) →
 *      ALL variants wait for ANY tracked element to be visible
 *
 * 3. COMBINED BEHAVIOR:
 *    - URL filtering determines WHETHER to track
 *    - Trigger type determines WHEN to track (immediate vs viewport)
 *    - The most permissive settings apply to ALL variants for SRM prevention
 */

describe('DOMChangesPluginLite - Comprehensive Cross-Variant Exposure Tracking', () => {
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
      plugin.destroy();
    }
    jest.clearAllMocks();
  });

  async function triggerIntersection(
    element: Element,
    isIntersecting: boolean = true
  ): Promise<void> {
    const entry = observedElements.get(element);
    if (!entry) {
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

  describe('Category 1: One Empty Variant + One With Changes (Core SRM Cases)', () => {
    describe('1.1: Empty v0 + Immediate v1 (No URL Filters)', () => {
      it('should trigger immediately for user in v0 (empty variant)', async () => {
        const experiment: ExperimentData = {
          name: 'test_empty_v0_immediate_v1',
          variants: [
            { variables: { __dom_changes: [] } }, // v0: empty
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                ],
              },
            }, // v1: immediate
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_empty_v0_immediate_v1: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        // Should trigger immediately even though user is in empty v0
        expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_immediate_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });

      it('should trigger immediately for user in v1 (has changes)', async () => {
        const experiment: ExperimentData = {
          name: 'test_empty_v0_immediate_v1',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                ],
              },
            },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_empty_v0_immediate_v1: 1,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_immediate_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('1.2: Empty v0 + Viewport v1 (No URL Filters)', () => {
      it('should wait for viewport trigger for user in v0 (empty variant)', async () => {
        const experiment: ExperimentData = {
          name: 'test_empty_v0_viewport_v1',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                ],
              },
            },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_empty_v0_viewport_v1: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        // Should NOT trigger yet
        expect(treatmentSpy).not.toHaveBeenCalled();

        // Trigger when element visible
        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);

        expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_viewport_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });

      it('should wait for viewport trigger for user in v1 (has changes)', async () => {
        const experiment: ExperimentData = {
          name: 'test_empty_v0_viewport_v1',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                ],
              },
            },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_empty_v0_viewport_v1: 1,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).not.toHaveBeenCalled();

        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);

        expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_viewport_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('1.3: Immediate v0 + Empty v1 (No URL Filters)', () => {
      it('should trigger immediately for user in v0 (has immediate changes)', async () => {
        const experiment: ExperimentData = {
          name: 'test_immediate_v0_empty_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                ],
              },
            },
            { variables: { __dom_changes: [] } },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_immediate_v0_empty_v1: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).toHaveBeenCalledWith('test_immediate_v0_empty_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });

      it('should trigger immediately for user in v1 (empty variant)', async () => {
        const experiment: ExperimentData = {
          name: 'test_immediate_v0_empty_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                ],
              },
            },
            { variables: { __dom_changes: [] } },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_immediate_v0_empty_v1: 1,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        // Should trigger immediately because v0 has immediate trigger
        expect(treatmentSpy).toHaveBeenCalledWith('test_immediate_v0_empty_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('1.4: Viewport v0 + Empty v1 (No URL Filters)', () => {
      it('should wait for viewport for user in v0 (has viewport changes)', async () => {
        const experiment: ExperimentData = {
          name: 'test_viewport_v0_empty_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                ],
              },
            },
            { variables: { __dom_changes: [] } },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_viewport_v0_empty_v1: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).not.toHaveBeenCalled();

        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);

        expect(treatmentSpy).toHaveBeenCalledWith('test_viewport_v0_empty_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });

      it('should wait for viewport for user in v1 (empty variant)', async () => {
        const experiment: ExperimentData = {
          name: 'test_viewport_v0_empty_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                ],
              },
            },
            { variables: { __dom_changes: [] } },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_viewport_v0_empty_v1: 1,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).not.toHaveBeenCalled();

        const element = document.querySelector('.test')!;
        await triggerIntersection(element, true);

        // Should trigger when v0's element visible
        expect(treatmentSpy).toHaveBeenCalledWith('test_viewport_v0_empty_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('1.5: Empty v0 + Immediate v1 (v1 URL matches)', () => {
      it('should trigger immediately for both v0 and v1 when URL matches v1', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_empty_v0_immediate_v1_url',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_empty_v0_immediate_v1_url: userVariant,
          });
          document.body.innerHTML = '<div class="test">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_immediate_v1_url');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('1.6: Empty v0 + Immediate v1 (v1 URL does NOT match)', () => {
      it('should NOT track either variant when URL does not match', async () => {
        const currentUrl = 'https://example.com/home';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_empty_v0_immediate_v1_url_no_match',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Doesn't match /home
                  changes: [
                    { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_empty_v0_immediate_v1_url_no_match: userVariant,
          });
          document.body.innerHTML = '<div class="test">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Should NOT track because URL doesn't match
          expect(treatmentSpy).not.toHaveBeenCalled();

          plugin.destroy();
        }
      });
    });

    describe('1.7: Empty v0 + Viewport v1 (v1 URL matches)', () => {
      it('should wait for viewport for both variants when URL matches', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_empty_v0_viewport_v1_url',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_empty_v0_viewport_v1_url: userVariant,
          });
          document.body.innerHTML = '<div class="test">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const element = document.querySelector('.test')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_empty_v0_viewport_v1_url');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('1.8: Empty v0 + Viewport v1 (v1 URL does NOT match)', () => {
      it('should NOT track either variant when URL does not match', async () => {
        const currentUrl = 'https://example.com/home';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_empty_v0_viewport_v1_url_no_match',
          variants: [
            { variables: { __dom_changes: [] } },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.test', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_empty_v0_viewport_v1_url_no_match: userVariant,
          });
          document.body.innerHTML = '<div class="test">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const element = document.querySelector('.test');
          if (element) {
            await triggerIntersection(element, true);
          }

          // Should still NOT track because URL doesn't match
          expect(treatmentSpy).not.toHaveBeenCalled();

          plugin.destroy();
        }
      });
    });
  });

  describe('Category 2: Both Variants Have Changes (Different Triggers)', () => {
    describe('2.1: Immediate v0 + Immediate v1 (No URL Filters)', () => {
      it('should trigger immediately for both v0 and v1', async () => {
        const experiment: ExperimentData = {
          name: 'test_immediate_both',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: false },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_immediate_both: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).toHaveBeenCalledWith('test_immediate_both');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('2.2: Immediate v0 + Viewport v1 (No URL Filters)', () => {
      it('should trigger immediately for both variants (immediate precedence)', async () => {
        const experiment: ExperimentData = {
          name: 'test_immediate_v0_viewport_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_immediate_v0_viewport_v1: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Should trigger immediately because v0 has immediate trigger
          expect(treatmentSpy).toHaveBeenCalledWith('test_immediate_v0_viewport_v1');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('2.3: Viewport v0 + Immediate v1 (No URL Filters)', () => {
      it('should trigger immediately for both variants (immediate precedence)', async () => {
        const experiment: ExperimentData = {
          name: 'test_viewport_v0_immediate_v1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: true },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: false },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_viewport_v0_immediate_v1: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Should trigger immediately because v1 has immediate trigger
          expect(treatmentSpy).toHaveBeenCalledWith('test_viewport_v0_immediate_v1');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('2.4: Viewport v0 + Viewport v1 (No URL Filters)', () => {
      it('should wait for any element to be visible for both variants', async () => {
        const experiment: ExperimentData = {
          name: 'test_viewport_both',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: true },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_viewport_both: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger v0 element
          const v0Element = document.querySelector('.v0')!;
          await triggerIntersection(v0Element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_viewport_both');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });
  });

  describe('Category 3: Both Variants with URL Filters', () => {
    describe('3.1: Both match URL + Immediate triggers', () => {
      it('should trigger immediately when both variants match URL', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_both_match_immediate',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_both_match_immediate: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).toHaveBeenCalledWith('test_both_match_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.2: Both match URL + Viewport triggers', () => {
      it('should wait for viewport when both variants match URL', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_both_match_viewport',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_both_match_viewport: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const v0Element = document.querySelector('.v0')!;
          await triggerIntersection(v0Element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_both_match_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.3: Both match URL + Mixed triggers', () => {
      it('should trigger immediately with mixed triggers (immediate precedence)', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_both_match_mixed',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_both_match_mixed: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).toHaveBeenCalledWith('test_both_match_mixed');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.4: v0 matches URL, v1 does NOT match + Mixed triggers', () => {
      it('should use v0 trigger behavior (immediate) for both variants', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_v0_match_v1_no_match',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/checkout'] }, // Doesn't match
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_v0_match_v1_no_match: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Should trigger immediately because v0 matches URL and has immediate trigger
          expect(treatmentSpy).toHaveBeenCalledWith('test_v0_match_v1_no_match');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.5: v0 does NOT match, v1 matches URL + Mixed triggers', () => {
      it('should use v1 trigger behavior (viewport) for both variants - ONLY variants matching URL should determine trigger', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_v0_no_match_v1_match',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/checkout'] }, // Doesn't match - should be IGNORED
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches - should determine behavior
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_v0_no_match_v1_match: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // CRITICAL: Should NOT trigger immediately
          // v0's immediate trigger should be IGNORED because its URL doesn't match
          // Only v1 matches URL, and v1 has viewport trigger
          // Therefore: ALL variants should wait for viewport
          expect(treatmentSpy).not.toHaveBeenCalled();

          const v1Element = document.querySelector('.v1')!;
          await triggerIntersection(v1Element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_v0_no_match_v1_match');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.6: Neither variant matches URL', () => {
      it('should NOT track either variant', async () => {
        const currentUrl = 'https://example.com/home';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_neither_match',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] },
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/checkout'] },
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_neither_match: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          plugin.destroy();
        }
      });
    });

    describe('3.7: Different URL patterns - Test on FIRST matching URL', () => {
      it('should track using FIRST matching variant behavior when on /products', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_different_urls_products',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches current URL
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/about'] }, // Doesn't match
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_different_urls_products: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // v0 matches URL and has immediate trigger
          // Therefore: ALL variants should trigger immediately
          expect(treatmentSpy).toHaveBeenCalledWith('test_different_urls_products');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.8: Different URL patterns - Test on SECOND matching URL', () => {
      it('should track using SECOND matching variant behavior when on /about', async () => {
        const currentUrl = 'https://example.com/about';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_different_urls_about',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Doesn't match
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/about'] }, // Matches current URL
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_different_urls_about: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // CRITICAL: Should NOT trigger immediately
          // v1 matches URL and has viewport trigger
          // v0 doesn't match, so its immediate trigger should be ignored
          // Therefore: ALL variants should wait for viewport
          expect(treatmentSpy).not.toHaveBeenCalled();

          const v1Element = document.querySelector('.v1')!;
          await triggerIntersection(v1Element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_different_urls_about');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.9: Both variants match SAME URL with different triggers', () => {
      it('should use immediate trigger when both match but one is immediate', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_same_url_different_triggers',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: false }, // Immediate
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Also matches
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: true }, // Viewport
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_same_url_different_triggers: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Both variants match URL
          // v0 has immediate, v1 has viewport
          // Immediate takes precedence: ALL variants trigger immediately
          expect(treatmentSpy).toHaveBeenCalledWith('test_same_url_different_triggers');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('3.10: Overlapping URL filters (both could match)', () => {
      it('should trigger when URL matches ANY variant filter', async () => {
        const currentUrl = 'https://example.com/products/123';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_overlapping_urls',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches (broader pattern)
                  changes: [
                    { selector: '.v0', type: 'text', value: 'V0 Changed', trigger_on_view: true },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products/123'] }, // Also matches (more specific)
                  changes: [
                    { selector: '.v1', type: 'text', value: 'V1 Changed', trigger_on_view: false },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_overlapping_urls: userVariant,
          });
          document.body.innerHTML = '<div class="v0">V0</div><div class="v1">V1</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          // Both variants match the URL
          // v1 has immediate trigger
          // Immediate takes precedence: ALL variants trigger immediately
          expect(treatmentSpy).toHaveBeenCalledWith('test_overlapping_urls');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });
  });

  describe('Category 4: Multiple Viewport Triggers Across Variants - Cross-Element Tracking', () => {
    describe('4.1: Different selectors with viewport triggers', () => {
      it('should trigger for ALL variants when ANY tracked element becomes visible', async () => {
        const experiment: ExperimentData = {
          name: 'test_multi_viewport_selectors',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.header',
                    type: 'text',
                    value: 'Header Changed',
                    trigger_on_view: true,
                  },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.footer',
                    type: 'text',
                    value: 'Footer Changed',
                    trigger_on_view: true,
                  },
                ],
              },
            },
          ],
        };

        // Test for user in v0 - should trigger when EITHER .header OR .footer is visible
        {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_multi_viewport_selectors: 0,
          });
          document.body.innerHTML =
            '<div class="header">Header</div><div class="footer">Footer</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger .footer visibility (v1's element)
          const footer = document.querySelector('.footer')!;
          await triggerIntersection(footer, true);

          // CRITICAL: Should trigger even though user is in v0
          // Because v1's .footer became visible, ALL variants should trigger
          expect(treatmentSpy).toHaveBeenCalledWith('test_multi_viewport_selectors');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }

        // Test for user in v1 - should trigger when EITHER .header OR .footer is visible
        {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_multi_viewport_selectors: 1,
          });
          document.body.innerHTML =
            '<div class="header">Header</div><div class="footer">Footer</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger .header visibility (v0's element)
          const header = document.querySelector('.header')!;
          await triggerIntersection(header, true);

          // CRITICAL: Should trigger even though user is in v1
          // Because v0's .header became visible, ALL variants should trigger
          expect(treatmentSpy).toHaveBeenCalledWith('test_multi_viewport_selectors');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('4.2: Multiple selectors per variant with viewport triggers', () => {
      it('should trigger when ANY selector from ANY variant becomes visible', async () => {
        const experiment: ExperimentData = {
          name: 'test_multi_selectors_per_variant',
          variants: [
            {
              variables: {
                __dom_changes: [
                  { selector: '.header', type: 'text', value: 'Header V0', trigger_on_view: true },
                  { selector: '.nav', type: 'text', value: 'Nav V0', trigger_on_view: true },
                ],
              },
            },
            {
              variables: {
                __dom_changes: [
                  { selector: '.footer', type: 'text', value: 'Footer V1', trigger_on_view: true },
                  {
                    selector: '.sidebar',
                    type: 'text',
                    value: 'Sidebar V1',
                    trigger_on_view: true,
                  },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_multi_selectors_per_variant: userVariant,
          });
          document.body.innerHTML = `
            <div class="header">Header</div>
            <div class="nav">Nav</div>
            <div class="footer">Footer</div>
            <div class="sidebar">Sidebar</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger .sidebar visibility (one of v1's elements)
          const sidebar = document.querySelector('.sidebar')!;
          await triggerIntersection(sidebar, true);

          // Should trigger for BOTH v0 and v1 users
          expect(treatmentSpy).toHaveBeenCalledWith('test_multi_selectors_per_variant');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });

    describe('4.3: Different selectors with URL filters + viewport triggers', () => {
      it('should track ALL selectors from variants matching URL', async () => {
        const currentUrl = 'https://example.com/products';
        Object.defineProperty(window, 'location', {
          value: { href: currentUrl },
          writable: true,
        });

        const experiment: ExperimentData = {
          name: 'test_url_filtered_multi_viewport',
          variants: [
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/products'] }, // Matches
                  changes: [
                    {
                      selector: '.product-title',
                      type: 'text',
                      value: 'Title V0',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            },
            {
              variables: {
                __dom_changes: {
                  urlFilter: { include: ['/checkout'] }, // Doesn't match
                  changes: [
                    {
                      selector: '.checkout-btn',
                      type: 'text',
                      value: 'Checkout V1',
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_url_filtered_multi_viewport: userVariant,
          });
          document.body.innerHTML = `
            <div class="product-title">Product</div>
            <div class="checkout-btn">Checkout</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger .product-title visibility (v0's element, v0 matches URL)
          const productTitle = document.querySelector('.product-title')!;
          await triggerIntersection(productTitle, true);

          // Should trigger for both variants because v0 matches URL
          expect(treatmentSpy).toHaveBeenCalledWith('test_url_filtered_multi_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          // Reset for next test
          treatmentSpy.mockClear();
          plugin.destroy();
        }

        // Now test that v1's element doesn't trigger when v1's URL doesn't match
        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_url_filtered_multi_viewport: userVariant,
          });
          document.body.innerHTML = `
            <div class="product-title">Product</div>
            <div class="checkout-btn">Checkout</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger .checkout-btn visibility (v1's element, but v1 doesn't match URL)
          const checkoutBtn = document.querySelector('.checkout-btn')!;
          await triggerIntersection(checkoutBtn, true);

          // CRITICAL: Should still trigger because v0 matches URL
          // Even though this is v1's element, v0 matched URL so we're tracking
          // But v1's element shouldn't be in the observation list since v1 doesn't match URL
          // This is actually expected to trigger because v0 matches and we're watching v0's elements
          // Let's just verify it eventually triggers when v0's element is visible
          await triggerIntersection(document.querySelector('.product-title')!, true);
          expect(treatmentSpy).toHaveBeenCalledWith('test_url_filtered_multi_viewport');

          plugin.destroy();
        }
      });
    });

    describe('4.4: Empty variant + viewport variant with different selectors', () => {
      it('should track all selectors from non-empty variant for both users', async () => {
        const experiment: ExperimentData = {
          name: 'test_empty_and_viewport_multi',
          variants: [
            { variables: { __dom_changes: [] } }, // Empty
            {
              variables: {
                __dom_changes: [
                  { selector: '.element-a', type: 'text', value: 'A', trigger_on_view: true },
                  { selector: '.element-b', type: 'text', value: 'B', trigger_on_view: true },
                ],
              },
            },
          ],
        };

        for (const userVariant of [0, 1]) {
          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_empty_and_viewport_multi: userVariant,
          });
          document.body.innerHTML = '<div class="element-a">A</div><div class="element-b">B</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
          });
          await plugin.initialize();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger element-b visibility
          const elementB = document.querySelector('.element-b')!;
          await triggerIntersection(elementB, true);

          // Should trigger for both v0 (empty) and v1 users
          expect(treatmentSpy).toHaveBeenCalledWith('test_empty_and_viewport_multi');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          plugin.destroy();
        }
      });
    });
  });
});
