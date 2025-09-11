import { DOMManipulator } from '../DOMManipulator';
import { StateManager } from '../StateManager';
import { DOMChange } from '../../types';

describe('DOMManipulator', () => {
  let domManipulator: DOMManipulator;
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
    domManipulator = new DOMManipulator(stateManager, false, {} as any);
  });

  describe('applyChange', () => {
    describe('text changes', () => {
      it('should apply text changes to elements', () => {
        document.body.innerHTML = '<div class="test">Original</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'text',
          value: 'Modified',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        expect(document.querySelector('.test')?.textContent).toBe('Modified');
        expect(document.querySelector('.test')?.getAttribute('data-absmartly-experiment')).toBe(
          'exp1'
        );
        expect(document.querySelector('.test')?.getAttribute('data-absmartly-modified')).toBe(
          'true'
        );
      });

      it('should handle disabled changes', () => {
        document.body.innerHTML = '<div class="test">Original</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'text',
          value: 'Modified',
          enabled: false,
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(false);
        expect(document.querySelector('.test')?.textContent).toBe('Original');
      });
    });

    describe('html changes', () => {
      it('should apply HTML changes to elements', () => {
        document.body.innerHTML = '<div class="test">Original</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'html',
          value: '<span>Modified HTML</span>',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        expect(document.querySelector('.test')?.innerHTML).toBe('<span>Modified HTML</span>');
      });
    });

    describe('style changes', () => {
      it('should apply style changes to elements', () => {
        document.body.innerHTML = '<div class="test">Test</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'style',
          value: {
            'background-color': 'red',
            color: 'white',
            'font-size': '20px',
          },
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const element = document.querySelector('.test') as HTMLElement;
        expect(element.style.backgroundColor).toBe('red');
        expect(element.style.color).toBe('white');
        expect(element.style.fontSize).toBe('20px');
      });
    });

    describe('class changes', () => {
      it('should add and remove classes', () => {
        document.body.innerHTML = '<div class="test existing">Test</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'class',
          add: ['new-class', 'another-class'],
          remove: ['existing'],
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const element = document.querySelector('.test');
        expect(element?.classList.contains('new-class')).toBe(true);
        expect(element?.classList.contains('another-class')).toBe(true);
        expect(element?.classList.contains('existing')).toBe(false);
      });
    });

    describe('attribute changes', () => {
      it('should set and remove attributes', () => {
        document.body.innerHTML = '<div class="test" data-old="value">Test</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'attribute',
          value: {
            'data-new': 'new-value',
            'data-old': null as any, // Remove this
            'aria-label': 'Test label',
          },
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const element = document.querySelector('.test');
        expect(element?.getAttribute('data-new')).toBe('new-value');
        expect(element?.hasAttribute('data-old')).toBe(false);
        expect(element?.getAttribute('aria-label')).toBe('Test label');
      });
    });

    describe('javascript execution', () => {
      it('should execute JavaScript code on elements', () => {
        document.body.innerHTML = '<div class="test">Test</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'javascript',
          value:
            'element.setAttribute("data-js-executed", "true"); element.textContent = "JS Executed";',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const element = document.querySelector('.test');
        expect(element?.getAttribute('data-js-executed')).toBe('true');
        expect(element?.textContent).toBe('JS Executed');
      });

      it('should handle JavaScript execution errors', () => {
        document.body.innerHTML = '<div class="test">Test</div>';
        const change: DOMChange = {
          selector: '.test',
          type: 'javascript',
          value: 'throw new Error("Test error");',
        };

        // This should not throw, but return false since JS execution failed
        const success = domManipulator.applyChange(change, 'exp1');
        expect(success).toBe(false); // Returns false when JS execution fails
      });
    });

    describe('move operations', () => {
      it('should move element before target', () => {
        document.body.innerHTML = `
          <div id="container1"><div class="moveable">Move me</div></div>
          <div id="container2"><div class="target">Target</div></div>
        `;

        const change: DOMChange = {
          selector: '.moveable',
          type: 'move',
          targetSelector: '.target',
          position: 'before',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const container2 = document.querySelector('#container2');
        const moveable = document.querySelector('.moveable');
        const target = document.querySelector('.target');
        expect(moveable?.nextElementSibling).toBe(target);
        expect(container2?.contains(moveable as Node)).toBe(true);
      });

      it('should move element after target', () => {
        document.body.innerHTML = `
          <div id="container1"><div class="moveable">Move me</div></div>
          <div id="container2"><div class="target">Target</div></div>
        `;

        const change: DOMChange = {
          selector: '.moveable',
          type: 'move',
          targetSelector: '.target',
          position: 'after',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const target = document.querySelector('.target');
        const moveable = document.querySelector('.moveable');
        expect(target?.nextElementSibling).toBe(moveable);
      });

      it('should move element as first child', () => {
        document.body.innerHTML = `
          <div class="moveable">Move me</div>
          <div class="target"><span>Existing child</span></div>
        `;

        const change: DOMChange = {
          selector: '.moveable',
          type: 'move',
          targetSelector: '.target',
          position: 'firstChild',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const target = document.querySelector('.target');
        const moveable = document.querySelector('.moveable');
        expect(target?.firstElementChild).toBe(moveable);
      });

      it('should move element as last child', () => {
        document.body.innerHTML = `
          <div class="moveable">Move me</div>
          <div class="target"><span>Existing child</span></div>
        `;

        const change: DOMChange = {
          selector: '.moveable',
          type: 'move',
          targetSelector: '.target',
          position: 'lastChild',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const target = document.querySelector('.target');
        const moveable = document.querySelector('.moveable');
        expect(target?.lastElementChild).toBe(moveable);
      });
    });

    describe('create operations', () => {
      it('should create new elements', () => {
        document.body.innerHTML = '<div class="target"></div>';
        const change: DOMChange = {
          selector: '.created',
          type: 'create',
          element: '<div class="created">Created element</div>',
          targetSelector: '.target',
          position: 'lastChild',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const created = document.querySelector('.created');
        expect(created).not.toBeNull();
        expect(created?.textContent).toBe('Created element');
        expect(created?.getAttribute('data-absmartly-created')).toBe('true');
        expect(created?.getAttribute('data-absmartly-experiment')).toBe('exp1');
        expect(created?.hasAttribute('data-absmartly-change-id')).toBe(true);
      });

      it('should handle create with missing target', () => {
        const change: DOMChange = {
          selector: '.created',
          type: 'create',
          element: '<div class="created">Created element</div>',
          targetSelector: '.non-existent',
          position: 'lastChild',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(false);
        expect(document.querySelector('.created')).toBeNull();
      });
    });

    describe('multiple elements', () => {
      it('should apply changes to multiple matching elements', () => {
        document.body.innerHTML = `
          <div class="test">First</div>
          <div class="test">Second</div>
          <div class="test">Third</div>
        `;

        const change: DOMChange = {
          selector: '.test',
          type: 'text',
          value: 'Modified',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(true);
        const elements = document.querySelectorAll('.test');
        elements.forEach(el => {
          expect(el.textContent).toBe('Modified');
          expect(el.getAttribute('data-absmartly-experiment')).toBe('exp1');
        });
      });
    });

    describe('non-existent selectors', () => {
      it('should return false for non-existent selectors', () => {
        const change: DOMChange = {
          selector: '.non-existent',
          type: 'text',
          value: 'Modified',
        };

        const success = domManipulator.applyChange(change, 'exp1');

        expect(success).toBe(false);
      });
    });
  });

  describe('removeChanges', () => {
    it('should remove text changes and restore original', () => {
      document.body.innerHTML = '<div class="test">Original</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Modified',
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('.test')?.textContent).toBe('Modified');

      const removed = domManipulator.removeChanges('exp1');

      expect(removed).toHaveLength(1);
      expect(document.querySelector('.test')?.textContent).toBe('Original');
      expect(document.querySelector('.test')?.hasAttribute('data-absmartly-modified')).toBe(false);
      expect(document.querySelector('.test')?.hasAttribute('data-absmartly-experiment')).toBe(
        false
      );
    });

    it('should remove style changes and restore original', () => {
      document.body.innerHTML = '<div class="test" style="color: blue;">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'style',
        value: { color: 'red', 'font-size': '20px' },
      };

      domManipulator.applyChange(change, 'exp1');
      const element = document.querySelector('.test') as HTMLElement;
      expect(element.style.color).toBe('red');

      domManipulator.removeChanges('exp1');

      expect(element.getAttribute('style')).toBe('color: blue;');
    });

    it('should remove created elements', () => {
      document.body.innerHTML = '<div class="target"></div>';

      const change: DOMChange = {
        selector: '.created',
        type: 'create',
        element: '<div class="created">Created</div>',
        targetSelector: '.target',
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('.created')).not.toBeNull();

      domManipulator.removeChanges('exp1');

      expect(document.querySelector('.created')).toBeNull();
    });

    it('should handle multiple changes for same experiment', () => {
      document.body.innerHTML = `
        <div class="test1">Original1</div>
        <div class="test2">Original2</div>
      `;

      const change1: DOMChange = {
        selector: '.test1',
        type: 'text',
        value: 'Modified1',
      };

      const change2: DOMChange = {
        selector: '.test2',
        type: 'text',
        value: 'Modified2',
      };

      domManipulator.applyChange(change1, 'exp1');
      domManipulator.applyChange(change2, 'exp1');

      const removed = domManipulator.removeChanges('exp1');

      expect(removed).toHaveLength(2);
      expect(document.querySelector('.test1')?.textContent).toBe('Original1');
      expect(document.querySelector('.test2')?.textContent).toBe('Original2');
    });

    it('should return empty array if no changes to remove', () => {
      const removed = domManipulator.removeChanges('non-existent');
      expect(removed).toHaveLength(0);
    });
  });

  describe('removeAllChanges', () => {
    it('should remove all changes from all experiments', () => {
      document.body.innerHTML = `
        <div class="test1">Original1</div>
        <div class="test2">Original2</div>
      `;

      const change1: DOMChange = {
        selector: '.test1',
        type: 'text',
        value: 'Exp1 Change',
      };

      const change2: DOMChange = {
        selector: '.test2',
        type: 'text',
        value: 'Exp2 Change',
      };

      domManipulator.applyChange(change1, 'exp1');
      domManipulator.applyChange(change2, 'exp2');

      const removed = domManipulator.removeAllChanges();

      expect(removed).toHaveLength(2);
      expect(document.querySelector('.test1')?.textContent).toBe('Original1');
      expect(document.querySelector('.test2')?.textContent).toBe('Original2');
      expect(document.querySelector('[data-absmartly-modified]')).toBeNull();
    });

    it('should remove changes for specific experiment when provided', () => {
      document.body.innerHTML = `
        <div class="test1">Original1</div>
        <div class="test2">Original2</div>
      `;

      const change1: DOMChange = {
        selector: '.test1',
        type: 'text',
        value: 'Exp1 Change',
      };

      const change2: DOMChange = {
        selector: '.test2',
        type: 'text',
        value: 'Exp2 Change',
      };

      domManipulator.applyChange(change1, 'exp1');
      domManipulator.applyChange(change2, 'exp2');

      const removed = domManipulator.removeAllChanges('exp1');

      expect(removed).toHaveLength(1);
      expect(document.querySelector('.test1')?.textContent).toBe('Original1');
      expect(document.querySelector('.test2')?.textContent).toBe('Exp2 Change');
    });
  });

  describe('debug mode', () => {
    it('should log debug messages when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const debugManipulator = new DOMManipulator(stateManager, true, {} as any);

      const change: DOMChange = {
        selector: '.non-existent',
        type: 'text',
        value: 'Test',
      };

      debugManipulator.applyChange(change, 'exp1');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ABsmartly] No elements found for selector: .non-existent')
      );
    });
  });

  describe('state restoration', () => {
    it('should restore class list properly', () => {
      document.body.innerHTML = '<div class="test original-class another-class">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'class',
        add: ['new-class'],
        remove: ['original-class'],
      };

      domManipulator.applyChange(change, 'exp1');

      const element = document.querySelector('.test');
      expect(element?.classList.contains('new-class')).toBe(true);
      expect(element?.classList.contains('original-class')).toBe(false);

      domManipulator.removeChanges('exp1');

      expect(element?.classList.contains('new-class')).toBe(false);
      expect(element?.classList.contains('original-class')).toBe(true);
      expect(element?.classList.contains('another-class')).toBe(true);
    });

    it('should restore move operations', () => {
      document.body.innerHTML = `
        <div id="original-parent"><div class="moveable">Element</div></div>
        <div id="target-parent"></div>
      `;

      const originalParent = document.querySelector('#original-parent');
      const moveable = document.querySelector('.moveable');

      const change: DOMChange = {
        selector: '.moveable',
        type: 'move',
        targetSelector: '#target-parent',
        position: 'lastChild',
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('#target-parent')?.contains(moveable as Node)).toBe(true);

      domManipulator.removeChanges('exp1');
      expect(originalParent?.contains(moveable as Node)).toBe(true);
    });
  });

  describe('removeSpecificChange', () => {
    it('should remove a specific change and restore element', () => {
      document.body.innerHTML = `
        <div class="test1">Original1</div>
        <div class="test2">Original2</div>
      `;

      const change1: DOMChange = { selector: '.test1', type: 'text', value: 'Modified1' };
      const change2: DOMChange = { selector: '.test2', type: 'text', value: 'Modified2' };

      domManipulator.applyChange(change1, 'exp1');
      domManipulator.applyChange(change2, 'exp1');

      // Remove only the first change
      const removed = domManipulator.removeSpecificChange('exp1', '.test1', 'text');

      expect(removed).toBe(true);
      expect(document.querySelector('.test1')?.textContent).toBe('Original1');
      expect(document.querySelector('.test2')?.textContent).toBe('Modified2');

      // Verify state manager was updated
      const remaining = stateManager.getAppliedChanges('exp1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].change.selector).toBe('.test2');
    });

    it('should return false when change not found', () => {
      document.body.innerHTML = '<div class="test">Original</div>';

      const change: DOMChange = { selector: '.test', type: 'text', value: 'Modified' };
      domManipulator.applyChange(change, 'exp1');

      const removed = domManipulator.removeSpecificChange('exp1', '.nonexistent', 'text');

      expect(removed).toBe(false);
      expect(document.querySelector('.test')?.textContent).toBe('Modified');
    });

    it('should remove created elements when removing create change', () => {
      document.body.innerHTML = '<div class="target"></div>';

      const change: DOMChange = {
        selector: '.created',
        type: 'create',
        element: '<div class="created" data-absmartly-created="true">Created</div>',
        targetSelector: '.target',
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('.created')).not.toBeNull();

      const removed = domManipulator.removeSpecificChange('exp1', '.created', 'create');

      expect(removed).toBe(true);
      expect(document.querySelector('.created')).toBeNull();
    });

    it('should handle multiple elements with same selector', () => {
      document.body.innerHTML = `
        <div class="test">Original1</div>
        <div class="test">Original2</div>
      `;

      const change: DOMChange = { selector: '.test', type: 'text', value: 'Modified' };
      domManipulator.applyChange(change, 'exp1');

      const elements = document.querySelectorAll('.test');
      elements.forEach(el => {
        expect(el.textContent).toBe('Modified');
      });

      const removed = domManipulator.removeSpecificChange('exp1', '.test', 'text');

      expect(removed).toBe(true);
      elements.forEach(el => {
        expect(el.textContent).toMatch(/Original/);
      });
    });
  });

  describe('revertChange', () => {
    it('should revert an applied change', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      const change: DOMChange = { selector: '.test', type: 'text', value: 'Modified' };
      domManipulator.applyChange(change, 'exp1');

      const appliedChanges = stateManager.getAppliedChanges('exp1');
      expect(appliedChanges).toHaveLength(1);

      const reverted = domManipulator.revertChange(appliedChanges[0]);

      expect(reverted).toBe(true);
      expect(element.textContent).toBe('Original');
      expect(element.hasAttribute('data-absmartly-modified')).toBe(false);
      expect(element.hasAttribute('data-absmartly-experiment')).toBe(false);
    });

    it('should remove created elements when reverting create change', () => {
      document.body.innerHTML = '<div class="target"></div>';

      const change: DOMChange = {
        selector: '.created',
        type: 'create',
        element: '<div class="created" data-absmartly-created="true">Created</div>',
        targetSelector: '.target',
      };

      domManipulator.applyChange(change, 'exp1');
      const appliedChanges = stateManager.getAppliedChanges('exp1');

      const reverted = domManipulator.revertChange(appliedChanges[0]);

      expect(reverted).toBe(true);
      expect(document.querySelector('.created')).toBeNull();
    });

    it('should handle null elements gracefully', () => {
      const mockAppliedChange = {
        experimentName: 'exp1',
        change: { selector: '.test', type: 'text' as const, value: 'Modified' },
        elements: [null as any], // Invalid element
        timestamp: Date.now(),
      };

      // Should return true but skip the null element
      const reverted = domManipulator.revertChange(mockAppliedChange);
      expect(reverted).toBe(true);
    });

    it('should restore multiple types of changes', () => {
      document.body.innerHTML = '<div class="test" style="color: red;">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      // Apply multiple change types
      const styleChange: DOMChange = {
        selector: '.test',
        type: 'style',
        value: { backgroundColor: 'blue', fontSize: '20px' },
      };

      domManipulator.applyChange(styleChange, 'exp1');
      expect(element.style.backgroundColor).toBe('blue');

      const appliedChanges = stateManager.getAppliedChanges('exp1');
      const reverted = domManipulator.revertChange(appliedChanges[0]);

      expect(reverted).toBe(true);
      expect(element.getAttribute('style')).toBe('color: red;');
    });
  });
});
