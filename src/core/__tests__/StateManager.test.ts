import { StateManager } from '../StateManager';
import { DOMChange } from '../../types';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('Original State Management', () => {
    it('should store original state for different change types', () => {
      const element = document.createElement('div');

      // Test text storage
      element.textContent = 'Original text';
      stateManager.storeOriginalState('.test-text', element, 'text');

      // Test HTML storage
      element.innerHTML = '<span>Original HTML</span>';
      stateManager.storeOriginalState('.test-html', element, 'html');

      // Test style storage
      element.setAttribute('style', 'color: red;');
      stateManager.storeOriginalState('.test-style', element, 'style');

      // Test class storage
      element.classList.add('original-class');
      stateManager.storeOriginalState('.test-class', element, 'class');

      // Test attribute storage
      element.setAttribute('data-test', 'test-value');
      stateManager.storeOriginalState('.test-attr', element, 'attribute');

      // Retrieve and verify
      const textState = stateManager.getOriginalState('.test-text', 'text');
      expect(textState?.originalState.text).toBe('Original text');

      const htmlState = stateManager.getOriginalState('.test-html', 'html');
      expect(htmlState?.originalState.html).toBe('<span>Original HTML</span>');

      const styleState = stateManager.getOriginalState('.test-style', 'style');
      expect(styleState?.originalState.style).toBe('color: red;');

      const classState = stateManager.getOriginalState('.test-class', 'class');
      expect(classState?.originalState.classList).toEqual(['original-class']);

      const attrState = stateManager.getOriginalState('.test-attr', 'attribute');
      expect(attrState?.originalState.attributes).toHaveProperty('data-test', 'test-value');
      expect(attrState?.originalState.attributes).toHaveProperty('style', 'color: red;');
    });

    it('should store move operation original state', () => {
      const parent = document.createElement('div');
      const element = document.createElement('span');
      const sibling = document.createElement('p');

      parent.appendChild(element);
      parent.appendChild(sibling);

      stateManager.storeOriginalState('.test', element, 'move');

      const moveState = stateManager.getOriginalState('.test', 'move');
      expect(moveState?.originalState.parent).toBe(parent);
      expect(moveState?.originalState.nextSibling).toBe(sibling);
    });

    it('should not overwrite existing original state', () => {
      const element1 = document.createElement('div');
      element1.textContent = 'First';

      const element2 = document.createElement('div');
      element2.textContent = 'Second';

      stateManager.storeOriginalState('.test', element1, 'text');
      stateManager.storeOriginalState('.test', element2, 'text');

      const state = stateManager.getOriginalState('.test', 'text');
      expect(state?.originalState.text).toBe('First');
    });
  });

  describe('Applied Changes Management', () => {
    it('should add and retrieve applied changes', () => {
      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'New text',
      };

      const elements = [document.createElement('div'), document.createElement('div')];

      stateManager.addAppliedChange('exp1', change, elements);

      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(1);
      expect(applied[0].experimentName).toBe('exp1');
      expect(applied[0].change).toBe(change);
      expect(applied[0].elements).toBe(elements);
      expect(applied[0].timestamp).toBeGreaterThan(0);
    });

    it('should get all applied changes across experiments', () => {
      const change1: DOMChange = { selector: '.test1', type: 'text', value: 'Text 1' };
      const change2: DOMChange = { selector: '.test2', type: 'text', value: 'Text 2' };

      stateManager.addAppliedChange('exp1', change1, [document.createElement('div')]);
      stateManager.addAppliedChange('exp2', change2, [document.createElement('div')]);

      const allChanges = stateManager.getAppliedChanges();
      expect(allChanges).toHaveLength(2);
    });

    it('should remove applied changes for specific experiment', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'New text' };

      stateManager.addAppliedChange('exp1', change, [document.createElement('div')]);
      stateManager.addAppliedChange('exp2', change, [document.createElement('div')]);

      stateManager.removeAppliedChanges('exp1');

      expect(stateManager.getAppliedChanges('exp1')).toHaveLength(0);
      expect(stateManager.getAppliedChanges('exp2')).toHaveLength(1);
    });

    it('should remove all applied changes', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'New text' };

      stateManager.addAppliedChange('exp1', change, [document.createElement('div')]);
      stateManager.addAppliedChange('exp2', change, [document.createElement('div')]);

      stateManager.removeAppliedChanges();

      expect(stateManager.getAppliedChanges()).toHaveLength(0);
    });

    it('should check if experiment has changes', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'New text' };

      stateManager.addAppliedChange('exp1', change, [document.createElement('div')]);

      expect(stateManager.hasChanges('exp1')).toBe(true);
      expect(stateManager.hasChanges('exp2')).toBe(false);
    });

    it('should get all experiment names', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'New text' };

      stateManager.addAppliedChange('exp1', change, [document.createElement('div')]);
      stateManager.addAppliedChange('exp2', change, [document.createElement('div')]);
      stateManager.addAppliedChange('exp3', change, [document.createElement('div')]);

      const names = stateManager.getAllExperimentNames();
      expect(names).toEqual(['exp1', 'exp2', 'exp3']);
    });
  });

  describe('Pending Changes Management', () => {
    it('should add and retrieve pending changes', () => {
      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Pending text',
      };

      stateManager.addPendingChange('exp1', change);

      const pending = stateManager.getPendingChanges('exp1');
      expect(pending).toHaveLength(1);
      expect(pending[0].experimentName).toBe('exp1');
      expect(pending[0].change).toBe(change);
      expect(pending[0].retryCount).toBe(0);
    });

    it('should get all pending changes', () => {
      const change1: DOMChange = { selector: '.test1', type: 'text', value: 'Text 1' };
      const change2: DOMChange = { selector: '.test2', type: 'text', value: 'Text 2' };

      stateManager.addPendingChange('exp1', change1);
      stateManager.addPendingChange('exp2', change2);

      const allPending = stateManager.getPendingChanges();
      expect(allPending).toHaveLength(2);
    });

    it('should remove specific pending change', () => {
      const change1: DOMChange = { selector: '.test1', type: 'text', value: 'Text 1' };
      const change2: DOMChange = { selector: '.test2', type: 'text', value: 'Text 2' };

      stateManager.addPendingChange('exp1', change1);
      stateManager.addPendingChange('exp1', change2);

      stateManager.removePendingChange('exp1', change1);

      const pending = stateManager.getPendingChanges('exp1');
      expect(pending).toHaveLength(1);
      expect(pending[0].change).toBe(change2);
    });

    it('should increment retry count', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'Text' };

      stateManager.addPendingChange('exp1', change);
      stateManager.incrementRetryCount('exp1', change);
      stateManager.incrementRetryCount('exp1', change);

      const pending = stateManager.getPendingChanges('exp1');
      expect(pending[0].retryCount).toBe(2);
    });
  });

  describe('Created Elements Management', () => {
    it('should add and retrieve created elements', () => {
      const element = document.createElement('div');
      element.textContent = 'Created element';

      stateManager.addCreatedElement('element-1', element);

      const retrieved = stateManager.getCreatedElement('element-1');
      expect(retrieved).toBe(element);
    });

    it('should remove created element from DOM and storage', () => {
      const parent = document.createElement('div');
      const element = document.createElement('span');
      parent.appendChild(element);

      stateManager.addCreatedElement('element-1', element);
      stateManager.removeCreatedElement('element-1');

      expect(stateManager.getCreatedElement('element-1')).toBeUndefined();
      expect(parent.contains(element)).toBe(false);
    });
  });

  describe('Clear All', () => {
    it('should clear all stored data', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'Text' };
      const element = document.createElement('div');
      const createdElement = document.createElement('span');
      document.body.appendChild(createdElement);

      // Add various data
      stateManager.storeOriginalState('.test', element, 'text');
      stateManager.addAppliedChange('exp1', change, [element]);
      stateManager.addPendingChange('exp1', change);
      stateManager.addCreatedElement('created-1', createdElement);

      // Clear all
      stateManager.clearAll();

      // Verify everything is cleared
      expect(stateManager.getOriginalState('.test', 'text')).toBeUndefined();
      expect(stateManager.getAppliedChanges()).toHaveLength(0);
      expect(stateManager.getPendingChanges()).toHaveLength(0);
      expect(stateManager.getCreatedElement('created-1')).toBeUndefined();
      expect(document.body.contains(createdElement)).toBe(false);
    });
  });

  describe('removeSpecificAppliedChange', () => {
    it('should remove a specific applied change', () => {
      const change1: DOMChange = { selector: '.test1', type: 'text', value: 'Text 1' };
      const change2: DOMChange = { selector: '.test2', type: 'html', value: '<b>Bold</b>' };
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');

      stateManager.addAppliedChange('exp1', change1, [element1]);
      stateManager.addAppliedChange('exp1', change2, [element2]);

      expect(stateManager.getAppliedChanges('exp1')).toHaveLength(2);

      stateManager.removeSpecificAppliedChange('exp1', '.test1', 'text');

      const remaining = stateManager.getAppliedChanges('exp1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].change.selector).toBe('.test2');
    });

    it('should remove experiment entry when last change is removed', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'Text' };
      const element = document.createElement('div');

      stateManager.addAppliedChange('exp1', change, [element]);
      expect(stateManager.hasChanges('exp1')).toBe(true);

      stateManager.removeSpecificAppliedChange('exp1', '.test', 'text');

      expect(stateManager.hasChanges('exp1')).toBe(false);
      expect(stateManager.getAppliedChanges('exp1')).toHaveLength(0);
    });

    it('should handle non-existent change gracefully', () => {
      const change: DOMChange = { selector: '.test', type: 'text', value: 'Text' };
      const element = document.createElement('div');

      stateManager.addAppliedChange('exp1', change, [element]);

      // Try to remove non-existent change
      stateManager.removeSpecificAppliedChange('exp1', '.nonexistent', 'text');

      // Original change should still be there
      expect(stateManager.getAppliedChanges('exp1')).toHaveLength(1);
    });
  });
});
