/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMManipulatorLite } from '../DOMManipulatorLite';
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { TestDataFactory, MockContextFactory, TestDOMUtils } from '../../__tests__/test-utils';
import { DOMChange } from '../../types';

describe('DOMManipulatorLite', () => {
  let plugin: DOMChangesPluginLite;
  let manipulator: DOMManipulatorLite;

  beforeEach(() => {
    document.body.innerHTML = '';
    const context = MockContextFactory.create([]);
    plugin = new DOMChangesPluginLite({ context });
    manipulator = (plugin as any).domManipulator;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create an instance', () => {
      expect(manipulator).toBeInstanceOf(DOMManipulatorLite);
    });

    it('should initialize with debug mode', () => {
      const context = MockContextFactory.create([]);
      const debugPlugin = new DOMChangesPluginLite({ context, debug: true });
      const debugManipulator = (debugPlugin as any).domManipulator;

      expect((debugManipulator as any).debug).toBe(true);
    });

    it('should initialize pending manager', () => {
      expect((manipulator as any).pendingManager).toBeDefined();
    });
  });

  describe('Text Changes', () => {
    it('should apply text change to single element', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change = TestDataFactory.createTextChange('.target', 'Modified');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.textContent).toBe('Modified');
    });

    it('should apply text change to multiple elements', () => {
      document.body.innerHTML = `
        <div class="target">Original 1</div>
        <div class="target">Original 2</div>
        <div class="target">Original 3</div>
      `;

      const change = TestDataFactory.createTextChange('.target', 'Modified');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const elements = document.querySelectorAll('.target');
      elements.forEach(el => {
        expect(el.textContent).toBe('Modified');
      });
    });

    it('should return false for non-existent elements without waitForElement', () => {
      document.body.innerHTML = '<div class="other">Content</div>';

      const change = TestDataFactory.createTextChange('.target', 'Modified');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(false);
    });

    it('should queue pending change with waitForElement flag', () => {
      document.body.innerHTML = '<div class="container"></div>';

      const change = TestDataFactory.createPendingChange('.target', 'text', 'Modified');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true); // Returns true because it was queued
    });
  });

  describe('HTML Changes', () => {
    it('should apply HTML change', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'html',
        value: '<strong>Modified</strong> Content',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.innerHTML).toBe(
        '<strong>Modified</strong> Content'
      );
    });

    it('should preserve existing HTML structure', () => {
      document.body.innerHTML = '<div class="target"><span>Nested</span></div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'html',
        value: '<p>New Content</p>',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target span')).toBeNull();
      expect(document.querySelector('.target p')).not.toBeNull();
    });
  });

  describe('Style Changes', () => {
    it('should apply inline styles', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change = TestDataFactory.createStyleChange('.target', {
        color: 'red',
        fontSize: '20px',
        backgroundColor: 'blue',
      });
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const element = document.querySelector('.target') as HTMLElement;
      expect(element.style.color).toBe('red');
      expect(element.style.fontSize).toBe('20px');
      expect(element.style.backgroundColor).toBe('blue');
    });

    it('should handle camelCase style properties', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'style',
        value: {
          backgroundColor: 'red',
          borderRadius: '5px',
          fontSize: '16px',
        },
      };
      manipulator.applyChange(change, 'test_exp');

      const element = document.querySelector('.target') as HTMLElement;
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.borderRadius).toBe('5px');
      expect(element.style.fontSize).toBe('16px');
    });

    it('should handle kebab-case style properties', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'style',
        value: {
          'background-color': 'green',
          'font-size': '18px',
        },
      };
      manipulator.applyChange(change, 'test_exp');

      const element = document.querySelector('.target') as HTMLElement;
      expect(element.style.backgroundColor).toBe('green');
      expect(element.style.fontSize).toBe('18px');
    });

    it('should apply styles to multiple elements', () => {
      document.body.innerHTML = `
        <div class="target">Content 1</div>
        <div class="target">Content 2</div>
      `;

      const change = TestDataFactory.createStyleChange('.target', { color: 'blue' });
      manipulator.applyChange(change, 'test_exp');

      const elements = document.querySelectorAll('.target') as NodeListOf<HTMLElement>;
      elements.forEach(el => {
        expect(el.style.color).toBe('blue');
      });
    });
  });

  describe('Class Changes', () => {
    it('should add classes', () => {
      document.body.innerHTML = '<div class="target existing">Content</div>';

      const change = TestDataFactory.createClassChange('.target', ['new-class', 'another-class']);
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const element = document.querySelector('.target');
      expect(element?.classList.contains('new-class')).toBe(true);
      expect(element?.classList.contains('another-class')).toBe(true);
      expect(element?.classList.contains('existing')).toBe(true);
    });

    it('should remove classes', () => {
      document.body.innerHTML =
        '<div class="target old-class another-class keep-this">Content</div>';

      const change = TestDataFactory.createClassChange(
        '.target',
        [],
        ['old-class', 'another-class']
      );
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const element = document.querySelector('.target');
      expect(element?.classList.contains('old-class')).toBe(false);
      expect(element?.classList.contains('another-class')).toBe(false);
      expect(element?.classList.contains('keep-this')).toBe(true);
    });

    it('should add and remove classes simultaneously', () => {
      document.body.innerHTML = '<div class="target old-class">Content</div>';

      const change = TestDataFactory.createClassChange('.target', ['new-class'], ['old-class']);
      manipulator.applyChange(change, 'test_exp');

      const element = document.querySelector('.target');
      expect(element?.classList.contains('new-class')).toBe(true);
      expect(element?.classList.contains('old-class')).toBe(false);
      expect(element?.classList.contains('target')).toBe(true);
    });

    it('should handle empty add/remove arrays', () => {
      document.body.innerHTML = '<div class="target existing">Content</div>';

      const change = TestDataFactory.createClassChange('.target', [], []);
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const element = document.querySelector('.target');
      expect(element?.classList.contains('existing')).toBe(true);
    });

    it('should not error when removing non-existent class', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change = TestDataFactory.createClassChange('.target', [], ['non-existent']);

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should not duplicate classes when adding existing class', () => {
      document.body.innerHTML = '<div class="target existing">Content</div>';

      const change = TestDataFactory.createClassChange('.target', ['existing']);
      manipulator.applyChange(change, 'test_exp');

      const element = document.querySelector('.target');
      const classes = Array.from(element?.classList || []);
      const existingCount = classes.filter(c => c === 'existing').length;
      expect(existingCount).toBe(1);
    });
  });

  describe('Attribute Changes', () => {
    it('should set attribute', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: { 'data-test': 'test-value' },
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.getAttribute('data-test')).toBe('test-value');
    });

    it('should update existing attribute', () => {
      document.body.innerHTML = '<div class="target" data-test="old">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: { 'data-test': 'new-value' },
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.getAttribute('data-test')).toBe('new-value');
    });

    it('should remove attribute when value is null', () => {
      document.body.innerHTML = '<div class="target" data-test="value">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: { 'data-test': null as any },
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.hasAttribute('data-test')).toBe(false);
    });

    it('should handle special attributes like href', () => {
      document.body.innerHTML = '<a class="target" href="old.html">Link</a>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: { href: 'new.html' },
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.getAttribute('href')).toBe('new.html');
    });

    it('should handle boolean-like attributes', () => {
      document.body.innerHTML = '<button class="target">Click</button>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: { disabled: 'true' },
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('JavaScript Changes', () => {
    it('should execute JavaScript code', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'javascript',
        value: 'element.textContent = "Modified by JS";',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.textContent).toBe('Modified by JS');
    });

    it('should provide element context to JavaScript', () => {
      document.body.innerHTML = '<div class="target" data-value="test">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'javascript',
        value: 'element.textContent = element.getAttribute("data-value");',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.textContent).toBe('test');
    });

    it('should handle JavaScript errors gracefully', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'javascript',
        value: 'throw new Error("Test error");',
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should execute JavaScript on multiple elements', () => {
      document.body.innerHTML = `
        <div class="target">1</div>
        <div class="target">2</div>
        <div class="target">3</div>
      `;

      const change: DOMChange = {
        selector: '.target',
        type: 'javascript',
        value: 'element.textContent = "Modified " + element.textContent;',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target:nth-of-type(1)')?.textContent).toBe('Modified 1');
      expect(document.querySelector('.target:nth-of-type(2)')?.textContent).toBe('Modified 2');
      expect(document.querySelector('.target:nth-of-type(3)')?.textContent).toBe('Modified 3');
    });

    it('should handle empty JavaScript value', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'javascript',
        value: '',
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });
  });

  describe('Move Changes', () => {
    it('should move element to lastChild position', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const change = TestDataFactory.createMoveChange('.item-1', '.container', 'lastChild');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('item-1')).toBe(true);
    });

    it('should move element to firstChild position', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const change = TestDataFactory.createMoveChange('.item-3', '.container', 'firstChild');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('item-3')).toBe(true);
    });

    it('should move element before another element', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const change = TestDataFactory.createMoveChange('.item-3', '.item-1', 'before');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('item-3')).toBe(true);
    });

    it('should move element after another element', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
          <div class="item-3">Item 3</div>
        </div>
      `;

      const change = TestDataFactory.createMoveChange('.item-1', '.item-3', 'after');
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('item-1')).toBe(true);
    });

    it('should handle missing target selector', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
        </div>
      `;

      const change = TestDataFactory.createMoveChange('.item-1', '.non-existent', 'before');

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should accept move parameters from value object', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="item-1">Item 1</div>
          <div class="item-2">Item 2</div>
        </div>
      `;

      const change: DOMChange = {
        selector: '.item-1',
        type: 'move',
        value: {
          targetSelector: '.container',
          position: 'lastChild',
        },
      };
      manipulator.applyChange(change, 'test_exp');

      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('item-1')).toBe(true);
    });
  });

  describe('Create Changes', () => {
    it('should create element at lastChild position', () => {
      document.body.innerHTML = '<div class="container"></div>';

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-item">New Item</div>',
        targetSelector: '.container',
        position: 'lastChild',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.new-item')).not.toBeNull();
      expect(document.querySelector('.new-item')?.textContent).toBe('New Item');
    });

    it('should create element at firstChild position', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="existing">Existing</div>
        </div>
      `;

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-first">New First</div>',
        targetSelector: '.container',
        position: 'firstChild',
      };
      manipulator.applyChange(change, 'test_exp');

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('new-first')).toBe(true);
    });

    it('should create element before another element', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="existing">Existing</div>
        </div>
      `;

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-before">New Before</div>',
        targetSelector: '.existing',
        position: 'before',
      };
      manipulator.applyChange(change, 'test_exp');

      const container = document.querySelector('.container');
      expect(container?.firstElementChild?.classList.contains('new-before')).toBe(true);
    });

    it('should create element after another element', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="existing">Existing</div>
        </div>
      `;

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-after">New After</div>',
        targetSelector: '.existing',
        position: 'after',
      };
      manipulator.applyChange(change, 'test_exp');

      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('new-after')).toBe(true);
    });

    it('should create multiple elements from HTML string', () => {
      document.body.innerHTML = '<div class="container"></div>';

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="item-1">Item 1</div><div class="item-2">Item 2</div>',
        targetSelector: '.container',
        position: 'lastChild',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.item-1')).not.toBeNull();
      expect(document.querySelector('.item-2')).not.toBeNull();
    });

    it('should handle complex HTML structures', () => {
      document.body.innerHTML = '<div class="container"></div>';

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: `
          <div class="card">
            <h3>Title</h3>
            <p>Description</p>
            <button>Click</button>
          </div>
        `,
        targetSelector: '.container',
        position: 'lastChild',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.card')).not.toBeNull();
      expect(document.querySelector('.card h3')).not.toBeNull();
      expect(document.querySelector('.card p')).not.toBeNull();
      expect(document.querySelector('.card button')).not.toBeNull();
    });

    it('should default to lastChild when position not specified', () => {
      document.body.innerHTML = '<div class="container"><div class="existing">Existing</div></div>';

      const change: DOMChange = {
        selector: '',
        type: 'create',
        element: '<div class="new-item">New</div>',
        targetSelector: '.container',
      };
      manipulator.applyChange(change, 'test_exp');

      const container = document.querySelector('.container');
      expect(container?.lastElementChild?.classList.contains('new-item')).toBe(true);
    });
  });

  describe('Delete Changes', () => {
    it('should delete single element', () => {
      document.body.innerHTML = '<div class="target">Delete Me</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'delete',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')).toBeNull();
    });

    it('should delete multiple elements', () => {
      document.body.innerHTML = `
        <div class="target">Delete 1</div>
        <div class="target">Delete 2</div>
        <div class="target">Delete 3</div>
      `;

      const change: DOMChange = {
        selector: '.target',
        type: 'delete',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelectorAll('.target')).toHaveLength(0);
    });

    it('should handle deleting non-existent elements', () => {
      document.body.innerHTML = '<div class="other">Content</div>';

      const change: DOMChange = {
        selector: '.non-existent',
        type: 'delete',
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should preserve siblings when deleting element', () => {
      document.body.innerHTML = `
        <div class="container">
          <div class="keep-1">Keep 1</div>
          <div class="delete-me">Delete</div>
          <div class="keep-2">Keep 2</div>
        </div>
      `;

      const change: DOMChange = {
        selector: '.delete-me',
        type: 'delete',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.keep-1')).not.toBeNull();
      expect(document.querySelector('.keep-2')).not.toBeNull();
      expect(document.querySelector('.delete-me')).toBeNull();
    });
  });

  describe('StyleRules Changes', () => {
    it('should apply CSS rules via stylesheet', () => {
      TestDOMUtils.createTestPage();

      const change: DOMChange = {
        selector: 'test-rules-1',
        type: 'styleRules',
        value: '.hero-title { color: red; font-size: 24px; }',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);

      let ruleFound = false;
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
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

    it('should handle multiple CSS rules', () => {
      TestDOMUtils.createTestPage();

      const change: DOMChange = {
        selector: 'test-rules-2',
        type: 'styleRules',
        value: `
          .rule-1 { color: blue; }
          .rule-2 { font-size: 16px; }
          .rule-3 { background: yellow; }
        `,
      };
      manipulator.applyChange(change, 'test_exp');

      let rulesFound = 0;
      for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
          const rules = sheet.cssRules || sheet.rules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule;
            if (['rule-1', 'rule-2', 'rule-3'].some(r => rule.selectorText?.includes(r))) {
              rulesFound++;
            }
          }
        } catch (e) {
          // Skip sheets we can't access
        }
      }

      expect(rulesFound).toBeGreaterThan(0);
    });
  });

  describe('Disabled Changes', () => {
    it('should skip disabled changes', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'text',
        value: 'Should Not Apply',
        enabled: false,
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(false);
      expect(document.querySelector('.target')?.textContent).toBe('Original');
    });

    it('should apply changes when enabled is true', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'text',
        value: 'Should Apply',
        enabled: true,
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.textContent).toBe('Should Apply');
    });

    it('should apply changes when enabled is undefined', () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'text',
        value: 'Should Apply',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.textContent).toBe('Should Apply');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid selectors', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '>>>invalid<<<',
        type: 'text',
        value: 'Text',
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should handle missing required change properties', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'attribute',
        value: undefined as any,
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should handle null values appropriately', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'text',
        value: null as any,
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty selector', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '',
        type: 'text',
        value: 'Text',
      };

      expect(() => manipulator.applyChange(change, 'test_exp')).not.toThrow();
    });

    it('should handle whitespace-only values', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const change: DOMChange = {
        selector: '.target',
        type: 'text',
        value: '   ',
      };
      manipulator.applyChange(change, 'test_exp');

      expect(document.querySelector('.target')?.textContent).toBe('   ');
    });

    it('should handle special characters in selectors', () => {
      document.body.innerHTML = '<div class="target-special_class">Content</div>';

      const change: DOMChange = {
        selector: '.target-special_class',
        type: 'text',
        value: 'Modified',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target-special_class')?.textContent).toBe('Modified');
    });

    it('should handle deeply nested selectors', () => {
      document.body.innerHTML = `
        <div class="level-1">
          <div class="level-2">
            <div class="level-3">
              <div class="level-4">
                <div class="target">Deep Content</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const change: DOMChange = {
        selector: '.level-1 .level-2 .level-3 .level-4 .target',
        type: 'text',
        value: 'Modified Deep',
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target')?.textContent).toBe('Modified Deep');
    });

    it('should handle changes to SVG elements', () => {
      document.body.innerHTML = `
        <svg class="svg-container">
          <circle class="target-circle" r="50"></circle>
        </svg>
      `;

      const change: DOMChange = {
        selector: '.target-circle',
        type: 'attribute',
        value: { r: '100' },
      };
      const result = manipulator.applyChange(change, 'test_exp');

      expect(result).toBe(true);
      expect(document.querySelector('.target-circle')?.getAttribute('r')).toBe('100');
    });
  });

  describe('Performance', () => {
    it('should handle bulk changes efficiently', () => {
      // Create 100 elements
      document.body.innerHTML = Array.from(
        { length: 100 },
        (_, i) => `<div class="item" data-index="${i}">Item ${i}</div>`
      ).join('');

      const change: DOMChange = {
        selector: '.item',
        type: 'text',
        value: 'Modified',
      };

      const start = performance.now();
      manipulator.applyChange(change, 'test_exp');
      const duration = performance.now() - start;

      // Should complete in less than 50ms
      expect(duration).toBeLessThan(50);

      // Verify all elements were modified
      const elements = document.querySelectorAll('.item');
      expect(elements).toHaveLength(100);
      elements.forEach(el => {
        expect(el.textContent).toBe('Modified');
      });
    });

    it('should handle complex style changes efficiently', () => {
      document.body.innerHTML = '<div class="target">Content</div>';

      const complexStyles: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        complexStyles[`--custom-${i}`] = `value-${i}`;
      }

      const change: DOMChange = {
        selector: '.target',
        type: 'style',
        value: complexStyles,
      };

      const start = performance.now();
      manipulator.applyChange(change, 'test_exp');
      const duration = performance.now() - start;

      // Should complete in less than 10ms
      expect(duration).toBeLessThan(10);
    });
  });
});
