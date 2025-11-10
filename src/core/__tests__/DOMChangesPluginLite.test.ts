/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { TestDataFactory, TestDOMUtils } from '../../__tests__/test-utils';
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import {
  createEmptyContextData,
  createContextDataWithExperiments,
  extractVariantOverrides,
} from '../../__tests__/fixtures';
import { DOMChange } from '../../types';

describe('DOMChangesPluginLite', () => {
  let pluginInstances: DOMChangesPluginLite[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    pluginInstances = [];
  });

  afterEach(() => {
    // Clean up all plugin instances to prevent memory leaks
    pluginInstances.forEach(plugin => {
      try {
        plugin.destroy();
      } catch (e) {
        // Ignore destroy errors in tests
      }
    });
    pluginInstances = [];
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  // Helper to track plugin instances for cleanup
  function createPlugin(config: any): DOMChangesPluginLite {
    const plugin = new DOMChangesPluginLite(config);
    pluginInstances.push(plugin);
    return plugin;
  }

  describe('Constructor', () => {
    it('should create an instance with required config', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      expect(plugin).toBeInstanceOf(DOMChangesPluginLite);
      expect(DOMChangesPluginLite.VERSION).toBe('1.1.2');
    });

    it('should throw error if context is missing', () => {
      expect(() => {
        createPlugin({ context: undefined as any });
      }).toThrow('[ABsmartly] Context is required');
    });

    it('should apply default configuration values', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      expect((plugin as any).config.autoApply).toBe(true);
      expect((plugin as any).config.spa).toBe(true);
      expect((plugin as any).config.visibilityTracking).toBe(true);
      expect((plugin as any).config.variableName).toBe('__dom_changes');
      expect((plugin as any).config.debug).toBe(false);
    });

    it('should respect custom configuration', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({
        context,
        autoApply: false,
        spa: false,
        visibilityTracking: false,
        debug: true,
        variableName: 'custom_changes',
      });

      expect((plugin as any).config.autoApply).toBe(false);
      expect((plugin as any).config.spa).toBe(false);
      expect((plugin as any).config.visibilityTracking).toBe(false);
      expect((plugin as any).config.debug).toBe(true);
      expect((plugin as any).config.variableName).toBe('custom_changes');
    });
  });

  describe('ready() and initialize()', () => {
    it('should initialize successfully', async () => {
      TestDOMUtils.createTestPage();
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      await plugin.ready();

      expect((plugin as any).initialized).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      await plugin.ready();
      const initializedState = (plugin as any).initialized;

      await plugin.ready();

      // Should still be initialized (not re-initialized)
      expect((plugin as any).initialized).toBe(initializedState);
    });

    it('should setup mutation observer when spa is enabled', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context, spa: true });

      await plugin.ready();

      expect((plugin as any).mutationObserver).not.toBeNull();
      expect((plugin as any).mutationObserver).toBeInstanceOf(MutationObserver);
    });

    it('should not setup mutation observer when spa is disabled', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context, spa: false });

      await plugin.ready();

      expect((plugin as any).mutationObserver).toBeNull();
    });

    it('should apply changes automatically when autoApply is true', async () => {
      TestDOMUtils.createTestPage();
      const textChange = TestDataFactory.createTextChange('.hero-title', 'Modified Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        { test_exp: 1 } // Override to use variant 1
      );

      const plugin = createPlugin({ context, autoApply: true });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe('Modified Title');
    });

    it('should not apply changes when autoApply is false', async () => {
      TestDOMUtils.createTestPage();
      const originalText = document.querySelector('.hero-title')?.textContent;

      const textChange = TestDataFactory.createTextChange('.hero-title', 'Modified Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe(originalText);
    });

    it('should emit initialized event', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

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

      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([exp1, exp2]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([exp1, exp2] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false });
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

      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([exp1, exp2]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([exp1, exp2] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false });
      await plugin.ready();

      await plugin.applyChanges('exp1');

      expect(document.querySelector('.hero-title')?.textContent).toBe('Title from Exp1');
      expect(document.querySelector('.hero-description')?.textContent).not.toBe('Desc from Exp2');
    });

    it('should skip experiments with no assigned variant', async () => {
      TestDOMUtils.createTestPage();

      const exp1Change = TestDataFactory.createTextChange('.hero-title', 'Title from Exp1');
      const exp1 = TestDataFactory.createExperiment('exp1', [exp1Change], 1);

      // Context returns null/0 for control variant - do NOT use extractVariantOverrides here
      // because this test intentionally wants variant 0 (control/no changes)
      const sdk = createTestSDK();
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([exp1] as any),
        'test-user'
      );

      const plugin = createPlugin({ context, autoApply: false });
      await plugin.ready();

      await plugin.applyChanges();

      expect(document.querySelector('.hero-title')?.textContent).not.toBe('Title from Exp1');
    });

    it('should handle experiments with no DOM changes', async () => {
      TestDOMUtils.createTestPage();

      const exp1 = TestDataFactory.createExperiment('exp_no_changes', [], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([exp1]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([exp1] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false });
      await plugin.ready();

      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });
  });

  describe('Text Changes', () => {
    it('should apply text changes to single element', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'New Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe('New Title');
    });

    it('should apply text changes to multiple elements', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.feature-title', 'Updated Feature');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });

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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, spa: false });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, spa: false });
      await plugin.ready();

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('new-first')).toBe(true);
    });
  });

  describe('Delete Changes', () => {
    it('should delete elements via manipulator directly', () => {
      TestDOMUtils.createTestPage();
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
      await plugin.ready();

      expect(document.querySelector('.hero-title')?.textContent).toBe(originalText);
    });
  });

  describe('Exposure Tracking', () => {
    it('should trigger immediate exposure for non-viewport changes', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'New Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );
      const treatmentSpy = jest.spyOn(context, 'treatment');

      const plugin = createPlugin({ context });
      await plugin.ready();

      expect(treatmentSpy).toHaveBeenCalledWith('test_exp');
    });

    it('should not trigger immediate exposure for viewport-only changes', async () => {
      TestDOMUtils.createViewportTestElements();

      const viewportChange = TestDataFactory.createViewportChange(
        '.hidden-element',
        'text',
        'Visible!'
      );
      const experiment = TestDataFactory.createExperiment('viewport_exp', [viewportChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );
      const treatmentSpy = jest.spyOn(context, 'treatment');

      const plugin = createPlugin({ context, visibilityTracking: true });
      await plugin.ready();

      // Should NOT call treatment immediately for viewport-only changes
      expect(treatmentSpy).not.toHaveBeenCalled();
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );
      const treatmentSpy = jest.spyOn(context, 'treatment');

      const plugin = createPlugin({ context });
      await plugin.ready();

      // Should trigger for immediate changes
      expect(treatmentSpy).toHaveBeenCalledWith('mixed_exp');
    });
  });

  describe('refreshExperiments()', () => {
    it('should clear cache when refreshExperiments is called', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.hero-title', 'First Title');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, spa: true });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, spa: true });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, spa: false });
      await plugin.ready();

      expect((plugin as any).mutationObserver).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing elements gracefully', async () => {
      TestDOMUtils.createTestPage();

      const textChange = TestDataFactory.createTextChange('.non-existent', 'Text');
      const experiment = TestDataFactory.createExperiment('test_exp', [textChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });

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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context });

      await expect(plugin.ready()).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should initialize within reasonable time', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, spa: false });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, spa: false });
      const watchElementSpy = jest.spyOn(plugin, 'watchElement');

      await plugin.ready();
      await plugin.applyChanges();

      // watchElement should not be called when persistStyle is false
      expect(watchElementSpy).not.toHaveBeenCalled();
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, spa: true });
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
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, spa: false });
      await plugin.ready();
      await plugin.applyChanges();

      const appliedChanges = (plugin as any).persistenceManager?.getAppliedChanges().get('style_test');
      expect(appliedChanges).toContainEqual(styleChange);
    });

    // These tests for checkStyleOverwritten are now in DOMChangesPluginLite.persistence.test.ts

    // This test for watchedElements is now in DOMChangesPluginLite.persistence.test.ts
  });

  describe('Anti-Flicker (hideUntilReady)', () => {
    beforeEach(() => {
      document.head.innerHTML = '';
      document.body.innerHTML = '';
    });

    it('should not inject anti-flicker style when hideUntilReady is false', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: false,
      });

      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).toBeNull();
    });

    it('should inject anti-flicker style for body selector BEFORE context.ready()', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      // Create plugin but DON'T call ready() yet
      createPlugin({
        context,
        hideUntilReady: 'body',
        hideTimeout: 5000,
      });

      // Anti-flicker should be applied IMMEDIATELY in constructor
      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();
      expect(antiFlickerStyle?.textContent).toContain('body');
      expect(antiFlickerStyle?.textContent).toContain('visibility: hidden !important');
    });

    it('should inject anti-flicker style for custom selector', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: '[data-absmartly-hide]',
        hideTimeout: 5000,
      });

      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();
      expect(antiFlickerStyle?.textContent).toContain('[data-absmartly-hide]');
      expect(antiFlickerStyle?.textContent).toContain('visibility: hidden !important');
    });

    it('should inject anti-flicker style for multiple selectors', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: '[data-absmartly-hide], [data-custom], .test-element',
        hideTimeout: 5000,
      });

      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();
      expect(antiFlickerStyle?.textContent).toContain(
        '[data-absmartly-hide], [data-custom], .test-element'
      );
      expect(antiFlickerStyle?.textContent).toContain('visibility: hidden !important');
    });

    it('should include opacity when hideTransition is enabled', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: 'body',
        hideTransition: '0.3s ease-in',
      });

      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle?.textContent).toContain('visibility: hidden !important');
      expect(antiFlickerStyle?.textContent).toContain('opacity: 0 !important');
    });

    it('should NOT include opacity when hideTransition is false', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: 'body',
        hideTransition: false,
      });

      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle?.textContent).toContain('visibility: hidden !important');
      expect(antiFlickerStyle?.textContent).not.toContain('opacity');
    });

    it('should remove anti-flicker style after applyChanges() completes', async () => {
      document.body.innerHTML = '<div class="test">Content</div>';

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      const plugin = createPlugin({
        context,
        hideUntilReady: 'body',
        hideTransition: false,
        autoApply: true,
      });

      // Anti-flicker should be present initially
      let antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();

      // Wait for plugin to initialize and apply changes
      await plugin.ready();

      // Anti-flicker should be removed after ready()
      antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).toBeNull();
    });

    it('should remove anti-flicker style after timeout expires', async () => {
      jest.useFakeTimers();

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      createPlugin({
        context,
        hideUntilReady: 'body',
        hideTimeout: 1000,
        autoApply: false, // Don't auto-apply to test timeout
      });

      // Anti-flicker should be present initially
      let antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();

      // Fast-forward time by 1000ms
      jest.advanceTimersByTime(1000);

      // Anti-flicker should be removed after timeout
      antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).toBeNull();

      jest.useRealTimers();
    });

    it('should handle transition fade-in correctly', async () => {
      jest.useFakeTimers();

      document.body.innerHTML = '<div class="test">Content</div>';

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      const plugin = createPlugin({
        context,
        hideUntilReady: 'body',
        hideTransition: '0.3s ease-in',
        autoApply: true,
      });

      // Anti-flicker should be present initially with opacity: 0
      let antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).not.toBeNull();
      expect(antiFlickerStyle?.textContent).toContain('opacity: 0 !important');

      // Wait for plugin to initialize
      await plugin.ready();

      // After ready(), style should transition to opacity: 1
      antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      if (antiFlickerStyle) {
        expect(antiFlickerStyle.textContent).toContain('opacity: 1 !important');
        expect(antiFlickerStyle.textContent).toContain('transition');
      }

      // Fast-forward past transition duration (300ms)
      jest.advanceTimersByTime(300);

      // Style should be completely removed after transition
      antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).toBeNull();

      jest.useRealTimers();
    });

    it('should not create duplicate style elements', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      // Create plugin twice (shouldn't happen in practice, but test defensive code)
      const plugin1 = createPlugin({
        context,
        hideUntilReady: 'body',
      });

      // Try to call hideContent again (it should check for existing style)
      (plugin1 as any).hideContent();
      (plugin1 as any).hideContent();

      const antiFlickerStyles = document.querySelectorAll('#absmartly-antiflicker');
      expect(antiFlickerStyles.length).toBe(1);
    });

    it('should clear timeout when showContent is called before timeout expires', async () => {
      jest.useFakeTimers();

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      const plugin = createPlugin({
        context,
        hideUntilReady: 'body',
        hideTimeout: 5000,
        hideTransition: false,
        autoApply: true,
      });

      // Verify timeout was set
      expect((plugin as any).antiFlickerTimeout).not.toBeNull();

      // Initialize plugin (this will call showContent)
      await plugin.ready();

      // Timeout should be cleared
      expect((plugin as any).antiFlickerTimeout).toBeNull();

      // Fast-forward past the original timeout
      jest.advanceTimersByTime(5000);

      // Style should still be removed (already removed by ready())
      const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
      expect(antiFlickerStyle).toBeNull();

      jest.useRealTimers();
    });

    it('should work with real-world selectors', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      const testSelectors = [
        'body',
        '[data-absmartly-hide]',
        '.hero-section',
        '#main-content',
        '[data-absmartly-hide], [data-custom-hide]',
        '.hero, .cta, #banner',
        'div[data-test="value"]',
      ];

      for (const selector of testSelectors) {
        document.head.innerHTML = ''; // Clear previous styles

        createPlugin({
          context,
          hideUntilReady: selector,
        });

        const antiFlickerStyle = document.getElementById('absmartly-antiflicker');
        expect(antiFlickerStyle).not.toBeNull();
        expect(antiFlickerStyle?.textContent).toContain(selector);

        // Clean up for next iteration
        antiFlickerStyle?.remove();
      }
    });
  });
});
