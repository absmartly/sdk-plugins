/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { TestDataFactory, MockContextFactory, TestDOMUtils } from '../../__tests__/test-utils';
import { DOMChange } from '../../types';

describe('DOMChangesPluginLite', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create an instance with required config', () => {
      const context = MockContextFactory.create();
      const plugin = new DOMChangesPluginLite({ context });

      expect(plugin).toBeInstanceOf(DOMChangesPluginLite);
      expect(DOMChangesPluginLite.VERSION).toBe('1.0.0-lite');
    });

    it('should throw error if context is missing', () => {
      expect(() => {
        new DOMChangesPluginLite({ context: undefined as any });
      }).toThrow('[ABsmartly] Context is required');
    });

    it('should apply default configuration values', () => {
      const context = MockContextFactory.create();
      const plugin = new DOMChangesPluginLite({ context });

      expect((plugin as any).config.autoApply).toBe(true);
      expect((plugin as any).config.spa).toBe(true);
      expect((plugin as any).config.visibilityTracking).toBe(true);
      expect((plugin as any).config.extensionBridge).toBe(false);
      expect((plugin as any).config.dataSource).toBe('variable');
      expect((plugin as any).config.dataFieldName).toBe('__dom_changes');
      expect((plugin as any).config.debug).toBe(false);
    });

    it('should respect custom configuration', () => {
      const context = MockContextFactory.create();
      const plugin = new DOMChangesPluginLite({
        context,
        autoApply: false,
        spa: false,
        visibilityTracking: false,
        debug: true,
        dataSource: 'customField',
        dataFieldName: 'custom_changes',
      });

      expect((plugin as any).config.autoApply).toBe(false);
      expect((plugin as any).config.spa).toBe(false);
      expect((plugin as any).config.visibilityTracking).toBe(false);
      expect((plugin as any).config.debug).toBe(true);
      expect((plugin as any).config.dataSource).toBe('customField');
      expect((plugin as any).config.dataFieldName).toBe('custom_changes');
      expect((plugin as any).config.extensionBridge).toBe(false); // Always false for Lite
    });
  });

  describe('ready() and initialize()', () => {
    it('should initialize successfully', async () => {
      TestDOMUtils.createTestPage();
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context });

      await plugin.ready();

      expect((plugin as any).initialized).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context });

      await plugin.ready();
      const initializedState = (plugin as any).initialized;

      await plugin.ready();

      // Should still be initialized (not re-initialized)
      expect((plugin as any).initialized).toBe(initializedState);
    });

    it('should call initialize() as alias for ready()', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context });

      await plugin.initialize();

      expect((plugin as any).initialized).toBe(true);
    });

    it('should setup mutation observer when spa is enabled', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context, spa: true });

      await plugin.ready();

      expect((plugin as any).mutationObserver).not.toBeNull();
      expect((plugin as any).mutationObserver).toBeInstanceOf(MutationObserver);
    });

    it('should not setup mutation observer when spa is disabled', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context, spa: false });

      await plugin.ready();

      expect((plugin as any).mutationObserver).toBeNull();
    });

    it('should apply changes automatically when autoApply is true', async () => {
      TestDOMUtils.createTestPage();
      const textChange = TestDataFactory.createTextChange('.hero-title', 'Modified Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: true });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe('Modified Title');
    });

    it('should not apply changes when autoApply is false', async () => {
      TestDOMUtils.createTestPage();
      const originalText = document.querySelector('.hero-title')?.textContent;

      const textChange = TestDataFactory.createTextChange('.hero-title', 'Modified Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe(originalText);
    });

    it('should emit initialized event', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context });

      const emitSpy = jest.spyOn(plugin as any, 'emit');

      await plugin.ready();

      expect(emitSpy).toHaveBeenCalledWith('initialized');
    });
  });

  describe('applyChanges()', () => {
    it('should apply all experiment changes when no experiment specified', async () => {
      TestDOMUtils.createTestPage();

      const exp1Change = TestDataFactory.createTextChange('.hero-title', 'Title from Exp1');
      const exp2Change = TestDataFactory.createTextChange('.hero-description', 'Desc from Exp2');

      const exp1 = TestDataFactory.createExperiment('exp1', [exp1Change], 1);
      const exp2 = TestDataFactory.createExperiment('exp2', [exp2Change], 1);

      const context = MockContextFactory.withVariants([exp1, exp2], { exp1: 1, exp2: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      await plugin.applyChanges();

      expect(document.querySelector('.hero-title')?.textContent).toBe('Title from Exp1');
      expect(document.querySelector('.hero-description')?.textContent).toBe('Desc from Exp2');
    });

    it('should apply only specified experiment changes', async () => {
      TestDOMUtils.createTestPage();

      const exp1Change = TestDataFactory.createTextChange('.hero-title', 'Title from Exp1');
      const exp2Change = TestDataFactory.createTextChange('.hero-description', 'Desc from Exp2');

      const exp1 = TestDataFactory.createExperiment('exp1', [exp1Change], 1);
      const exp2 = TestDataFactory.createExperiment('exp2', [exp2Change], 1);

      const context = MockContextFactory.withVariants([exp1, exp2], { exp1: 1, exp2: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      await plugin.applyChanges('exp1');

      expect(document.querySelector('.hero-title')?.textContent).toBe('Title from Exp1');
      expect(document.querySelector('.hero-description')?.textContent).not.toBe('Desc from Exp2');
    });

    it('should skip experiments with no assigned variant', async () => {
      TestDOMUtils.createTestPage();

      const exp1Change = TestDataFactory.createTextChange('.hero-title', 'Title from Exp1');
      const exp1 = TestDataFactory.createExperiment('exp1', [exp1Change], 1);

      // Context returns null/0 for control variant
      const context = MockContextFactory.withVariants([exp1], { exp1: 0 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      await plugin.applyChanges();

      expect(document.querySelector('.hero-title')?.textContent).not.toBe('Title from Exp1');
    });

    it('should handle experiments with no DOM changes', async () => {
      TestDOMUtils.createTestPage();

      const exp1 = TestDataFactory.createExperiment('exp_no_changes', [], 1);
      const context = MockContextFactory.withVariants([exp1], { exp_no_changes: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });
  });

  describe('Text Changes', () => {
    it('should apply text changes to single element', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'New Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe('New Title');
    });

    it('should apply text changes to multiple elements', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.feature-title', 'Updated Feature');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const titles = document.querySelectorAll('.feature-title');
      titles.forEach(title => {
        expect(title.textContent).toBe('Updated Feature');
      });
    });
  });

  describe('HTML Changes', () => {
    it('should apply HTML changes', async () => {
      TestDOMUtils.createTestPage();

      const htmlChange: DOMChange = {
        selector: '.hero-description',
        type: 'html',
        value: '<strong>Bold Description</strong>',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [htmlChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-description');
      expect(element?.innerHTML).toBe('<strong>Bold Description</strong>');
    });
  });

  describe('Style Changes', () => {
    it('should apply style changes', async () => {
      TestDOMUtils.createTestPage();

      const styleChange = TestDataFactory.createStyleChange('.hero-cta', {
        backgroundColor: 'red',
        color: 'white',
        fontSize: '20px',
      });
      const experiment = TestDataFactory.createExperiment('test_exp', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta') as HTMLElement;
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.color).toBe('white');
      expect(element.style.fontSize).toBe('20px');
    });
  });

  describe('Class Changes', () => {
    it('should add classes', async () => {
      TestDOMUtils.createTestPage();

      const classChange = TestDataFactory.createClassChange('.hero-cta', [
        'btn-large',
        'btn-primary',
      ]);
      const experiment = TestDataFactory.createExperiment('test_exp', [classChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta');
      expect(element?.classList.contains('btn-large')).toBe(true);
      expect(element?.classList.contains('btn-primary')).toBe(true);
    });

    it('should remove classes', async () => {
      document.body.innerHTML =
        '<button class="btn hero-cta old-class another-class">Click</button>';

      const classChange = TestDataFactory.createClassChange(
        '.hero-cta',
        [],
        ['old-class', 'another-class']
      );
      const experiment = TestDataFactory.createExperiment('test_exp', [classChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta');
      expect(element?.classList.contains('old-class')).toBe(false);
      expect(element?.classList.contains('another-class')).toBe(false);
      expect(element?.classList.contains('btn')).toBe(true); // Should keep existing classes
    });

    it('should add and remove classes in one change', async () => {
      document.body.innerHTML = '<button class="btn hero-cta old-class">Click</button>';

      const classChange = TestDataFactory.createClassChange(
        '.hero-cta',
        ['new-class'],
        ['old-class']
      );
      const experiment = TestDataFactory.createExperiment('test_exp', [classChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta');
      expect(element?.classList.contains('new-class')).toBe(true);
      expect(element?.classList.contains('old-class')).toBe(false);
      expect(element?.classList.contains('btn')).toBe(true);
    });
  });

  describe('Attribute Changes', () => {
    it('should set attributes', async () => {
      TestDOMUtils.createTestPage();

      const attrChange: DOMChange = {
        selector: '.hero-cta',
        type: 'attribute',
        value: { 'data-test-id': 'hero-button' },
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [attrChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta');
      expect(element?.getAttribute('data-test-id')).toBe('hero-button');
    });

    it('should remove attributes when value is null', async () => {
      document.body.innerHTML = '<button class="hero-cta" data-old-attr="value">Click</button>';

      const attrChange: DOMChange = {
        selector: '.hero-cta',
        type: 'attribute',
        value: { 'data-old-attr': null as any },
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [attrChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const element = document.querySelector('.hero-cta');
      expect(element?.hasAttribute('data-old-attr')).toBe(false);
    });
  });

  describe('JavaScript Changes', () => {
    it('should execute JavaScript code', async () => {
      TestDOMUtils.createTestPage();

      const jsChange: DOMChange = {
        selector: '.hero-title',
        type: 'javascript',
        value: 'element.textContent = "JS Modified: " + element.textContent;',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [jsChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toContain('JS Modified:');
    });

    it('should handle JavaScript errors gracefully', async () => {
      TestDOMUtils.createTestPage();

      const jsChange: DOMChange = {
        selector: '.hero-title',
        type: 'javascript',
        value: 'throw new Error("Test error");',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [jsChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });

      await expect(plugin.ready()).resolves.not.toThrow();
    });
  });

  describe('Move Changes', () => {
    it('should move element to last child position', async () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const moveChange = TestDataFactory.createMoveChange('.item-1', '.container', 'lastChild');
      const experiment = TestDataFactory.createExperiment('test_exp', [moveChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('item-1')).toBe(true);
    });

    it('should move element to first child position', async () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const moveChange = TestDataFactory.createMoveChange('.item-3', '.container', 'firstChild');
      const experiment = TestDataFactory.createExperiment('test_exp', [moveChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('item-3')).toBe(true);
    });

    it('should move element before another element', async () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const moveChange = TestDataFactory.createMoveChange('.item-3', '.item-1', 'before');
      const experiment = TestDataFactory.createExperiment('test_exp', [moveChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('item-3')).toBe(true);
    });

    it('should move element after another element', async () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const moveChange = TestDataFactory.createMoveChange('.item-1', '.item-3', 'after');
      const experiment = TestDataFactory.createExperiment('test_exp', [moveChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('item-1')).toBe(true);
    });
  });

  describe('Create Changes', () => {
    it('should extract create changes from context', () => {
      const createElement: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-item">New Item</div>',
        targetSelector: '.container',
        position: 'lastChild',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [createElement], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      const extractor = (plugin as any).variantExtractor;

      const changes = extractor.getExperimentChanges('test_exp');
      expect(changes).toEqual([createElement]);
    });

    it('should create new elements', async () => {
      document.body.innerHTML = '<div class="container"></div>';

      const createElement: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-item">New Item</div>',
        targetSelector: '.container',
        position: 'lastChild',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [createElement], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, spa: false });
      await plugin.ready();

      const newElement = document.querySelector('.new-item');
      expect(newElement).not.toBeNull();
      expect(newElement?.textContent).toBe('New Item');
    });

    it('should create element at specified position', async () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="existing">Existing</div>
        </div>
      `;

      const createElement: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-first">New First</div>',
        targetSelector: '.container',
        position: 'firstChild',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [createElement], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, spa: false });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('new-first')).toBe(true);
    });
  });

  describe('Delete Changes', () => {
    it('should delete elements via manipulator directly', () => {
      TestDOMUtils.createTestPage();
      const context = MockContextFactory.create();
      const plugin = new DOMChangesPluginLite({ context });
      const manipulator = (plugin as any).domManipulator;

      expect(document.querySelector('.hero-description')).not.toBeNull();

      const deleteChange: DOMChange = {
        selector: '.hero-description',
        type: 'delete',
      };
      const result = manipulator.applyChange(deleteChange, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.hero-description')).toBeNull();
    });

    it('should extract delete changes from context', () => {
      const deleteChange: DOMChange = {
        selector: '.hero-description',
        type: 'delete',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [deleteChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      const extractor = (plugin as any).variantExtractor;

      const changes = extractor.getExperimentChanges('test_exp');

      expect(changes).toEqual([deleteChange]);
    });

    it('should delete elements', async () => {
      TestDOMUtils.createTestPage();

      const deleteChange: DOMChange = {
        selector: '.hero-description',
        type: 'delete',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [deleteChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-description')).toBeNull();
    });

    it('should delete multiple elements', async () => {
      TestDOMUtils.createTestPage();

      const deleteChange: DOMChange = {
        selector: '.feature-card',
        type: 'delete',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [deleteChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelectorAll('.feature-card')).toHaveLength(0);
    });
  });

  describe('StyleRules Changes', () => {
    it('should apply CSS rules via stylesheet', async () => {
      TestDOMUtils.createTestPage();

      const styleRulesChange: DOMChange = {
        selector: '.test-rules',
        type: 'styleRules',
        value: '.hero-title { color: blue; font-size: 24px; }',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [styleRulesChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      const styleSheets = document.styleSheets;
      let ruleFound = false;

      for (let i = 0; i < styleSheets.length; i++) {
        const sheet = styleSheets[i];
        try {
          const rules = sheet.cssRules || sheet.rules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule;
            if (rule.selectorText === '.hero-title') {
              ruleFound = true;
              break;
            }
          }
        } catch (e) {
          // Skip sheets we can't access
        }
      }

      expect(ruleFound).toBe(true);
    });
  });

  describe('Disabled Changes', () => {
    it('should skip disabled changes', async () => {
      TestDOMUtils.createTestPage();
      const originalText = document.querySelector('.hero-title')?.textContent;

      const disabledChange: DOMChange = {
        selector: '.hero-title',
        type: 'text',
        value: 'Should Not Apply',
        enabled: false,
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [disabledChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe(originalText);
    });
  });

  describe('Exposure Tracking', () => {
    it('should trigger immediate exposure for non-viewport changes', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'New Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(context.treatment).toHaveBeenCalledWith('test_exp');
    });

    it('should not trigger immediate exposure for viewport-only changes', async () => {
      TestDOMUtils.createViewportTestElements();

      const viewportChange = TestDataFactory.createViewportChange(
        '.hidden-element',
        'text',
        'Visible!'
      );
      const experiment = TestDataFactory.createExperiment('viewport_exp', [viewportChange], 1);
      const context = MockContextFactory.withVariants([experiment], { viewport_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, visibilityTracking: true });
      await plugin.ready();

      // Should NOT call treatment immediately for viewport-only changes
      expect(context.treatment).not.toHaveBeenCalled();
    });

    it('should track experiments with mixed immediate and viewport triggers separately', async () => {
      TestDOMUtils.createTestPage();

      const immediateChange = TestDataFactory.createTextChange('.hero-title', 'Immediate');
      const viewportChange = TestDataFactory.createViewportChange(
        '.footer-text',
        'text',
        'Viewport'
      );

      const experiment = TestDataFactory.createExperiment(
        'mixed_exp',
        [immediateChange, viewportChange],
        1
      );
      const context = MockContextFactory.withVariants([experiment], { mixed_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      // Should trigger for immediate changes
      expect(context.treatment).toHaveBeenCalledWith('mixed_exp');
    });
  });

  describe('refreshExperiments()', () => {
    it('should clear cache when refreshExperiments is called', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'First Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe('First Title');

      // Call refreshExperiments to clear cache
      plugin.refreshExperiments();

      // Verify cache was cleared
      const clearCacheSpy = jest.spyOn((plugin as any).variantExtractor, 'clearCache');
      plugin.refreshExperiments();
      expect(clearCacheSpy).toHaveBeenCalled();
    });
  });

  describe('Pending Changes', () => {
    it('should wait for elements with waitForElement flag', async () => {
      document.body.innerHTML = '<div class="container"></div>';

      const pendingChange = TestDataFactory.createPendingChange(
        '.pending-element',
        'text',
        'Pending Text'
      );
      const experiment = TestDataFactory.createExperiment('test_exp', [pendingChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, spa: true });
      await plugin.ready();

      // Element doesn't exist yet
      expect(document.querySelector('.pending-element')).toBeNull();

      // Add the element
      document.querySelector('.container')!.innerHTML =
        '<div class="pending-element">Original</div>';

      // Wait for pending changes to be applied
      await TestDOMUtils.waitForAsync(50);

      // Pending change should have been applied
      expect(document.querySelector('.pending-element')?.textContent).toBe('Pending Text');
    });
  });

  describe('SPA Support', () => {
    it('should observe DOM mutations when spa is enabled', async () => {
      TestDOMUtils.createSPAContainer();

      const dynamicChange = TestDataFactory.createPendingChange(
        '.dynamic-element',
        'text',
        'Dynamic Text'
      );
      const experiment = TestDataFactory.createExperiment('spa_exp', [dynamicChange], 1);
      const context = MockContextFactory.withVariants([experiment], { spa_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, spa: true });
      await plugin.ready();

      // Add dynamic content
      TestDOMUtils.addDynamicContent('<div class="dynamic-element">Original</div>');

      await TestDOMUtils.waitForAsync(50);

      expect(document.querySelector('.dynamic-element')?.textContent).toBe('Dynamic Text');
    });

    it('should not observe DOM mutations when spa is disabled', async () => {
      TestDOMUtils.createSPAContainer();

      const dynamicChange = TestDataFactory.createPendingChange(
        '.dynamic-element',
        'text',
        'Dynamic Text'
      );
      const experiment = TestDataFactory.createExperiment('spa_exp', [dynamicChange], 1);
      const context = MockContextFactory.withVariants([experiment], { spa_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context, spa: false });
      await plugin.ready();

      expect((plugin as any).mutationObserver).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing elements gracefully', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.non-existent', 'Text');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });

      await expect(plugin.ready()).resolves.not.toThrow();
    });

    it('should handle invalid selectors gracefully', async () => {
      TestDOMUtils.createTestPage();

      const textChange: DOMChange = {
        selector: '>>>invalid<<<',
        type: 'text',
        value: 'Text',
      };
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const context = MockContextFactory.withVariants([experiment], { test_exp: 1 });

      const plugin = new DOMChangesPluginLite({ context });

      await expect(plugin.ready()).resolves.not.toThrow();
    });

    it('should handle context.ready() failures gracefully', async () => {
      TestDOMUtils.createTestPage();

      const context = MockContextFactory.create([]);
      (context.ready as jest.Mock).mockRejectedValueOnce(new Error('Context failed'));

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should initialize within reasonable time', async () => {
      const context = MockContextFactory.create([]);
      const plugin = new DOMChangesPluginLite({ context });

      const start = performance.now();
      await plugin.ready();
      const duration = performance.now() - start;

      // Should initialize in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should apply changes within reasonable time', async () => {
      TestDOMUtils.createTestPage();

      const changes = Array.from({ length: 10 }, (_, i) =>
        TestDataFactory.createTextChange(`.feature-title`, `Feature ${i}`)
      );

      const experiment = TestDataFactory.createExperiment('perf_test', changes, 1);
      const context = MockContextFactory.withVariants([experiment], { perf_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false });
      await plugin.ready();

      const start = performance.now();
      await plugin.applyChanges();
      const duration = performance.now() - start;

      // Should apply 10 changes in less than 50ms
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Style Persistence', () => {
    it('should call watchElement when persistStyle is true', async () => {
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const styleChange: DOMChange = {
        selector: '.cta',
        type: 'style',
        value: { backgroundColor: 'red' },
        persistStyle: true,
      };

      const experiment = TestDataFactory.createExperiment('style_test', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { style_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false, spa: false });
      const watchElementSpy = jest.spyOn(plugin, 'watchElement');

      await plugin.ready();
      await plugin.applyChanges();

      expect(watchElementSpy).toHaveBeenCalled();
      expect((plugin as any).persistenceObserver).not.toBeNull();
    });

    it('should NOT call watchElement when persistStyle is false and spa is false', async () => {
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const styleChange: DOMChange = {
        selector: '.cta',
        type: 'style',
        value: { backgroundColor: 'red' },
        persistStyle: false,
      };

      const experiment = TestDataFactory.createExperiment('style_test', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { style_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false, spa: false });
      const watchElementSpy = jest.spyOn(plugin, 'watchElement');

      await plugin.ready();
      await plugin.applyChanges();

      expect(watchElementSpy).not.toHaveBeenCalled();
      expect((plugin as any).persistenceObserver).toBeNull();
    });

    it('should call watchElement automatically when spa mode is enabled', async () => {
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const styleChange: DOMChange = {
        selector: '.cta',
        type: 'style',
        value: { backgroundColor: 'red' },
        // No persistStyle flag, but spa: true should auto-enable it
      };

      const experiment = TestDataFactory.createExperiment('style_test', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { style_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false, spa: true });
      const watchElementSpy = jest.spyOn(plugin, 'watchElement');

      await plugin.ready();
      await plugin.applyChanges();

      expect(watchElementSpy).toHaveBeenCalled();
      expect((plugin as any).persistenceObserver).not.toBeNull();
    });

    it('should store change in appliedStyleChanges for watched elements', async () => {
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const styleChange: DOMChange = {
        selector: '.cta',
        type: 'style',
        value: { backgroundColor: 'red' },
        persistStyle: true,
      };

      const experiment = TestDataFactory.createExperiment('style_test', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { style_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false, spa: false });
      await plugin.ready();
      await plugin.applyChanges();

      const appliedChanges = (plugin as any).appliedStyleChanges.get('style_test');
      expect(appliedChanges).toContainEqual(styleChange);
    });

    it('should use element.matches() for selector matching (not exact element reference)', () => {
      const plugin = new DOMChangesPluginLite({ context: MockContextFactory.create() });

      // Test checkStyleOverwritten directly
      const element = document.createElement('button');
      element.className = 'cta';
      element.style.backgroundColor = 'blue';

      const checkStyleOverwritten = (plugin as any).checkStyleOverwritten.bind(plugin);

      // Should detect overwritten style
      expect(checkStyleOverwritten(element, { backgroundColor: 'red' })).toBe(true);

      // Should detect correct style
      expect(checkStyleOverwritten(element, { backgroundColor: 'blue' })).toBe(false);
    });

    it('should detect when !important flag is missing', () => {
      const plugin = new DOMChangesPluginLite({ context: MockContextFactory.create() });

      const element = document.createElement('button');
      element.style.setProperty('background-color', 'red'); // No !important

      const checkStyleOverwritten = (plugin as any).checkStyleOverwritten.bind(plugin);

      // Should detect missing !important
      expect(checkStyleOverwritten(element, { backgroundColor: 'red !important' })).toBe(true);
    });

    it('should track elements in watchedElements WeakMap', async () => {
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const styleChange: DOMChange = {
        selector: '.cta',
        type: 'style',
        value: { backgroundColor: 'red' },
        persistStyle: true,
      };

      const experiment = TestDataFactory.createExperiment('style_test', [styleChange], 1);
      const context = MockContextFactory.withVariants([experiment], { style_test: 1 });

      const plugin = new DOMChangesPluginLite({ context, autoApply: false, spa: false });
      await plugin.ready();
      await plugin.applyChanges();

      const button = document.querySelector('.cta')!;
      const watchedElements = (plugin as any).watchedElements;
      const experiments = watchedElements.get(button);

      expect(experiments).toBeDefined();
      expect(experiments.has('style_test')).toBe(true);
    });
  });
});
