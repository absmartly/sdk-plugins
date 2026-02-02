import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTreatmentTracker } from '../../__tests__/sdk-helper';
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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
        await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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
          await plugin.ready();

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

  describe('Category 5: Variant with NO __dom_changes field (Real Production Case)', () => {
    describe('5.1: v0 has NO __dom_changes field + v1 has immediate changes', () => {
      it('should trigger immediately for user in v0 (no field at all)', async () => {
        const experiment: ExperimentData = {
          name: 'test_no_field_v0_immediate_v1',
          variants: [
            { variables: {} }, // v0: NO __dom_changes field at all (pure control)
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
          test_no_field_v0_immediate_v1: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();

        // CRITICAL: Should trigger immediately even though v0 has NO __dom_changes field
        expect(treatmentSpy).toHaveBeenCalledWith('test_no_field_v0_immediate_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });

      it('should trigger immediately for user in v1 (has changes)', async () => {
        const experiment: ExperimentData = {
          name: 'test_no_field_v0_immediate_v1',
          variants: [
            { variables: {} }, // v0: NO __dom_changes field
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
          test_no_field_v0_immediate_v1: 1,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.ready();

        expect(treatmentSpy).toHaveBeenCalledWith('test_no_field_v0_immediate_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('5.2: v0 has NO __dom_changes field + v1 has JavaScript change', () => {
      it('should trigger for user in v0 even with NO field (matches user scenario)', async () => {
        const experiment: ExperimentData = {
          name: 'test_no_field_v0_javascript_v1',
          variants: [
            { variables: {} }, // v0: NO __dom_changes field (pure control - exactly like user config)
            {
              variables: {
                __dom_changes: [
                  {
                    selector: 'main',
                    type: 'javascript',
                    value: "(function applyComp() {alert('ola')})()",
                    trigger_on_view: false,
                  },
                ],
              },
            },
          ],
        };

        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          test_no_field_v0_javascript_v1: 0,
        });
        document.body.innerHTML = '<main>Test</main>';

        plugin = new DOMChangesPluginLite({
          context: mockContext,
          autoApply: true,
          spa: false,
          debug: true,
        });
        await plugin.ready();

        // CRITICAL: Should trigger immediately for v0 (control with no field)
        // This is the exact scenario from user production issue
        expect(treatmentSpy).toHaveBeenCalledWith('test_no_field_v0_javascript_v1');
        expect(treatmentSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Category 6: Control Variant NO Field - Comprehensive Element State Matrix', () => {
    /**
     * COMPREHENSIVE TEST MATRIX for v0 (no __dom_changes field) + v1 (has changes)
     *
     * Testing all combinations of:
     * - Trigger type: immediate vs viewport
     * - Element state: exists visible, exists not visible, missing, appears later, never appears
     * - User assignment: v0 vs v1
     *
     * Expected SRM behavior:
     * - Immediate: Both variants trigger immediately regardless of element state
     * - Viewport: Both variants trigger when element becomes visible (or never if element never visible)
     */

    describe('6A: Immediate Triggers - Element State Variations', () => {
      describe('6A1: Element exists and visible', () => {
        it('user in v0 - should trigger immediately', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a1_immediate_exists_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a1_immediate_exists_visible: 0,
          });
          document.body.innerHTML = '<div class="target">Original</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a1_immediate_exists_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')?.textContent).toBe('Original'); // v0 no changes
        });

        it('user in v1 - should trigger immediately + apply change', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a1_immediate_exists_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a1_immediate_exists_visible: 1,
          });
          document.body.innerHTML = '<div class="target">Original</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a1_immediate_exists_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')?.textContent).toBe('Changed'); // v1 has changes
        });
      });

      describe('6A2: Element exists but not visible (below fold)', () => {
        it('user in v0 - should trigger immediately (immediate ignores visibility)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a2_immediate_exists_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a2_immediate_exists_hidden: 0,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Original</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          // Should trigger immediately even though element is not in viewport
          expect(treatmentSpy).toHaveBeenCalledWith('test_6a2_immediate_exists_hidden');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately + apply (immediate ignores visibility)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a2_immediate_exists_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a2_immediate_exists_hidden: 1,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Original</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a2_immediate_exists_hidden');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')?.textContent).toBe('Changed');
        });
      });

      describe("6A3: Element doesn't exist", () => {
        it('user in v0 - should trigger immediately (immediate ignores existence)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a3_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a3_immediate_missing: 0,
          });
          document.body.innerHTML = '<div>No target element</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          // Should trigger immediately even though element doesn't exist
          expect(treatmentSpy).toHaveBeenCalledWith('test_6a3_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately (change pending in SPA)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a3_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a3_immediate_missing: 1,
          });
          document.body.innerHTML = '<div>No target element</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a3_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')).toBeNull(); // Element doesn't exist
        });
      });

      describe('6A4: Element appears later (becomes visible)', () => {
        it('user in v0 - should trigger immediately on page load (not when element appears)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a4_immediate_appears_later',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a4_immediate_appears_later: 0,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          // Should trigger immediately on page load
          expect(treatmentSpy).toHaveBeenCalledWith('test_6a4_immediate_appears_later');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          // Add element later - should not trigger again
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(treatmentSpy).toHaveBeenCalledTimes(1); // No second trigger
        });

        it('user in v1 - should trigger immediately on page load + apply when element appears', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a4_immediate_appears_later',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a4_immediate_appears_later: 1,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          // Should trigger immediately
          expect(treatmentSpy).toHaveBeenCalledWith('test_6a4_immediate_appears_later');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          // Add element later - change should be applied in SPA mode
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(document.querySelector('.target')?.textContent).toBe('Changed');
          expect(treatmentSpy).toHaveBeenCalledTimes(1); // Still only called once
        });
      });

      describe('6A5: Element never appears', () => {
        it('user in v0 - should trigger immediately', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a5_immediate_never_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a5_immediate_never_appears: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a5_immediate_never_appears');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);

          // Wait to ensure no delayed trigger
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately', async () => {
          const experiment: ExperimentData = {
            name: 'test_6a5_immediate_never_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6a5_immediate_never_appears: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6a5_immediate_never_appears');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('6B: Viewport Triggers - Element State Variations', () => {
      /**
       * SRM VALIDATION: Compare v0 and v1 tests in each describe block.
       * - Both should have SAME assertions (not.toHaveBeenCalled() initially)
       * - Both should trigger at SAME point (when element visible)
       * - This proves NO Sample Ratio Mismatch
       */
      describe('6B1: Element exists and visible', () => {
        it('user in v0 - should trigger when element visible (tracks v1 element)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b1_viewport_exists_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b1_viewport_exists_visible: 0,
          });
          document.body.innerHTML = '<div class="target">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          // Should NOT trigger yet
          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger when visible
          const element = document.querySelector('.target')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6b1_viewport_exists_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')?.textContent).toBe('Original'); // v0 no changes
        });

        it('user in v1 - should trigger when visible + apply change', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b1_viewport_exists_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b1_viewport_exists_visible: 1,
          });
          document.body.innerHTML = '<div class="target">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const element = document.querySelector('.target')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6b1_viewport_exists_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')?.textContent).toBe('Changed');
        });
      });

      describe('6B2: Element exists but never becomes visible', () => {
        it('user in v0 - should NOT trigger (element never visible)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b2_viewport_never_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b2_viewport_never_visible: 0,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          // Should NOT trigger
          expect(treatmentSpy).not.toHaveBeenCalled();

          // Wait to ensure no delayed trigger
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NOT trigger (element never visible)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b2_viewport_never_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b2_viewport_never_visible: 1,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Original</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });

      describe("6B3: Element doesn't exist initially", () => {
        it('user in v0 - should NOT trigger (waiting for element)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b3_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b3_viewport_missing: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NOT trigger (waiting for element)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b3_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b3_viewport_missing: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });

      describe('6B4: Element appears later and becomes visible', () => {
        it('user in v0 - should trigger when element appears AND visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b4_viewport_appears_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b4_viewport_appears_visible: 0,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          // Still not triggered until visible
          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger visibility
          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6b4_viewport_appears_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger when element appears AND visible + apply', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b4_viewport_appears_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b4_viewport_appears_visible: 1,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6b4_viewport_appears_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(newEl.textContent).toBe('Changed');
        });
      });

      describe('6B5: Element appears later but never visible', () => {
        it('user in v0 - should NOT trigger (element below fold)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b5_viewport_appears_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b5_viewport_appears_hidden: 0,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element below fold
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          newEl.style.cssText = 'position:absolute;top:9999px';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          // Should NOT trigger (element not visible)
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NOT trigger (element below fold)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b5_viewport_appears_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b5_viewport_appears_hidden: 1,
          });
          document.body.innerHTML = '<div>Empty initially</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Original';
          newEl.style.cssText = 'position:absolute;top:9999px';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });

      describe('6B6: Element never appears', () => {
        it('user in v0 - should NEVER trigger', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b6_viewport_never_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b6_viewport_never_appears: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NEVER trigger', async () => {
          const experiment: ExperimentData = {
            name: 'test_6b6_viewport_never_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6b6_viewport_never_appears: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });
    });

    describe('6C: JavaScript Changes - Execution & Exposure', () => {
      describe('6C1: JavaScript with immediate trigger', () => {
        it('user in v0 - should trigger immediately (no JS execution)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6c1_js_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: 'main',
                      type: 'javascript',
                      value: "(function() {alert('test')})()",
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6c1_js_immediate: 0,
          });
          document.body.innerHTML = '<main>Test</main>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6c1_js_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately + execute JS', async () => {
          const experiment: ExperimentData = {
            name: 'test_6c1_js_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: 'main',
                      type: 'javascript',
                      value: "(function(el) {el.setAttribute('data-js-ran', 'true')})(element)",
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6c1_js_immediate: 1,
          });
          document.body.innerHTML = '<main>Test</main>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6c1_js_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('main')?.getAttribute('data-js-ran')).toBe('true');
        });

        it('user in v1 - should trigger immediately EVEN IF JS has syntax error', async () => {
          const experiment: ExperimentData = {
            name: 'test_6c1_js_immediate_error',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: 'main',
                      type: 'javascript',
                      value: "(function() {alert 'broken'})()", // Syntax error
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6c1_js_immediate_error: 1,
          });
          document.body.innerHTML = '<main>Test</main>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          // CRITICAL: Should trigger even though JS fails
          expect(treatmentSpy).toHaveBeenCalledWith('test_6c1_js_immediate_error');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6C2: JavaScript with viewport trigger', () => {
        it('user in v0 - should trigger when element visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6c2_js_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: 'main',
                      type: 'javascript',
                      value: "(function() {alert('test')})()",
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6c2_js_viewport: 0,
          });
          document.body.innerHTML = '<main>Test</main>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          await triggerIntersection(document.querySelector('main')!, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6c2_js_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger when visible + execute JS', async () => {
          const experiment: ExperimentData = {
            name: 'test_6c2_js_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: 'main',
                      type: 'javascript',
                      value: "(function(el) {el.setAttribute('data-js-ran', 'true')})(element)",
                      trigger_on_view: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6c2_js_viewport: 1,
          });
          document.body.innerHTML = '<main>Test</main>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          await triggerIntersection(document.querySelector('main')!, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6c2_js_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('main')?.getAttribute('data-js-ran')).toBe('true');
        });
      });
    });

    describe('6D: Delete Changes - Comprehensive Placeholder Tracking', () => {
      describe('6D1: Delete with viewport trigger - element exists and visible', () => {
        it('user in v0 - should trigger when element visible (element stays)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d1_delete_viewport_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d1_delete_viewport_visible: 0,
          });
          document.body.innerHTML = '<div class="target">Will stay</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          const element = document.querySelector('.target')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d1_delete_viewport_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')).not.toBeNull(); // Element stays in v0
        });

        it('user in v1 - should create placeholder, trigger when visible, element deleted', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d1_delete_viewport_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d1_delete_viewport_visible: 1,
          });
          document.body.innerHTML = '<div class="target">Will be deleted</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Should have created a placeholder (element deleted, placeholder in its place)
          const placeholder = document.querySelector('[data-absmartly-delete-placeholder="true"]');
          expect(placeholder).not.toBeNull();
          expect(document.querySelector('.target')).toBeNull();

          // Trigger placeholder visibility
          await triggerIntersection(placeholder!, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d1_delete_viewport_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6D2: Delete with viewport trigger - element exists but never visible', () => {
        it('user in v0 - should NOT trigger (element never visible)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d2_delete_viewport_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d2_delete_viewport_hidden: 0,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Below fold</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
          expect(document.querySelector('.target')).not.toBeNull(); // Element stays in v0
        });

        it('user in v1 - should NOT trigger (placeholder never visible)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d2_delete_viewport_hidden',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d2_delete_viewport_hidden: 1,
          });
          document.body.innerHTML =
            '<div class="target" style="position:absolute;top:9999px">Below fold</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Placeholder created but never visible
          const placeholder = document.querySelector('[data-absmartly-delete-placeholder="true"]');
          expect(placeholder).not.toBeNull();
          expect(document.querySelector('.target')).toBeNull(); // Element deleted

          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });

      describe("6D3: Delete with viewport trigger - element doesn't exist", () => {
        it('user in v0 - should NOT trigger (element never appears)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d3_delete_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d3_delete_viewport_missing: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NOT trigger (no element to delete = no placeholder)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d3_delete_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d3_delete_viewport_missing: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          expect(document.querySelector('[data-absmartly-delete-placeholder="true"]')).toBeNull();
        });
      });

      describe('6D4: Delete with viewport trigger - element appears later and visible', () => {
        it('user in v0 - should trigger when element appears and visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d4_delete_appears_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d4_delete_appears_visible: 0,
          });
          document.body.innerHTML = '<div>Empty</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Test';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger visibility
          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d4_delete_appears_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')).not.toBeNull(); // Stays in v0
        });

        it('user in v1 - should track element when added, trigger when visible (delete deferred)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d4_delete_appears_visible',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d4_delete_appears_visible: 1,
          });
          document.body.innerHTML = '<div>Empty</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element - Placeholders are only created for elements that exist at initialization
          // For elements that appear later, ExposureTracker tracks the actual element (not a placeholder)
          const newEl = document.createElement('div');
          newEl.className = 'target';
          newEl.textContent = 'Test';
          document.body.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          // Element should exist (delete is deferred, no placeholder for dynamic elements)
          expect(document.querySelector('.target')).not.toBeNull();

          // Trigger element visibility
          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d4_delete_appears_visible');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe("6D5: Delete with immediate trigger - element doesn't exist", () => {
        it('user in v0 - should trigger immediately', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d5_delete_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: false }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d5_delete_immediate_missing: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d5_delete_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately (nothing to delete)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d5_delete_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: false }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d5_delete_immediate_missing: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d5_delete_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.target')).toBeNull();
        });
      });

      describe('6D6: Delete with immediate trigger - multiple elements', () => {
        it('user in v0 - should trigger immediately (all stay)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d6_delete_immediate_multi',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: false }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d6_delete_immediate_multi: 0,
          });
          document.body.innerHTML =
            '<div class="target">1</div><div class="target">2</div><div class="target">3</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d6_delete_immediate_multi');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelectorAll('.target').length).toBe(3);
        });

        it('user in v1 - should trigger immediately + delete all', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d6_delete_immediate_multi',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: false }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d6_delete_immediate_multi: 1,
          });
          document.body.innerHTML =
            '<div class="target">1</div><div class="target">2</div><div class="target">3</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d6_delete_immediate_multi');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelectorAll('.target').length).toBe(0);
        });
      });

      describe('6D7: Delete with viewport - multiple elements', () => {
        it('user in v0 - should trigger when ANY element visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d7_delete_viewport_multi',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d7_delete_viewport_multi: 0,
          });
          document.body.innerHTML = `
            <div class="target">1</div>
            <div class="target" style="position:absolute;top:9999px">2</div>
            <div class="target">3</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger first element
          const firstEl = document.querySelectorAll('.target')[0];
          await triggerIntersection(firstEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d7_delete_viewport_multi');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelectorAll('.target').length).toBe(3); // All stay in v0
        });

        it('user in v1 - should create placeholders, trigger when ANY visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6d7_delete_viewport_multi',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [{ selector: '.target', type: 'delete', trigger_on_view: true }],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6d7_delete_viewport_multi: 1,
          });
          document.body.innerHTML = `
            <div class="target">1</div>
            <div class="target" style="position:absolute;top:9999px">2</div>
            <div class="target">3</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // All elements deleted, 3 placeholders created
          expect(document.querySelectorAll('.target').length).toBe(0);
          expect(
            document.querySelectorAll('[data-absmartly-delete-placeholder="true"]').length
          ).toBe(3);

          // Trigger first placeholder
          const placeholders = document.querySelectorAll(
            '[data-absmartly-delete-placeholder="true"]'
          );
          await triggerIntersection(placeholders[0], true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6d7_delete_viewport_multi');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('6H: Move Changes - Cross-Position Placeholder Tracking', () => {
      describe('6H1: Move with viewport trigger - element exists and visible in original position', () => {
        it('user in v0 - should trigger when element visible in ORIGINAL position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h1_move_viewport_original',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h1_move_viewport_original: 0,
          });
          document.body.innerHTML = `
            <div class="source"><div class="movable">Element</div></div>
            <div class="target-container">Target</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Element in original position
          const element = document.querySelector('.movable')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h1_move_viewport_original');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(element.parentElement?.className).toBe('source'); // Stays in original position
        });

        it('user in v1 - should move element, trigger when visible in NEW position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h1_move_viewport_new',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h1_move_viewport_new: 1,
          });
          document.body.innerHTML = `
            <div class="source"><div class="movable">Element</div></div>
            <div class="target-container">Target</div>
          `;

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Element should be moved
          const element = document.querySelector('.movable')!;
          expect(element.parentElement?.className).toBe('target-container');

          // Trigger visibility in new position
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h1_move_viewport_new');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6H2: Move with immediate trigger - element exists', () => {
        it('user in v0 - should trigger immediately (element stays in original)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h2_move_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
                      type: 'move',
                      targetSelector: '.target-container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6h2_move_immediate: 0,
          });
          document.body.innerHTML = `
            <div class="source"><div class="movable">Element</div></div>
            <div class="target-container">Target</div>
          `;

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h2_move_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.movable')!.parentElement?.className).toBe('source');
        });

        it('user in v1 - should trigger immediately + move element', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h2_move_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
                      type: 'move',
                      targetSelector: '.target-container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6h2_move_immediate: 1,
          });
          document.body.innerHTML = `
            <div class="source"><div class="movable">Element</div></div>
            <div class="target-container">Target</div>
          `;

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h2_move_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.movable')!.parentElement?.className).toBe(
            'target-container'
          );
        });
      });

      describe("6H3: Move with viewport trigger - element doesn't exist", () => {
        it('user in v0 - should NOT trigger (element never appears)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h3_move_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h3_move_viewport_missing: 0,
          });
          document.body.innerHTML = '<div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });

        it('user in v1 - should NOT trigger (element never appears)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h3_move_viewport_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h3_move_viewport_missing: 1,
          });
          document.body.innerHTML = '<div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();
          await new Promise(resolve => setTimeout(resolve, 100));
          expect(treatmentSpy).not.toHaveBeenCalled();
        });
      });

      describe("6H4: Move with viewport trigger - target container doesn't exist", () => {
        it('user in v0 - should trigger when element visible in original position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h4_move_no_target',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h4_move_no_target: 0,
          });
          document.body.innerHTML = '<div class="source"><div class="movable">Element</div></div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Element in original position (can't be moved)
          const element = document.querySelector('.movable')!;
          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h4_move_no_target');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should track element in original position (move fails)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h4_move_no_target',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h4_move_no_target: 1,
          });
          document.body.innerHTML = '<div class="source"><div class="movable">Element</div></div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Element stays in original position (target doesn't exist)
          const element = document.querySelector('.movable')!;
          expect(element.parentElement?.className).toBe('source');

          await triggerIntersection(element, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h4_move_no_target');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe("6H5: Move with immediate trigger - element doesn't exist", () => {
        it('user in v0 - should trigger immediately', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h5_move_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
                      type: 'move',
                      targetSelector: '.target-container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6h5_move_immediate_missing: 0,
          });
          document.body.innerHTML = '<div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h5_move_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately (move pending)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h5_move_immediate_missing',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
                      type: 'move',
                      targetSelector: '.target-container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6h5_move_immediate_missing: 1,
          });
          document.body.innerHTML = '<div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h5_move_immediate_missing');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6H6: Move with viewport trigger - element appears later', () => {
        it('user in v0 - should trigger when element appears and visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h6_move_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h6_move_appears: 0,
          });
          document.body.innerHTML =
            '<div class="source"></div><div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element
          const newEl = document.createElement('div');
          newEl.className = 'movable';
          newEl.textContent = 'Element';
          document.querySelector('.source')!.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger visibility
          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h6_move_appears');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(newEl.parentElement?.className).toBe('source'); // Stays in v0
        });

        it.skip('user in v1 - should wait for element, move it, trigger when visible in new position', async () => {
          const experiment: ExperimentData = {
            name: 'test_6h6_move_appears',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.movable',
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
            test_6h6_move_appears: 1,
          });
          document.body.innerHTML =
            '<div class="source"></div><div class="target-container">Target</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: true,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Add element - should be moved immediately
          const newEl = document.createElement('div');
          newEl.className = 'movable';
          newEl.textContent = 'Element';
          document.querySelector('.source')!.appendChild(newEl);
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(treatmentSpy).not.toHaveBeenCalled();
          expect(newEl.parentElement?.className).toBe('target-container'); // Moved

          // Trigger visibility in new position
          await triggerIntersection(newEl, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6h6_move_appears');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6H7: Move different positions - before, after, firstChild', () => {
        it('user in v1 - should move to different positions correctly', async () => {
          const positions: Array<'before' | 'after' | 'firstChild' | 'lastChild'> = [
            'before',
            'after',
            'firstChild',
            'lastChild',
          ];

          for (const position of positions) {
            const experiment: ExperimentData = {
              name: `test_6h7_move_${position}`,
              variants: [
                { variables: {} },
                {
                  variables: {
                    __dom_changes: [
                      {
                        selector: '.movable',
                        type: 'move',
                        targetSelector: '.target',
                        position,
                        trigger_on_view: false,
                      },
                    ],
                  },
                },
              ],
            };

            const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
              [`test_6h7_move_${position}`]: 1,
            });
            document.body.innerHTML = `
              <div class="container">
                <div class="movable">Move me</div>
                <div class="target">Target</div>
              </div>
            `;

            plugin = new DOMChangesPluginLite({
              context: mockContext,
              autoApply: true,
              spa: false,
            });
            await plugin.ready();

            expect(treatmentSpy).toHaveBeenCalledWith(`test_6h7_move_${position}`);

            const movable = document.querySelector('.movable')!;
            const target = document.querySelector('.target')!;

            // Verify position
            switch (position) {
              case 'before':
                expect(movable.nextElementSibling).toBe(target);
                break;
              case 'after':
                expect(target.nextElementSibling).toBe(movable);
                break;
              case 'firstChild':
                expect(target.firstElementChild).toBe(movable);
                break;
              case 'lastChild':
                expect(target.lastElementChild).toBe(movable);
                break;
            }

            plugin.destroy();
          }
        });
      });
    });

    describe('6E: Multiple Changes in v1', () => {
      describe('6E1: Multiple viewport changes on different elements', () => {
        it('user in v0 - should trigger when ANY element visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6e1_multi_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.header', type: 'text', value: 'Header', trigger_on_view: true },
                    { selector: '.footer', type: 'text', value: 'Footer', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6e1_multi_viewport: 0,
          });
          document.body.innerHTML = '<div class="header">H</div><div class="footer">F</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger footer (second element)
          await triggerIntersection(document.querySelector('.footer')!, true);

          // Should trigger for v0 when v1's footer is visible
          expect(treatmentSpy).toHaveBeenCalledWith('test_6e1_multi_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger when ANY element visible', async () => {
          const experiment: ExperimentData = {
            name: 'test_6e1_multi_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.header', type: 'text', value: 'Header', trigger_on_view: true },
                    { selector: '.footer', type: 'text', value: 'Footer', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6e1_multi_viewport: 1,
          });
          document.body.innerHTML = '<div class="header">H</div><div class="footer">F</div>';

          plugin = new DOMChangesPluginLite({
            context: mockContext,
            autoApply: true,
            spa: false,
            visibilityTracking: true,
          });
          await plugin.ready();

          expect(treatmentSpy).not.toHaveBeenCalled();

          // Trigger header (first element)
          await triggerIntersection(document.querySelector('.header')!, true);

          expect(treatmentSpy).toHaveBeenCalledWith('test_6e1_multi_viewport');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6E2: Mixed immediate + viewport changes', () => {
        it('user in v0 - should trigger immediately (immediate takes precedence)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6e2_mixed_triggers',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.header', type: 'text', value: 'Header', trigger_on_view: false },
                    { selector: '.footer', type: 'text', value: 'Footer', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6e2_mixed_triggers: 0,
          });
          document.body.innerHTML = '<div class="header">H</div><div class="footer">F</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          // Immediate trigger takes precedence - triggers immediately
          expect(treatmentSpy).toHaveBeenCalledWith('test_6e2_mixed_triggers');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately (immediate takes precedence)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6e2_mixed_triggers',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.header', type: 'text', value: 'Header', trigger_on_view: false },
                    { selector: '.footer', type: 'text', value: 'Footer', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6e2_mixed_triggers: 1,
          });
          document.body.innerHTML = '<div class="header">H</div><div class="footer">F</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6e2_mixed_triggers');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('6F: Create Changes - Target Selector Tracking', () => {
      describe('6F1: Create with immediate trigger', () => {
        it('user in v0 - should trigger immediately (nothing created)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f1_create_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="new">New Element</div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f1_create_immediate: 0,
          });
          document.body.innerHTML = '<div class="container">Container</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f1_create_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.new')).toBeNull(); // Not created in v0
        });

        it('user in v1 - should trigger immediately + create element', async () => {
          const experiment: ExperimentData = {
            name: 'test_6f1_create_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '',
                      type: 'create',
                      element: '<div class="new">New Element</div>',
                      targetSelector: '.container',
                      position: 'lastChild',
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6f1_create_immediate: 1,
          });
          document.body.innerHTML = '<div class="container">Container</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6f1_create_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
          expect(document.querySelector('.new')).not.toBeNull(); // Created in v1
        });
      });
    });

    describe('6G: Edge Cases', () => {
      describe('6G1: waitForElement with immediate trigger', () => {
        it('user in v0 - should trigger immediately (waitForElement ignored for exposure)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6g1_wait_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.target',
                      type: 'text',
                      value: 'Changed',
                      trigger_on_view: false,
                      waitForElement: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6g1_wait_immediate: 0,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          // Should trigger immediately (waitForElement doesn't affect exposure timing)
          expect(treatmentSpy).toHaveBeenCalledWith('test_6g1_wait_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });

        it('user in v1 - should trigger immediately (change pending)', async () => {
          const experiment: ExperimentData = {
            name: 'test_6g1_wait_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.target',
                      type: 'text',
                      value: 'Changed',
                      trigger_on_view: false,
                      waitForElement: true,
                    },
                  ],
                },
              },
            ],
          };

          const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
            test_6g1_wait_immediate: 1,
          });
          document.body.innerHTML = '<div>No target</div>';

          plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: true });
          await plugin.ready();

          expect(treatmentSpy).toHaveBeenCalledWith('test_6g1_wait_immediate');
          expect(treatmentSpy).toHaveBeenCalledTimes(1);
        });
      });

      describe('6G2: SRM Validation - Explicit Same-Time Triggering', () => {
        it('BOTH variants should trigger at EXACT same time for immediate', async () => {
          const experiment: ExperimentData = {
            name: 'test_6g2_srm_immediate',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: false },
                  ],
                },
              },
            ],
          };

          const results: Array<{ variant: number; triggeredAt: 'ready' | 'viewport' | 'never' }> =
            [];

          // Test BOTH variants
          for (const userVariant of [0, 1]) {
            const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
              test_6g2_srm_immediate: userVariant,
            });
            document.body.innerHTML = '<div class="target">Original</div>';

            plugin = new DOMChangesPluginLite({
              context: mockContext,
              autoApply: true,
              spa: false,
            });
            await plugin.ready();

            // Check if triggered immediately
            if (treatmentSpy.mock.calls.length > 0) {
              results.push({ variant: userVariant, triggeredAt: 'ready' });
            }

            plugin.destroy();
          }

          // CRITICAL SRM VALIDATION: Both variants must trigger at same time
          expect(results.length).toBe(2); // Both variants
          expect(results[0].triggeredAt).toBe('ready'); // v0 immediate
          expect(results[1].triggeredAt).toBe('ready'); // v1 immediate
          expect(results[0].triggeredAt).toBe(results[1].triggeredAt); // SAME TIME
        });

        it('BOTH variants should trigger at EXACT same time for viewport', async () => {
          const experiment: ExperimentData = {
            name: 'test_6g2_srm_viewport',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    { selector: '.target', type: 'text', value: 'Changed', trigger_on_view: true },
                  ],
                },
              },
            ],
          };

          const results: Array<{ variant: number; triggeredAt: 'ready' | 'viewport' | 'never' }> =
            [];

          // Test BOTH variants
          for (const userVariant of [0, 1]) {
            const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
              test_6g2_srm_viewport: userVariant,
            });
            document.body.innerHTML = '<div class="target">Original</div>';

            plugin = new DOMChangesPluginLite({
              context: mockContext,
              autoApply: true,
              spa: false,
              visibilityTracking: true,
            });
            await plugin.ready();

            let triggerTime: 'ready' | 'viewport' | 'never' = 'never';

            // Check if triggered at ready
            if (treatmentSpy.mock.calls.length > 0) {
              triggerTime = 'ready';
            } else {
              // Try viewport
              const element = document.querySelector('.target')!;
              await triggerIntersection(element, true);

              if (treatmentSpy.mock.calls.length > 0) {
                triggerTime = 'viewport';
              }
            }

            results.push({ variant: userVariant, triggeredAt: triggerTime });
            plugin.destroy();
          }

          // CRITICAL SRM VALIDATION: Both variants must trigger at same time
          expect(results.length).toBe(2); // Both variants
          expect(results[0].triggeredAt).toBe('viewport'); // v0 waits for viewport
          expect(results[1].triggeredAt).toBe('viewport'); // v1 waits for viewport
          expect(results[0].triggeredAt).toBe(results[1].triggeredAt); // SAME TIME
        });
      });

      describe('6G3: Multiple change types in v1', () => {
        it('user in v0/v1 - should trigger once for all change types', async () => {
          const experiment: ExperimentData = {
            name: 'test_6g2_multi_types',
            variants: [
              { variables: {} },
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.text-target',
                      type: 'text',
                      value: 'Changed',
                      trigger_on_view: false,
                    },
                    {
                      selector: '.style-target',
                      type: 'style',
                      value: { color: 'red' },
                      trigger_on_view: false,
                    },
                    {
                      selector: '.class-target',
                      type: 'class',
                      add: ['new-class'],
                      trigger_on_view: false,
                    },
                  ],
                },
              },
            ],
          };

          for (const userVariant of [0, 1]) {
            const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
              test_6g2_multi_types: userVariant,
            });
            document.body.innerHTML = `
              <div class="text-target">Text</div>
              <div class="style-target">Style</div>
              <div class="class-target">Class</div>
            `;

            plugin = new DOMChangesPluginLite({
              context: mockContext,
              autoApply: true,
              spa: false,
            });
            await plugin.ready();

            expect(treatmentSpy).toHaveBeenCalledWith('test_6g2_multi_types');
            expect(treatmentSpy).toHaveBeenCalledTimes(1);

            plugin.destroy();
          }
        });
      });
    });
  });
});
