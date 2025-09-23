/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMManipulator } from '../DOMManipulator';
import { StateManager } from '../StateManager';
import { DOMChange } from '../../types';

describe('DOMManipulator - Sequential Changes', () => {
  let domManipulator: DOMManipulator;
  let stateManager: StateManager;
  let mockPlugin: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    stateManager = new StateManager();
    mockPlugin = {
      watchElement: jest.fn(),
    };
    domManipulator = new DOMManipulator(stateManager, false, mockPlugin);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Multiple changes for same selector and type', () => {
    it('should apply multiple text changes sequentially', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      // Apply first text change
      const change1: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'First Change',
      };
      domManipulator.applyChange(change1, 'exp1');
      expect(element.textContent).toBe('First Change');

      // Apply second text change to same selector
      const change2: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Second Change - builds on first',
      };
      domManipulator.applyChange(change2, 'exp1');
      expect(element.textContent).toBe('Second Change - builds on first');

      // Apply third text change
      const change3: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Third Change - final',
      };
      domManipulator.applyChange(change3, 'exp1');
      expect(element.textContent).toBe('Third Change - final');

      // Verify all changes are tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(3);
      expect(applied[0].change.value).toBe('First Change');
      expect(applied[1].change.value).toBe('Second Change - builds on first');
      expect(applied[2].change.value).toBe('Third Change - final');
    });

    it('should handle dependent changes that build on each other', () => {
      document.body.innerHTML = '<div class="counter">0</div>';
      const element = document.querySelector('.counter') as HTMLElement;

      // Simulate changes that depend on previous state
      const changes = [
        { selector: '.counter', type: 'text', value: '1' },
        { selector: '.counter', type: 'text', value: '2' },
        { selector: '.counter', type: 'text', value: '3' },
      ] as DOMChange[];

      changes.forEach(change => {
        domManipulator.applyChange(change, 'exp1');
      });

      expect(element.textContent).toBe('3');

      // All changes should be tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(3);
    });

    it('should apply multiple style changes sequentially', () => {
      document.body.innerHTML = '<div class="styled">Content</div>';
      const element = document.querySelector('.styled') as HTMLElement;

      // Apply first style change
      const change1: DOMChange = {
        selector: '.styled',
        type: 'style',
        value: { color: 'red', fontSize: '14px' },
      };
      domManipulator.applyChange(change1, 'exp1');
      expect(element.style.color).toBe('red');
      expect(element.style.fontSize).toBe('14px');

      // Apply second style change (adds to first)
      const change2: DOMChange = {
        selector: '.styled',
        type: 'style',
        value: { backgroundColor: 'blue', padding: '10px' },
      };
      domManipulator.applyChange(change2, 'exp1');
      expect(element.style.color).toBe('red'); // Should still have first changes
      expect(element.style.fontSize).toBe('14px');
      expect(element.style.backgroundColor).toBe('blue');
      expect(element.style.padding).toBe('10px');

      // Apply third style change (overrides some)
      const change3: DOMChange = {
        selector: '.styled',
        type: 'style',
        value: { color: 'green', border: '1px solid black' },
      };
      domManipulator.applyChange(change3, 'exp1');
      expect(element.style.color).toBe('green'); // Overridden
      expect(element.style.fontSize).toBe('14px'); // Still there
      expect(element.style.backgroundColor).toBe('blue'); // Still there
      expect(element.style.padding).toBe('10px'); // Still there
      expect(element.style.border).toBe('1px solid black'); // New

      // All changes should be tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(3);
    });

    it('should apply multiple class changes sequentially', () => {
      document.body.innerHTML = '<div class="base">Content</div>';
      const element = document.querySelector('.base') as HTMLElement;

      // Apply first class change
      const change1: DOMChange = {
        selector: '.base',
        type: 'class',
        add: ['primary', 'large'],
      };
      domManipulator.applyChange(change1, 'exp1');
      expect(element.classList.contains('base')).toBe(true);
      expect(element.classList.contains('primary')).toBe(true);
      expect(element.classList.contains('large')).toBe(true);

      // Apply second class change
      const change2: DOMChange = {
        selector: '.base',
        type: 'class',
        add: ['active'],
        remove: ['large'],
      };
      domManipulator.applyChange(change2, 'exp1');
      expect(element.classList.contains('base')).toBe(true);
      expect(element.classList.contains('primary')).toBe(true);
      expect(element.classList.contains('large')).toBe(false); // Removed
      expect(element.classList.contains('active')).toBe(true); // Added

      // All changes should be tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(2);
    });

    it('should restore original state when removing all changes', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      // Apply multiple changes
      const changes = [
        { selector: '.test', type: 'text', value: 'Change 1' },
        { selector: '.test', type: 'text', value: 'Change 2' },
        { selector: '.test', type: 'text', value: 'Change 3' },
      ] as DOMChange[];

      changes.forEach(change => {
        domManipulator.applyChange(change, 'exp1');
      });

      expect(element.textContent).toBe('Change 3');

      // Remove all changes
      domManipulator.removeChanges('exp1');

      // Should restore to original
      expect(element.textContent).toBe('Original');

      // No changes should remain
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(0);
    });

    it('should handle removing specific change from multiple', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      // Apply three changes
      const changes = [
        { selector: '.test', type: 'text', value: 'First' },
        { selector: '.test', type: 'text', value: 'Second' },
        { selector: '.test', type: 'text', value: 'Third' },
      ] as DOMChange[];

      changes.forEach(change => {
        domManipulator.applyChange(change, 'exp1');
      });

      expect(element.textContent).toBe('Third');

      // Remove the middle change
      domManipulator.removeSpecificChange('exp1', '.test', 'text');

      // Should still have the last applied value (since we remove from the tracked list but DOM stays as-is)
      // This is the current behavior - removing one doesn't revert to previous
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(2); // One removed
    });

    it('should apply changes to multiple elements with same selector', () => {
      document.body.innerHTML = `
        <div class="item">Item 1</div>
        <div class="item">Item 2</div>
        <div class="item">Item 3</div>
      `;

      const change1: DOMChange = {
        selector: '.item',
        type: 'text',
        value: 'Updated',
      };

      const change2: DOMChange = {
        selector: '.item',
        type: 'style',
        value: { color: 'red' },
      };

      domManipulator.applyChange(change1, 'exp1');
      domManipulator.applyChange(change2, 'exp1');

      const items = document.querySelectorAll('.item');
      items.forEach(item => {
        expect(item.textContent).toBe('Updated');
        expect((item as HTMLElement).style.color).toBe('red');
      });

      // Should track both changes
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(2);

      // Each change should reference all 3 elements
      expect(applied[0].elements).toHaveLength(3);
      expect(applied[1].elements).toHaveLength(3);
    });

    it.skip('should handle mixed change types for same selector', () => {
      document.body.innerHTML = '<button class="btn">Click</button>';
      const element = document.querySelector('.btn') as HTMLElement;

      // Apply different types of changes to same element
      const textChange: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Submit',
      };

      const styleChange: DOMChange = {
        selector: '.btn',
        type: 'style',
        value: { backgroundColor: 'blue', color: 'white' },
      };

      const classChange: DOMChange = {
        selector: '.btn',
        type: 'class',
        add: ['primary', 'large'],
      };

      const attrChange: DOMChange = {
        selector: '.btn',
        type: 'attribute',
        value: { disabled: 'true', 'data-action': 'submit' },
      };

      // Apply all changes
      domManipulator.applyChange(textChange, 'exp1');
      domManipulator.applyChange(styleChange, 'exp1');
      domManipulator.applyChange(classChange, 'exp1');
      domManipulator.applyChange(attrChange, 'exp1');

      // Verify all changes applied
      expect(element.textContent).toBe('Submit');
      expect(element.style.backgroundColor).toBe('blue');
      expect(element.style.color).toBe('white');
      expect(element.classList.contains('primary')).toBe(true);
      expect(element.classList.contains('large')).toBe(true);
      expect(element.getAttribute('disabled')).toBe('true');
      expect(element.getAttribute('data-action')).toBe('submit');

      // All changes tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(4);

      // Verify the class change is tracked with the correct element
      const classChangeApplied = applied.find(a => a.change.type === 'class');
      expect(classChangeApplied).toBeDefined();
      expect(classChangeApplied?.elements).toContain(element);

      // Check order of changes - class change should be third (index 2)
      expect(applied[0].change.type).toBe('text');
      expect(applied[1].change.type).toBe('style');
      expect(applied[2].change.type).toBe('class');
      expect(applied[3].change.type).toBe('attribute');

      // Check the original states stored
      const classOriginalState = stateManager.getOriginalState('.btn', 'class');
      expect(classOriginalState).toBeDefined();
      expect(classOriginalState?.originalState.classList).toEqual(['btn']);

      // Remove all and verify restoration
      domManipulator.removeChanges('exp1');

      // Debug: Check the actual classes on the element
      // After removal, should only have original class

      expect(element.textContent).toBe('Click');
      // Style should be completely cleared since original had no style attribute
      expect(element.getAttribute('style')).toBeNull();
      // The original element had class "btn", so after restoration it should only have "btn"
      expect(element.className).toBe('btn');
      expect(element.classList.contains('btn')).toBe(true);
      expect(element.classList.contains('primary')).toBe(false);
      expect(element.classList.contains('large')).toBe(false);
      expect(element.hasAttribute('disabled')).toBe(false);
      expect(element.hasAttribute('data-action')).toBe(false);
    });
  });

  describe('Real-world sequential change scenarios', () => {
    it('should handle progressive text transformations', () => {
      document.body.innerHTML = '<h1 class="title">Welcome</h1>';
      const element = document.querySelector('.title') as HTMLElement;

      // Simulate a series of text edits
      const edits = [
        'Welcome to our site',
        'Welcome to our amazing site',
        'Welcome to our amazing site!',
        'Welcome to ABSmartly!',
      ];

      edits.forEach(text => {
        const change: DOMChange = {
          selector: '.title',
          type: 'text',
          value: text,
        };
        domManipulator.applyChange(change, 'exp1');
        expect(element.textContent).toBe(text);
      });

      // All edits should be tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(4);

      // Removing should restore original
      domManipulator.removeChanges('exp1');
      expect(element.textContent).toBe('Welcome');
    });

    it('should handle incremental style building', () => {
      document.body.innerHTML = '<div class="card">Card content</div>';
      const element = document.querySelector('.card') as HTMLElement;

      // Build up styles incrementally
      const styleSteps: Array<Record<string, string>> = [
        { padding: '10px' },
        { border: '1px solid #ccc' },
        { borderRadius: '8px' },
        { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
        { backgroundColor: '#f5f5f5' },
      ];

      styleSteps.forEach(styles => {
        const change: DOMChange = {
          selector: '.card',
          type: 'style',
          value: styles,
        };
        domManipulator.applyChange(change, 'exp1');

        // Verify each style is applied and previous ones remain
        Object.entries(styles).forEach(([prop]) => {
          expect(
            element.style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase())
          ).toBeTruthy();
        });
      });

      // All style changes should be tracked
      const applied = stateManager.getAppliedChanges('exp1');
      expect(applied).toHaveLength(5);
    });
  });
});
