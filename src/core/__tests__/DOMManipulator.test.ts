import { DOMManipulator } from '../DOMManipulator';
import { StateManager } from '../StateManager';
import { DOMChange } from '../../types';

describe('DOMManipulator', () => {
  let domManipulator: DOMManipulator;
  let stateManager: StateManager;
  let mockPlugin: any;

  beforeEach(() => {
    stateManager = new StateManager();
    mockPlugin = {
      watchElement: jest.fn(),
    };
    domManipulator = new DOMManipulator(stateManager, false, mockPlugin);
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
      const debugManipulator = new DOMManipulator(stateManager, true, mockPlugin);

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

      const success = domManipulator.applyChange(styleChange, 'exp1');
      expect(success).toBe(true);
      expect(element.style.backgroundColor).toBe('blue');

      const appliedChanges = stateManager.getAppliedChanges('exp1');
      expect(appliedChanges.length).toBeGreaterThan(0);
      const reverted = domManipulator.revertChange(appliedChanges[0]);

      expect(reverted).toBe(true);
      expect(element.getAttribute('style')).toBe('color: red;');
    });
  });

  describe('JavaScript changes', () => {
    it('should execute JavaScript changes successfully', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const change: DOMChange = {
        selector: '.test',
        type: 'javascript',
        value: 'element.textContent = "Modified by JS";',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(document.querySelector('.test')?.textContent).toBe('Modified by JS');
    });

    it('should handle JavaScript execution errors gracefully', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const change: DOMChange = {
        selector: '.test',
        type: 'javascript',
        value: 'invalid javascript syntax ===',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(false); // Returns false when JavaScript execution fails
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ABsmartly] JavaScript execution error:',
        expect.any(Error)
      );
      expect(document.querySelector('.test')?.textContent).toBe('Original');

      consoleSpy.mockRestore();
    });

    it('should skip JavaScript change when value is empty', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const change: DOMChange = {
        selector: '.test',
        type: 'javascript',
        value: '',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(false); // Returns false when JavaScript value is empty
      expect(document.querySelector('.test')?.textContent).toBe('Original');
    });
  });

  describe('Move changes', () => {
    it('should move element to target when target exists', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="source">Source Element</div>
        </div>
        <div class="target">Target Container</div>
      `;

      const change: DOMChange = {
        selector: '.source',
        type: 'move',
        targetSelector: '.target',
        position: 'lastChild',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(document.querySelector('.target')?.contains(document.querySelector('.source'))).toBe(
        true
      );
      expect(
        document.querySelector('.container')?.contains(document.querySelector('.source'))
      ).toBe(false);
    });

    it('should handle move when target does not exist', () => {
      document.body.innerHTML = '<div class="source">Source Element</div>';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const change: DOMChange = {
        selector: '.source',
        type: 'move',
        targetSelector: '.non-existent-target',
      };

      // Create with debug enabled to test warning
      const debugDomManipulator = new DOMManipulator(stateManager, true, mockPlugin);
      const success = debugDomManipulator.applyChange(change, 'exp1');

      expect(success).toBe(false); // Returns false when move target doesn't exist
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ABsmartly] Move target not found: .non-existent-target'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle move with different positions', () => {
      document.body.innerHTML = `
        <div class="target">
          <div>Existing Child</div>
        </div>
        <div class="source">Source Element</div>
      `;

      const change: DOMChange = {
        selector: '.source',
        type: 'move',
        targetSelector: '.target',
        position: 'firstChild',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      const target = document.querySelector('.target');
      expect(target?.firstElementChild?.textContent).toBe('Source Element');
    });
  });

  describe('Style rules (CSS pseudo-states)', () => {
    it('should apply style rules without error', () => {
      // Mock the plugin methods for style rules
      const mockPlugin = {
        getStyleManager: jest.fn().mockReturnValue({
          setRule: jest.fn(),
        }),
        buildStateRules: jest.fn().mockReturnValue('.test:hover { color: red; }'),
      } as any;

      const domManipulatorWithPlugin = new DOMManipulator(stateManager, false, mockPlugin);

      const change: DOMChange = {
        selector: '.test:hover',
        type: 'styleRules',
        states: {
          hover: { color: 'red' },
        },
      };

      const success = domManipulatorWithPlugin.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(mockPlugin.getStyleManager).toHaveBeenCalledWith('exp1');
      expect(mockPlugin.buildStateRules).toHaveBeenCalledWith(
        '.test:hover',
        { hover: { color: 'red' } },
        true
      );
    });

    it('should handle complex pseudo-selectors in style rules', () => {
      document.body.innerHTML = '<div class="complex-test">Element</div>';

      const mockPlugin = {
        getStyleManager: jest.fn().mockReturnValue({
          setRule: jest.fn(),
        }),
        buildStateRules: jest.fn().mockReturnValue('.complex-test:hover:focus { color: blue; }'),
      } as any;

      const domManipulatorWithPlugin = new DOMManipulator(stateManager, false, mockPlugin);

      const change: DOMChange = {
        selector: '.complex-test:hover:focus',
        type: 'styleRules',
        states: {
          hover: { color: 'blue' },
        },
      };

      const success = domManipulatorWithPlugin.applyChange(change, 'exp1');

      expect(success).toBe(true);
      // Should still try to mark the base element
      expect(
        document.querySelector('.complex-test')?.getAttribute('data-absmartly-style-rules')
      ).toBe('true');
    });

    it('should handle invalid selectors in style rules gracefully', () => {
      const mockPlugin = {
        getStyleManager: jest.fn().mockReturnValue({
          setRule: jest.fn(),
        }),
        buildStateRules: jest.fn().mockReturnValue('invalid::selector { color: red; }'),
      } as any;

      const domManipulatorWithPlugin = new DOMManipulator(stateManager, false, mockPlugin);

      const change: DOMChange = {
        selector: 'invalid::selector',
        type: 'styleRules',
        states: {
          hover: { color: 'red' },
        },
      };

      const success = domManipulatorWithPlugin.applyChange(change, 'exp1');

      expect(success).toBe(true); // Should still succeed even with invalid selector
    });
  });

  describe('Create element changes', () => {
    it('should create new element when selector has no matches', () => {
      document.body.innerHTML = '<div class="parent"></div>';

      const change: DOMChange = {
        selector: '.new-element',
        type: 'create',
        element: '<div class="new-element">New Element</div>',
        targetSelector: '.parent',
        position: 'lastChild',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(document.querySelector('.new-element')?.textContent).toBe('New Element');
      expect(
        document.querySelector('.parent')?.contains(document.querySelector('.new-element'))
      ).toBe(true);
    });

    it('should handle create element without target selector', () => {
      const change: DOMChange = {
        selector: '.new-element',
        type: 'create',
        value: '<div class="new-element">New Element</div>',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(false); // Should fail without target
    });
  });

  describe('Pending changes (waitForElement)', () => {
    it('should add changes to pending when element not found and waitForElement is true', () => {
      const change: DOMChange = {
        selector: '.not-found',
        type: 'text',
        value: 'Modified',
        waitForElement: true,
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true); // Returns true when queued for pending
    });

    it('should log when element not found for pending changes', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugDomManipulator = new DOMManipulator(stateManager, true, mockPlugin);

      const change: DOMChange = {
        selector: '.not-found',
        type: 'text',
        value: 'Modified',
        waitForElement: true,
      };

      debugDomManipulator.applyChange(change, 'exp1');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ABsmartly] Element not found, adding to pending: .not-found'
      );

      consoleLogSpy.mockRestore();
    });

    it('should apply pending changes when specific element is provided', () => {
      document.body.innerHTML = '<div class="test">Original</div>';
      const element = document.querySelector('.test') as HTMLElement;

      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Modified by Specific',
      };

      // Test the private method via the pending manager callback
      const domManipulatorWithCallback = new DOMManipulator(stateManager, false, mockPlugin);
      // Access pending manager for coverage
      expect((domManipulatorWithCallback as any).pendingManager).toBeDefined();

      // Simulate the callback that would be called by PendingChangeManager
      const success = (domManipulatorWithCallback as any).applyChangeToSpecificElement(
        change,
        'exp1',
        element
      );

      expect(success).toBe(true);
      expect(element.textContent).toBe('Modified by Specific');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null/undefined values in attribute changes', () => {
      document.body.innerHTML = '<div class="test" data-old="old-value">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'attribute',
        value: {
          'data-new': 'new-value',
          'data-old': null as any,
          'data-undefined': undefined as any,
        },
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      const element = document.querySelector('.test');
      expect(element?.getAttribute('data-new')).toBe('new-value');
      expect(element?.hasAttribute('data-old')).toBe(false);
      expect(element?.hasAttribute('data-undefined')).toBe(false);
    });

    it('should handle empty class arrays', () => {
      document.body.innerHTML = '<div class="test existing-class">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'class',
        add: [],
        remove: [],
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(document.querySelector('.test')?.className).toContain('existing-class');
    });

    it('should handle style changes with camelCase properties', () => {
      document.body.innerHTML = '<div class="test">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'style',
        value: {
          backgroundColor: 'red',
          marginTop: '10px',
          borderRadius: '5px',
        },
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      const element = document.querySelector('.test') as HTMLElement;
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.marginTop).toBe('10px');
      expect(element.style.borderRadius).toBe('5px');
    });

    it('should handle changes when element is removed from DOM', () => {
      document.body.innerHTML = '<div class="test">Test</div>';
      const element = document.querySelector('.test');

      // Remove element from DOM
      element?.remove();

      const change: DOMChange = {
        selector: '.test',
        type: 'text',
        value: 'Modified',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(false);
    });

    it('should handle complex nested selectors', () => {
      document.body.innerHTML = `
        <div class="parent">
          <div class="child">
            <span class="grandchild">Target</span>
          </div>
        </div>
      `;

      const change: DOMChange = {
        selector: '.parent .child .grandchild',
        type: 'text',
        value: 'Modified',
      };

      const success = domManipulator.applyChange(change, 'exp1');

      expect(success).toBe(true);
      expect(document.querySelector('.grandchild')?.textContent).toBe('Modified');
    });
  });

  describe('Restoration and cleanup', () => {
    it('should restore original state correctly for move changes', () => {
      document.body.innerHTML = `
        <div class="original-parent">
          <span>Before</span>
          <div class="moveable">Moveable</div>
          <span>After</span>
        </div>
        <div class="target-parent">Existing content</div>
      `;

      const originalParent = document.querySelector('.original-parent');
      const targetParent = document.querySelector('.target-parent');
      const moveable = document.querySelector('.moveable');
      const nextSibling = moveable?.nextElementSibling;

      const change: DOMChange = {
        selector: '.moveable',
        type: 'move',
        targetSelector: '.target-parent',
        position: 'lastChild',
      };

      // Apply the move
      domManipulator.applyChange(change, 'exp1');
      expect(targetParent?.contains(moveable)).toBe(true);

      // Remove changes to restore original position
      const removed = domManipulator.removeAllChanges('exp1');

      expect(removed.length).toBeGreaterThan(0);
      expect(originalParent?.contains(moveable)).toBe(true);
      // Should be in original position relative to siblings
      expect(moveable?.nextElementSibling).toBe(nextSibling);
    });

    it('should restore style attribute correctly when original was empty', () => {
      document.body.innerHTML = '<div class="test">Test</div>'; // No style attribute

      const change: DOMChange = {
        selector: '.test',
        type: 'style',
        value: { color: 'red' },
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('.test')?.getAttribute('style')).toContain('color: red');

      // Restore should remove style attribute entirely
      domManipulator.removeAllChanges('exp1');
      expect(document.querySelector('.test')?.hasAttribute('style')).toBe(false);
    });

    it('should restore class list correctly', () => {
      document.body.innerHTML = '<div class="test original-class another-class">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'class',
        add: ['new-class'],
        remove: ['original-class'],
      };

      domManipulator.applyChange(change, 'exp1');
      expect(document.querySelector('.test')?.classList.contains('new-class')).toBe(true);
      expect(document.querySelector('.test')?.classList.contains('original-class')).toBe(false);

      // Restore
      domManipulator.removeAllChanges('exp1');
      expect(document.querySelector('.test')?.classList.contains('new-class')).toBe(false);
      expect(document.querySelector('.test')?.classList.contains('original-class')).toBe(true);
      expect(document.querySelector('.test')?.classList.contains('another-class')).toBe(true);
    });

    it('should handle attribute restoration with complex scenarios', () => {
      document.body.innerHTML =
        '<div class="test" data-original="value" title="original">Test</div>';

      const change: DOMChange = {
        selector: '.test',
        type: 'attribute',
        value: {
          'data-original': 'modified',
          'data-new': 'added',
          title: null as any, // Remove existing
          'data-another': 'another-value',
        },
      };

      domManipulator.applyChange(change, 'exp1');
      const element = document.querySelector('.test');
      expect(element?.getAttribute('data-original')).toBe('modified');
      expect(element?.getAttribute('data-new')).toBe('added');
      expect(element?.hasAttribute('title')).toBe(false);

      // Restore
      domManipulator.removeAllChanges('exp1');
      expect(element?.getAttribute('data-original')).toBe('value');
      expect(element?.getAttribute('title')).toBe('original');
      expect(element?.hasAttribute('data-new')).toBe(false);
      expect(element?.hasAttribute('data-another')).toBe(false);
    });
  });

  describe('Performance and bulk operations', () => {
    it('should handle multiple elements efficiently', () => {
      // Create many elements
      const elements = Array.from(
        { length: 100 },
        (_, i) => `<div class="bulk-test" data-index="${i}">Element ${i}</div>`
      ).join('');
      document.body.innerHTML = elements;

      const change: DOMChange = {
        selector: '.bulk-test',
        type: 'text',
        value: 'Modified',
      };

      const startTime = performance.now();
      const success = domManipulator.applyChange(change, 'exp1');
      const endTime = performance.now();

      expect(success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly

      // Verify all elements were modified
      const modifiedElements = document.querySelectorAll('.bulk-test');
      modifiedElements.forEach(element => {
        expect(element.textContent).toBe('Modified');
        expect(element.getAttribute('data-absmartly-experiment')).toBe('exp1');
      });
    });

    it('should handle removal of multiple experiments efficiently', () => {
      document.body.innerHTML = '<div class="multi-test">Original</div>';

      // Apply multiple experiments to same element
      const experiments = ['exp1', 'exp2', 'exp3'];
      experiments.forEach((exp, index) => {
        const change: DOMChange = {
          selector: '.multi-test',
          type: 'attribute',
          value: { [`data-${exp}`]: `value-${index}` },
        };
        domManipulator.applyChange(change, exp);
      });

      // Remove all changes
      const removed = domManipulator.removeAllChanges();

      expect(removed.length).toBe(experiments.length);

      const element = document.querySelector('.multi-test');
      experiments.forEach(exp => {
        expect(element?.hasAttribute(`data-${exp}`)).toBe(false);
      });
    });
  });
});
