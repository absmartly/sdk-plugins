/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { MockContextFactory, TestDataFactory } from '../../__tests__/test-utils';
import { DOMChange, ExperimentData, DOMChangesConfig } from '../../types';

describe('DOMChangesPluginLite - URL Filtering', () => {
  let plugin: DOMChangesPluginLite;
  let originalLocation: Location;

  beforeEach(() => {
    document.body.innerHTML = '';

    originalLocation = window.location;

    delete (window as any).location;
    window.location = { href: 'https://example.com/' } as any;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
    jest.clearAllMocks();
  });

  function createExperimentWithURLFilters(config: {
    experimentName: string;
    variants: Array<{
      urlFilter?: string | string[] | any;
      changes: DOMChange[];
    }>;
  }): ExperimentData {
    return {
      name: config.experimentName,
      variants: config.variants.map(v => {
        if (v.urlFilter !== undefined) {
          const domChangesConfig: DOMChangesConfig = {
            changes: v.changes,
            urlFilter: v.urlFilter,
          };
          return {
            variables: {
              __dom_changes: domChangesConfig,
            },
          };
        } else {
          return {
            variables: {
              __dom_changes: v.changes,
            },
          };
        }
      }),
    };
  }

  function setTestURL(url: string): void {
    delete (window as any).location;
    window.location = { href: url } as any;
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

    (mockContext.treatment as jest.Mock).mockImplementation((expName: string) => {
      treatmentSpy(expName);
      return assignedVariants[expName] ?? 0;
    });

    return { mockContext, treatmentSpy };
  }

  describe('SRM Prevention - Single Variant with URL Filter', () => {
    it('should track all variants when only variant 1 has URL filter matching current URL', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'test_experiment',
        variants: [
          { changes: [] },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'text', value: 'Treatment A' }],
          },
          { changes: [{ selector: '.other', type: 'text', value: 'Treatment B' }] },
        ],
      });

      setTestURL('https://example.com/products/123');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        test_experiment: 0,
      });

      document.body.innerHTML = '<div class="product">Original</div><div class="other">Other</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
      expect(treatmentSpy).toHaveBeenCalledWith('test_experiment');

      expect(document.querySelector('.product')?.textContent).toBe('Original');
      expect(document.querySelector('.other')?.textContent).toBe('Other');
    });

    it('should NOT track any variant when URL does not match the single variant filter', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'test_experiment',
        variants: [
          { changes: [] },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'text', value: 'Treatment' }],
          },
          { changes: [] },
        ],
      });

      setTestURL('https://example.com/checkout');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        test_experiment: 0,
      });

      document.body.innerHTML = '<div class="product">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();

      expect(document.querySelector('.product')?.textContent).toBe('Original');
    });

    it('should apply visual changes AND track when user is in the variant with matching URL filter', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'test_experiment',
        variants: [
          { changes: [] },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'text', value: 'Treatment A' }],
          },
          { changes: [] },
        ],
      });

      setTestURL('https://example.com/products/123');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        test_experiment: 1,
      });

      document.body.innerHTML = '<div class="product">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('test_experiment');

      expect(document.querySelector('.product')?.textContent).toBe('Treatment A');
    });
  });

  describe('Multiple URL filters per variant', () => {
    let experiment: ExperimentData;

    beforeEach(() => {
      experiment = createExperimentWithURLFilters({
        experimentName: 'multi_filter_test',
        variants: [
          {
            urlFilter: '/home',
            changes: [{ selector: '.hero', type: 'text', value: 'Home Treatment' }],
          },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'style', value: { color: 'red' } }],
          },
          {
            urlFilter: '/checkout',
            changes: [{ selector: '.cart', type: 'class', add: ['highlight'] }],
          },
        ],
      });
    });

    it('should track all variants on /home URL when variant 0 matches', async () => {
      setTestURL('https://example.com/home');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_filter_test: 1,
      });

      document.body.innerHTML =
        '<div class="hero">Original</div><div class="product">Product</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

      expect((document.querySelector('.product') as HTMLElement)?.style.color).toBe('');
    });

    it('should track all variants on /products/* URL when variant 1 matches', async () => {
      setTestURL('https://example.com/products/widget');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_filter_test: 0,
      });

      document.body.innerHTML = '<div class="hero">Hero</div><div class="product">Product</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

      expect(document.querySelector('.hero')?.textContent).toBe('Hero');
    });

    it('should apply changes when user variant matches current URL', async () => {
      setTestURL('https://example.com/checkout');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_filter_test: 2,
      });

      document.body.innerHTML = '<div class="cart">Cart</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledWith('multi_filter_test');

      expect(document.querySelector('.cart')?.classList.contains('highlight')).toBe(true);
    });

    it('should NOT track when URL matches none of the variant filters', async () => {
      setTestURL('https://example.com/about');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        multi_filter_test: 0,
      });

      document.body.innerHTML = '<div class="hero">Hero</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();
    });
  });

  describe('Complex URL Filters', () => {
    it('should handle URLFilterConfig with include and exclude arrays', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'complex_filter',
        variants: [
          { changes: [] },
          {
            urlFilter: {
              include: ['/products/*', '/categories/*'],
              exclude: ['/products/hidden/*'],
            },
            changes: [{ selector: '.content', type: 'text', value: 'Filtered' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      document.body.innerHTML = '<div class="content">Original</div>';

      const { mockContext: ctx1, treatmentSpy: spy1 } = createTreatmentTracker([experiment], {
        complex_filter: 0,
      });

      plugin = new DOMChangesPluginLite({ context: ctx1, autoApply: true, spa: false });
      await plugin.initialize();

      expect(spy1).toHaveBeenCalled();

      document.body.innerHTML = '';
      setTestURL('https://example.com/products/hidden/secret');
      document.body.innerHTML = '<div class="content">Original</div>';

      const { mockContext: ctx2, treatmentSpy: spy2 } = createTreatmentTracker([experiment], {
        complex_filter: 0,
      });

      plugin = new DOMChangesPluginLite({ context: ctx2, autoApply: true, spa: false });
      await plugin.initialize();

      expect(spy2).not.toHaveBeenCalled();
    });

    it('should handle array of URL patterns', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'array_filter',
        variants: [
          { changes: [] },
          {
            urlFilter: ['/home', '/landing', '/promo/*'],
            changes: [{ selector: '.banner', type: 'text', value: 'Promo' }],
          },
        ],
      });

      const testURLs = [
        'https://example.com/home',
        'https://example.com/landing',
        'https://example.com/promo/special',
      ];

      for (const url of testURLs) {
        setTestURL(url);
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          array_filter: 0,
        });
        document.body.innerHTML = '<div class="banner">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).toHaveBeenCalled();

        document.body.innerHTML = '';
      }

      setTestURL('https://example.com/about');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        array_filter: 0,
      });
      document.body.innerHTML = '<div class="banner">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();
    });

    it('should handle URLFilterConfig with matchType path', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'match_type_test',
        variants: [
          { changes: [] },
          {
            urlFilter: {
              include: ['/products/*'],
              matchType: 'path',
            },
            changes: [{ selector: '.product', type: 'text', value: 'Product' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123?query=test');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        match_type_test: 0,
      });
      document.body.innerHTML = '<div class="product">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();
    });

    it('should handle categories path in include array', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'categories_test',
        variants: [
          { changes: [] },
          {
            urlFilter: {
              include: ['/products/*', '/categories/*'],
              exclude: ['/products/hidden/*'],
            },
            changes: [{ selector: '.content', type: 'text', value: 'Filtered' }],
          },
        ],
      });

      setTestURL('https://example.com/categories/electronics');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        categories_test: 1,
      });
      document.body.innerHTML = '<div class="content">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();
      expect(document.querySelector('.content')?.textContent).toBe('Filtered');
    });
  });

  describe('Legacy Format Compatibility', () => {
    it('should track and apply changes for legacy array format (no URL filter)', async () => {
      const experiment: ExperimentData = {
        name: 'legacy_test',
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

      setTestURL('https://example.com/any/path');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        legacy_test: 1,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();

      expect(document.querySelector('.test')?.textContent).toBe('Treatment');
    });

    it('should handle legacy format with control variant (variant 0)', async () => {
      const experiment: ExperimentData = {
        name: 'legacy_control',
        variants: [
          {
            variables: {
              __dom_changes: [],
            },
          },
          {
            variables: {
              __dom_changes: [{ selector: '.test', type: 'text', value: 'Treatment' }],
            },
          },
        ],
      };

      setTestURL('https://example.com/any/path');

      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        legacy_control: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();

      expect(document.querySelector('.test')?.textContent).toBe('Original');
    });
  });

  describe('Edge cases', () => {
    it('should match all URLs when urlFilter is empty string', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'empty_filter',
        variants: [
          {
            urlFilter: '',
            changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        ],
      });

      setTestURL('https://example.com/any/path');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        empty_filter: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();
      expect(document.querySelector('.test')?.textContent).toBe('Test');
    });

    it('should match all URLs when urlFilter is missing in wrapped config', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'no_filter',
        variants: [{ changes: [{ selector: '.test', type: 'text', value: 'Test' }] }],
      });

      setTestURL('https://example.com/any/path');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        no_filter: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();
      expect(document.querySelector('.test')?.textContent).toBe('Test');
    });

    it('should handle empty include array', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'empty_include',
        variants: [
          {
            urlFilter: {
              include: [],
            },
            changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        ],
      });

      setTestURL('https://example.com/any/path');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        empty_include: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();
    });

    it('should handle empty exclude array', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'empty_exclude',
        variants: [
          {
            urlFilter: {
              include: ['/products/*'],
              exclude: [],
            },
            changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        empty_exclude: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();
      expect(document.querySelector('.test')?.textContent).toBe('Test');
    });
  });

  describe('Exposure tracking validation', () => {
    it('should call treatment() exactly once per matched experiment', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'tracking_test',
        variants: [
          { changes: [] },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
          { changes: [] },
          { changes: [] },
          { changes: [] },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        tracking_test: 0,
      });
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
      expect(treatmentSpy).toHaveBeenCalledWith('tracking_test');
    });

    it('should NOT call treatment() when no variants match URL', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'no_match_test',
        variants: [
          { urlFilter: '/products/*', changes: [] },
          { urlFilter: '/checkout', changes: [] },
        ],
      });

      setTestURL('https://example.com/about');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        no_match_test: 0,
      });

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).not.toHaveBeenCalled();
    });

    it('should track experiments independently based on URL match', async () => {
      const exp1 = createExperimentWithURLFilters({
        experimentName: 'exp1',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
          },
        ],
      });

      const exp2 = createExperimentWithURLFilters({
        experimentName: 'exp2',
        variants: [
          {
            urlFilter: '/checkout',
            changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([exp1, exp2], {
        exp1: 0,
        exp2: 0,
      });
      document.body.innerHTML =
        '<div class="test1">Original1</div><div class="test2">Original2</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
      expect(treatmentSpy).toHaveBeenCalledWith('exp1');
      expect(treatmentSpy).not.toHaveBeenCalledWith('exp2');
    });
  });

  describe('Wildcard pattern matching', () => {
    it('should match wildcard at end of path', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'wildcard_test',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test', type: 'text', value: 'Matched' }],
          },
        ],
      });

      const matchingURLs = [
        'https://example.com/products/123',
        'https://example.com/products/abc',
        'https://example.com/products/123/details',
      ];

      for (const url of matchingURLs) {
        setTestURL(url);
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          wildcard_test: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).toHaveBeenCalled();
        document.body.innerHTML = '';
      }
    });

    it('should NOT match when path prefix does not match', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'wildcard_test',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test', type: 'text', value: 'Matched' }],
          },
        ],
      });

      const nonMatchingURLs = [
        'https://example.com/product',
        'https://example.com/my-products/123',
        'https://example.com/categories/products',
      ];

      for (const url of nonMatchingURLs) {
        setTestURL(url);
        const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
          wildcard_test: 0,
        });
        document.body.innerHTML = '<div class="test">Original</div>';

        plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
        await plugin.initialize();

        expect(treatmentSpy).not.toHaveBeenCalled();
        document.body.innerHTML = '';
      }
    });
  });

  describe('Multiple experiments with different URL filters', () => {
    it('should track only experiments matching current URL', async () => {
      const exp1 = createExperimentWithURLFilters({
        experimentName: 'home_exp',
        variants: [
          { urlFilter: '/home', changes: [{ selector: '.hero', type: 'text', value: 'Home' }] },
        ],
      });

      const exp2 = createExperimentWithURLFilters({
        experimentName: 'products_exp',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'text', value: 'Product' }],
          },
        ],
      });

      const exp3 = createExperimentWithURLFilters({
        experimentName: 'checkout_exp',
        variants: [
          {
            urlFilter: '/checkout',
            changes: [{ selector: '.cart', type: 'text', value: 'Checkout' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([exp1, exp2, exp3], {
        home_exp: 0,
        products_exp: 0,
        checkout_exp: 0,
      });
      document.body.innerHTML =
        '<div class="hero">Hero</div><div class="product">Product</div><div class="cart">Cart</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(1);
      expect(treatmentSpy).toHaveBeenCalledWith('products_exp');
    });

    it('should track all matching experiments on current URL', async () => {
      const exp1 = createExperimentWithURLFilters({
        experimentName: 'exp1',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
          },
        ],
      });

      const exp2 = createExperimentWithURLFilters({
        experimentName: 'exp2',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([exp1, exp2], {
        exp1: 0,
        exp2: 0,
      });
      document.body.innerHTML =
        '<div class="test1">Original1</div><div class="test2">Original2</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(2);
      expect(treatmentSpy).toHaveBeenCalledWith('exp1');
      expect(treatmentSpy).toHaveBeenCalledWith('exp2');
    });
  });

  describe('Mixed experiments (with and without URL filters)', () => {
    it('should track all experiments without URL filters and only matching ones with filters', async () => {
      const exp1 = TestDataFactory.createExperiment('no_filter_exp', [
        { selector: '.test1', type: 'text', value: 'NoFilter' },
      ]);

      const exp2 = createExperimentWithURLFilters({
        experimentName: 'with_filter_exp',
        variants: [
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.test2', type: 'text', value: 'WithFilter' }],
          },
        ],
      });

      const exp3 = createExperimentWithURLFilters({
        experimentName: 'non_matching_exp',
        variants: [
          {
            urlFilter: '/checkout',
            changes: [{ selector: '.test3', type: 'text', value: 'NonMatching' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([exp1, exp2, exp3], {
        no_filter_exp: 0,
        with_filter_exp: 0,
        non_matching_exp: 0,
      });
      document.body.innerHTML =
        '<div class="test1">Test1</div><div class="test2">Test2</div><div class="test3">Test3</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalledTimes(2);
      expect(treatmentSpy).toHaveBeenCalledWith('no_filter_exp');
      expect(treatmentSpy).toHaveBeenCalledWith('with_filter_exp');
      expect(treatmentSpy).not.toHaveBeenCalledWith('non_matching_exp');
    });
  });

  describe('Visual changes application with URL filtering', () => {
    it('should apply changes only when user is in matching variant', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'visual_test',
        variants: [
          {
            urlFilter: '/home',
            changes: [
              { selector: '.hero', type: 'text', value: 'Home Hero' },
              { selector: '.cta', type: 'style', value: { backgroundColor: 'blue' } },
            ],
          },
          {
            urlFilter: '/products/*',
            changes: [
              { selector: '.product', type: 'text', value: 'Product Title' },
              { selector: '.price', type: 'class', add: ['sale'] },
            ],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        visual_test: 1,
      });
      document.body.innerHTML = `
        <div class="hero">Hero</div>
        <div class="cta">CTA</div>
        <div class="product">Product</div>
        <div class="price">Price</div>
      `;

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();

      expect(document.querySelector('.hero')?.textContent).toBe('Hero');
      expect((document.querySelector('.cta') as HTMLElement)?.style.backgroundColor).toBe('');

      expect(document.querySelector('.product')?.textContent).toBe('Product Title');
      expect(document.querySelector('.price')?.classList.contains('sale')).toBe(true);
    });

    it('should not apply changes when user is in non-matching variant', async () => {
      const experiment = createExperimentWithURLFilters({
        experimentName: 'visual_test',
        variants: [
          {
            urlFilter: '/home',
            changes: [{ selector: '.hero', type: 'text', value: 'Home Hero' }],
          },
          {
            urlFilter: '/products/*',
            changes: [{ selector: '.product', type: 'text', value: 'Product Title' }],
          },
        ],
      });

      setTestURL('https://example.com/products/123');
      const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
        visual_test: 0,
      });
      document.body.innerHTML = '<div class="hero">Hero</div><div class="product">Product</div>';

      plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false });
      await plugin.initialize();

      expect(treatmentSpy).toHaveBeenCalled();

      expect(document.querySelector('.hero')?.textContent).toBe('Hero');
      expect(document.querySelector('.product')?.textContent).toBe('Product');
    });
  });
});
