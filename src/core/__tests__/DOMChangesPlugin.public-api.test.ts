import { DOMChangesPlugin } from '../DOMChangesPlugin';
import { DOMChange } from '../../types';

describe('DOMChangesPlugin - Public API for Extensions', () => {
  let plugin: DOMChangesPlugin;
  const mockContext = {
    experimentName: jest.fn().mockReturnValue('test-experiment'),
    treatment: jest.fn().mockReturnValue(1),
    data: jest.fn().mockReturnValue({}),
    variableValue: jest.fn().mockReturnValue(null),
    peekVariableValue: jest.fn().mockReturnValue(null),
    peek: jest.fn().mockReturnValue(1),
    override: jest.fn(),
    customFieldValue: jest.fn().mockReturnValue(null),
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    plugin = new DOMChangesPlugin({
      context: mockContext,
      autoApply: false,
      debug: false,
    });
  });

  afterEach(() => {
    plugin.destroy();
    document.body.innerHTML = '';
  });

  describe('applyChange() - Single change application', () => {
    it('should apply a single text change', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Updated Text',
      };

      const success = plugin.applyChange(change, 'variant-1');

      expect(success).toBe(true);
      expect(document.querySelector('.test')?.textContent).toBe('Updated Text');
    });

    it('should apply a single style change', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<button class="btn">Click</button>';

      const change: DOMChange = {
        selector: '.btn',
        type: 'style',
        value: {
          backgroundColor: 'red',
          fontSize: '20px',
        },
      };

      const success = plugin.applyChange(change, 'variant-1');

      expect(success).toBe(true);
      const element = document.querySelector('.btn') as HTMLElement;
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.fontSize).toBe('20px');
    });

    it('should handle multiple changes for same selector', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="multi">Original</div>';

      // Apply first change
      plugin.applyChange(
        {
          selector: '.multi',
          type: 'text',
          value: 'First Change',
        },
        'variant-1'
      );

      // Apply second change (overwrites)
      plugin.applyChange(
        {
          selector: '.multi',
          type: 'text',
          value: 'Second Change',
        },
        'variant-1'
      );

      // Apply style change (different type, should work)
      plugin.applyChange(
        {
          selector: '.multi',
          type: 'style',
          value: { color: 'blue' },
        },
        'variant-1'
      );

      const element = document.querySelector('.multi') as HTMLElement;
      expect(element.textContent).toBe('Second Change');
      expect(element.style.color).toBe('blue');
    });

    it('should return false for invalid selector', async () => {
      await plugin.initialize();

      const change: DOMChange = {
        selector: '.nonexistent',
        type: 'text',
        value: 'Test',
      };

      const success = plugin.applyChange(change, 'variant-1');
      expect(success).toBe(false);
    });
  });

  describe('removeChanges() - Bulk removal', () => {
    it('should remove all changes for an experiment', async () => {
      await plugin.initialize();
      document.body.innerHTML = `
        <div class="test1">Original 1</div>
        <div class="test2">Original 2</div>
      `;

      // Apply multiple changes
      plugin.applyChange(
        {
          selector: '.test1',
          type: 'text',
          value: 'Changed 1',
        },
        'variant-1'
      );

      plugin.applyChange(
        {
          selector: '.test2',
          type: 'text',
          value: 'Changed 2',
        },
        'variant-1'
      );

      // Verify changes applied
      expect(document.querySelector('.test1')?.textContent).toBe('Changed 1');
      expect(document.querySelector('.test2')?.textContent).toBe('Changed 2');

      // Remove all changes
      const removed = plugin.removeChanges('variant-1');

      expect(removed).toHaveLength(2);
      expect(document.querySelector('.test1')?.textContent).toBe('Original 1');
      expect(document.querySelector('.test2')?.textContent).toBe('Original 2');
    });
  });

  describe('removeSpecificChange() - Individual removal', () => {
    it('should remove a specific change', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      // Apply two different types of changes
      plugin.applyChange(
        {
          selector: '.test',
          type: 'text',
          value: 'Changed Text',
        },
        'variant-1'
      );

      plugin.applyChange(
        {
          selector: '.test',
          type: 'style',
          value: { color: 'red' },
        },
        'variant-1'
      );

      const element = document.querySelector('.test') as HTMLElement;
      expect(element.textContent).toBe('Changed Text');
      expect(element.style.color).toBe('red');

      // Remove only the text change
      const success = plugin.removeSpecificChange('variant-1', '.test', 'text');

      expect(success).toBe(true);
      expect(element.textContent).toBe('Original'); // Text restored
      expect(element.style.color).toBe('red'); // Style remains
    });
  });

  describe('getAppliedChanges() - Query changes', () => {
    it('should return changes for specific experiment', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      const change1: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Variant 1 Text',
      };

      const change2: DOMChange = {
        selector: '.test',
        type: 'style',
        value: { color: 'blue' },
      };

      plugin.applyChange(change1, 'variant-1');
      plugin.applyChange(change2, 'variant-1');

      // Different experiment
      plugin.applyChange(
        {
          selector: '.test',
          type: 'class',
          add: ['highlight'],
        },
        'variant-2'
      );

      // Get changes for variant-1 only
      const variant1Changes = plugin.getAppliedChanges('variant-1');
      expect(variant1Changes).toHaveLength(2);
      expect(variant1Changes[0].change.type).toBe('text');
      expect(variant1Changes[1].change.type).toBe('style');

      // Get all changes
      const allChanges = plugin.getAppliedChanges();
      expect(allChanges).toHaveLength(3);
    });
  });

  describe('hasChanges() - Check for changes', () => {
    it('should correctly report if experiment has changes', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      expect(plugin.hasChanges('variant-1')).toBe(false);

      plugin.applyChange(
        {
          selector: '.test',
          type: 'text',
          value: 'Changed',
        },
        'variant-1'
      );

      expect(plugin.hasChanges('variant-1')).toBe(true);
      expect(plugin.hasChanges('variant-2')).toBe(false);

      plugin.removeChanges('variant-1');
      expect(plugin.hasChanges('variant-1')).toBe(false);
    });
  });

  describe('revertChange() - Undo specific applied change', () => {
    it('should revert an applied change', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      plugin.applyChange(
        {
          selector: '.test',
          type: 'text',
          value: 'Changed',
        },
        'variant-1'
      );

      const appliedChanges = plugin.getAppliedChanges('variant-1');
      expect(appliedChanges).toHaveLength(1);

      // Revert the change
      const success = plugin.revertChange(appliedChanges[0]);

      expect(success).toBe(true);
      expect(document.querySelector('.test')?.textContent).toBe('Original');
    });
  });

  describe('Event system', () => {
    it('should emit change_applied event', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="test">Original</div>';

      const eventHandler = jest.fn();
      plugin.on('change_applied', eventHandler);

      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'New Text',
      };

      plugin.applyChange(change, 'variant-1');

      expect(eventHandler).toHaveBeenCalledWith({
        experimentName: 'variant-1',
        change,
      });
    });
  });

  describe('Real-world usage pattern', () => {
    it('should handle variant preview workflow', async () => {
      await plugin.initialize();
      document.body.innerHTML = `
        <h1 class="title">Original Title</h1>
        <button class="cta">Original Button</button>
        <p class="description">Original Description</p>
      `;

      // Simulate variant with multiple changes
      const variantChanges: Array<{ id: string; change: DOMChange; enabled: boolean }> = [
        {
          id: 'change-001',
          change: { selector: '.title', type: 'text', value: 'New Title' },
          enabled: true,
        },
        {
          id: 'change-002',
          change: { selector: '.cta', type: 'style', value: { backgroundColor: 'green' } },
          enabled: true,
        },
        {
          id: 'change-003',
          change: { selector: '.description', type: 'text', value: 'New Description' },
          enabled: false, // This one is disabled
        },
      ];

      const experimentName = 'variant-preview';

      // Apply enabled changes
      variantChanges
        .filter(item => item.enabled)
        .forEach(item => {
          plugin.applyChange(item.change, experimentName);
        });

      // Check results
      expect(document.querySelector('.title')?.textContent).toBe('New Title');
      expect((document.querySelector('.cta') as HTMLElement).style.backgroundColor).toBe('green');
      expect(document.querySelector('.description')?.textContent).toBe('Original Description'); // Unchanged

      // Simulate toggling a change
      variantChanges[2].enabled = true;

      // Reapply pattern (remove all and reapply)
      plugin.removeChanges(experimentName);
      variantChanges
        .filter(item => item.enabled)
        .forEach(item => {
          plugin.applyChange(item.change, experimentName);
        });

      // Now description should be changed too
      expect(document.querySelector('.description')?.textContent).toBe('New Description');

      // Clean up preview
      plugin.removeChanges(experimentName);

      // Everything should be restored
      expect(document.querySelector('.title')?.textContent).toBe('Original Title');
      expect((document.querySelector('.cta') as HTMLElement).style.backgroundColor).toBe('');
      expect(document.querySelector('.description')?.textContent).toBe('Original Description');
    });
  });
});
