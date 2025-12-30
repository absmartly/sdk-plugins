import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import {
  createContextDataWithExperiments,
  extractVariantOverrides,
} from '../../__tests__/fixtures';
import { TestDataFactory } from '../../__tests__/test-utils';
import type { DOMChange } from '../../types';

describe('DOMChangesPluginLite - Persistence', () => {
  let container: HTMLElement;
  let pluginInstances: DOMChangesPluginLite[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
    pluginInstances = [];
  });

  afterEach(() => {
    pluginInstances.forEach(plugin => {
      try {
        plugin.destroy();
      } catch (e) {
        // Ignore
      }
    });
    pluginInstances = [];
    document.body.innerHTML = '';
  });

  function createPlugin(config: any): DOMChangesPluginLite {
    const plugin = new DOMChangesPluginLite(config);
    pluginInstances.push(plugin);
    return plugin;
  }

  function createAttributeChange(
    selector: string,
    attributes: Record<string, string>,
    options: Partial<DOMChange> = {}
  ): DOMChange {
    return {
      selector,
      type: 'attribute',
      value: attributes,
      ...options,
    };
  }

  describe('Style Persistence', () => {
    it('should persist style changes when element style is overwritten', async () => {
      const button = document.createElement('button');
      button.id = 'persist-test';
      button.textContent = 'Test Button';
      button.style.backgroundColor = 'blue';
      container.appendChild(button);

      const styleChange = TestDataFactory.createStyleChange(
        '#persist-test',
        {
          backgroundColor: 'green',
          color: 'white',
        },
        { persistStyle: true }
      );

      const experiment = TestDataFactory.createExperiment('persist_test', [styleChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(button.style.backgroundColor).toBe('green');
      expect(button.style.color).toBe('white');

      await new Promise(resolve => setTimeout(resolve, 50));

      button.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(button.style.backgroundColor).toBe('green');
      expect(button.style.color).toBe('white');
    });

    it('should NOT persist when persistStyle is false', async () => {
      const div = document.createElement('div');
      div.id = 'no-persist-test';
      div.style.backgroundColor = 'blue';
      container.appendChild(div);

      const styleChange = TestDataFactory.createStyleChange(
        '#no-persist-test',
        {
          backgroundColor: 'green',
        },
        { persistStyle: false }
      );

      const experiment = TestDataFactory.createExperiment('no_persist_test', [styleChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(div.style.backgroundColor).toBe('green');

      await new Promise(resolve => setTimeout(resolve, 50));

      div.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(div.style.backgroundColor).toBe('red');
    });

    it('should persist changes for multiple elements with same selector', async () => {
      const buttons: HTMLButtonElement[] = [];
      for (let i = 0; i < 3; i++) {
        const button = document.createElement('button');
        button.className = 'multi-test';
        button.textContent = `Button ${i + 1}`;
        button.style.backgroundColor = 'blue';
        container.appendChild(button);
        buttons.push(button);
      }

      const styleChange = TestDataFactory.createStyleChange(
        '.multi-test',
        {
          backgroundColor: 'purple',
        },
        { persistStyle: true }
      );

      const experiment = TestDataFactory.createExperiment('multi_persist_test', [styleChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      buttons.forEach(button => {
        expect(button.style.backgroundColor).toBe('purple');
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      buttons.forEach(button => {
        button.style.backgroundColor = 'orange';
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      buttons.forEach(button => {
        expect(button.style.backgroundColor).toBe('purple');
      });
    });
  });

  describe('Attribute Persistence', () => {
    it('should persist attribute changes when attributes are overwritten', async () => {
      const link = document.createElement('a');
      link.id = 'attr-persist-test';
      link.setAttribute('data-test-id', 'original-value');
      link.setAttribute('title', 'Original Title');
      container.appendChild(link);

      const attrChange = createAttributeChange(
        '#attr-persist-test',
        {
          'data-test-id': 'persisted-value',
          title: 'Persisted Title',
        },
        { persistAttribute: true }
      );

      const experiment = TestDataFactory.createExperiment('attr_persist_test', [attrChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(link.getAttribute('data-test-id')).toBe('persisted-value');
      expect(link.getAttribute('title')).toBe('Persisted Title');

      await new Promise(resolve => setTimeout(resolve, 50));

      link.setAttribute('data-test-id', 'framework-value');
      link.setAttribute('title', 'Framework Title');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(link.getAttribute('data-test-id')).toBe('persisted-value');
      expect(link.getAttribute('title')).toBe('Persisted Title');
    });

    it('should NOT persist when persistAttribute is false', async () => {
      const div = document.createElement('div');
      div.id = 'attr-no-persist';
      container.appendChild(div);

      const attrChange = createAttributeChange(
        '#attr-no-persist',
        {
          'data-value': 'test',
        },
        { persistAttribute: false }
      );

      const experiment = TestDataFactory.createExperiment('attr_no_persist_test', [attrChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(div.getAttribute('data-value')).toBe('test');

      await new Promise(resolve => setTimeout(resolve, 50));

      div.setAttribute('data-value', 'overwritten');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(div.getAttribute('data-value')).toBe('overwritten');
    });
  });

  describe('Persistence Manager Integration', () => {
    it('should clean up persistence when experiment is removed', async () => {
      const div = document.createElement('div');
      div.id = 'cleanup-test';
      container.appendChild(div);

      const styleChange = TestDataFactory.createStyleChange(
        '#cleanup-test',
        {
          backgroundColor: 'green',
        },
        { persistStyle: true }
      );

      const experiment = TestDataFactory.createExperiment('cleanup_test', [styleChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(div.style.backgroundColor).toBe('green');

      await new Promise(resolve => setTimeout(resolve, 50));

      await (plugin as any).removeAllChanges();

      div.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(div.style.backgroundColor).toBe('red');
    });

    it('should destroy persistence manager on plugin destroy', async () => {
      const div = document.createElement('div');
      div.id = 'destroy-test';
      container.appendChild(div);

      const styleChange = TestDataFactory.createStyleChange(
        '#destroy-test',
        {
          backgroundColor: 'green',
        },
        { persistStyle: true }
      );

      const experiment = TestDataFactory.createExperiment('destroy_test', [styleChange], 1);
      const sdk = createTestSDK();
      const overrides = extractVariantOverrides([experiment]);
      const context = createTestContext(
        sdk,
        createContextDataWithExperiments([experiment] as any),
        'test-user',
        overrides
      );

      const plugin = createPlugin({ context, autoApply: false, debug: true });
      await plugin.ready();
      await plugin.applyChanges();

      expect(div.style.backgroundColor).toBe('green');

      await new Promise(resolve => setTimeout(resolve, 50));

      plugin.destroy();

      div.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(div.style.backgroundColor).toBe('red');
    });
  });
});
