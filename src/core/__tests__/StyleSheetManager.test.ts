/* eslint-disable @typescript-eslint/no-explicit-any */
import { StyleSheetManager } from '../StyleSheetManager';
import * as debugModule from '../../utils/debug';

describe('StyleSheetManager', () => {
  let manager: StyleSheetManager;
  const testId = 'test-stylesheet';

  beforeEach(() => {
    // Clear any existing test stylesheets
    document.head.querySelectorAll('[data-absmartly-styles="true"]').forEach(el => el.remove());
    manager = new StyleSheetManager(testId);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('initialization', () => {
    it('should initialize with id and debug flag', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      expect(debugManager.getRulesCount()).toBe(0);
      debugManager.destroy();
    });

    it('should start with empty rules', () => {
      expect(manager.getRulesCount()).toBe(0);
      expect(manager.getCssText()).toBe('');
    });
  });

  describe('ensure()', () => {
    it('should create new style element if none exists', () => {
      const styleEl = manager.ensure();

      expect(styleEl).toBeInstanceOf(HTMLStyleElement);
      expect(styleEl.id).toBe(testId);
      expect(styleEl.getAttribute('data-absmartly-styles')).toBe('true');
      expect(document.head.contains(styleEl)).toBe(true);
    });

    it('should return existing style element if already exists', () => {
      const styleEl1 = manager.ensure();
      const styleEl2 = manager.ensure();

      expect(styleEl1).toBe(styleEl2);
      expect(document.head.querySelectorAll(`#${testId}`)).toHaveLength(1);
    });

    it('should recreate element if existing one is not in document', () => {
      const styleEl1 = manager.ensure();
      styleEl1.remove(); // Remove from document

      const styleEl2 = manager.ensure();

      expect(styleEl1).not.toBe(styleEl2);
      expect(styleEl2.id).toBe(testId);
      expect(document.head.contains(styleEl2)).toBe(true);
    });

    it('should reuse existing element by id if found in document', () => {
      // Manually create element with same ID
      const existingEl = document.createElement('style');
      existingEl.id = testId;
      document.head.appendChild(existingEl);

      const styleEl = manager.ensure();

      expect(styleEl).toBe(existingEl);
    });

    it('should log debug message when creating new stylesheet', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.ensure();

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Created stylesheet: debug-test');
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });
  });

  describe('setRule()', () => {
    it('should set CSS rule and render it', () => {
      const css = '.test { color: red; }';
      manager.setRule('test-rule', css);

      expect(manager.hasRule('test-rule')).toBe(true);
      expect(manager.getRulesCount()).toBe(1);
      expect(manager.getCssText()).toBe(css);

      const styleEl = manager.ensure();
      expect(styleEl.textContent).toBe(css);
    });

    it('should update existing rule', () => {
      const css1 = '.test { color: red; }';
      const css2 = '.test { color: blue; }';

      manager.setRule('test-rule', css1);
      expect(manager.getCssText()).toBe(css1);

      manager.setRule('test-rule', css2);
      expect(manager.getCssText()).toBe(css2);
      expect(manager.getRulesCount()).toBe(1);
    });

    it('should handle multiple rules', () => {
      const css1 = '.test1 { color: red; }';
      const css2 = '.test2 { color: blue; }';

      manager.setRule('rule1', css1);
      manager.setRule('rule2', css2);

      expect(manager.getRulesCount()).toBe(2);
      expect(manager.getCssText()).toBe(`${css1}\n\n${css2}`);

      const styleEl = manager.ensure();
      expect(styleEl.textContent).toBe(`${css1}\n\n${css2}`);
    });

    it('should log debug message when setting rule', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.setRule('test-rule', '.test { color: red; }');

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Set CSS rule for test-rule');
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });

    it('should handle empty CSS rule', () => {
      manager.setRule('empty-rule', '');

      expect(manager.hasRule('empty-rule')).toBe(true);
      expect(manager.getCssText()).toBe('');
    });

    it('should handle complex CSS with multiple selectors', () => {
      const complexCss = `
        .test1, .test2 { color: red; }
        .test1:hover { color: blue; }
        @media screen and (max-width: 600px) {
          .test1 { font-size: 14px; }
        }
      `;

      manager.setRule('complex-rule', complexCss);

      expect(manager.getCssText()).toBe(complexCss);
      expect(manager.ensure().textContent).toBe(complexCss);
    });
  });

  describe('deleteRule()', () => {
    it('should delete existing rule and re-render', () => {
      const css1 = '.test1 { color: red; }';
      const css2 = '.test2 { color: blue; }';

      manager.setRule('rule1', css1);
      manager.setRule('rule2', css2);
      expect(manager.getRulesCount()).toBe(2);

      manager.deleteRule('rule1');

      expect(manager.hasRule('rule1')).toBe(false);
      expect(manager.hasRule('rule2')).toBe(true);
      expect(manager.getRulesCount()).toBe(1);
      expect(manager.getCssText()).toBe(css2);
    });

    it('should do nothing when deleting non-existent rule', () => {
      manager.setRule('existing-rule', '.test { color: red; }');
      const initialCount = manager.getRulesCount();

      manager.deleteRule('non-existent-rule');

      expect(manager.getRulesCount()).toBe(initialCount);
      expect(manager.hasRule('existing-rule')).toBe(true);
    });

    it('should log debug message when deleting existing rule', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.setRule('test-rule', '.test { color: red; }');
      logDebugSpy.mockClear(); // Clear previous logs

      debugManager.deleteRule('test-rule');

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Deleted CSS rule for test-rule');
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });

    it('should not log when deleting non-existent rule', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.deleteRule('non-existent-rule');

      expect(logDebugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Deleted CSS rule'));
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });
  });

  describe('hasRule()', () => {
    it('should return true for existing rule', () => {
      manager.setRule('test-rule', '.test { color: red; }');
      expect(manager.hasRule('test-rule')).toBe(true);
    });

    it('should return false for non-existent rule', () => {
      expect(manager.hasRule('non-existent-rule')).toBe(false);
    });

    it('should return false after rule is deleted', () => {
      manager.setRule('test-rule', '.test { color: red; }');
      expect(manager.hasRule('test-rule')).toBe(true);

      manager.deleteRule('test-rule');
      expect(manager.hasRule('test-rule')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear all rules and re-render', () => {
      manager.setRule('rule1', '.test1 { color: red; }');
      manager.setRule('rule2', '.test2 { color: blue; }');
      expect(manager.getRulesCount()).toBe(2);

      manager.clear();

      expect(manager.getRulesCount()).toBe(0);
      expect(manager.getCssText()).toBe('');
      expect(manager.ensure().textContent).toBe('');
    });

    it('should not re-render if no rules exist', () => {
      const renderSpy = jest.spyOn(manager as any, 'render');

      manager.clear(); // No rules to clear

      expect(renderSpy).not.toHaveBeenCalled();
      renderSpy.mockRestore();
    });

    it('should log debug message when clearing rules', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.setRule('test-rule', '.test { color: red; }');
      logDebugSpy.mockClear();

      debugManager.clear();

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Cleared all CSS rules from debug-test');
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });

    it('should not log when clearing empty rules', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.clear(); // No rules to clear

      expect(logDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleared all CSS rules')
      );
      logDebugSpy.mockRestore();
      debugManager.destroy();
    });
  });

  describe('destroy()', () => {
    it('should clear all rules and remove style element', () => {
      manager.setRule('test-rule', '.test { color: red; }');
      const styleEl = manager.ensure();
      expect(document.head.contains(styleEl)).toBe(true);

      manager.destroy();

      expect(manager.getRulesCount()).toBe(0);
      expect(document.head.contains(styleEl)).toBe(false);
    });

    it('should handle destruction when element not in document', () => {
      const styleEl = manager.ensure();
      styleEl.remove(); // Manually remove

      expect(() => manager.destroy()).not.toThrow();
    });

    it('should log debug message when destroying', () => {
      const debugManager = new StyleSheetManager('debug-test', true);
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      debugManager.ensure(); // Create element
      logDebugSpy.mockClear();

      debugManager.destroy();

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Destroyed stylesheet: debug-test');
      logDebugSpy.mockRestore();
    });

    it('should be safe to call multiple times', () => {
      manager.setRule('test-rule', '.test { color: red; }');

      expect(() => {
        manager.destroy();
        manager.destroy(); // Second call should be safe
      }).not.toThrow();
    });
  });

  describe('utility methods', () => {
    describe('getRulesCount()', () => {
      it('should return correct count', () => {
        expect(manager.getRulesCount()).toBe(0);

        manager.setRule('rule1', '.test1 { color: red; }');
        expect(manager.getRulesCount()).toBe(1);

        manager.setRule('rule2', '.test2 { color: blue; }');
        expect(manager.getRulesCount()).toBe(2);

        manager.deleteRule('rule1');
        expect(manager.getRulesCount()).toBe(1);
      });
    });

    describe('getCssText()', () => {
      it('should return empty string for no rules', () => {
        expect(manager.getCssText()).toBe('');
      });

      it('should return single rule CSS', () => {
        const css = '.test { color: red; }';
        manager.setRule('test-rule', css);
        expect(manager.getCssText()).toBe(css);
      });

      it('should join multiple rules with double newlines', () => {
        const css1 = '.test1 { color: red; }';
        const css2 = '.test2 { color: blue; }';
        const css3 = '.test3 { color: green; }';

        manager.setRule('rule1', css1);
        manager.setRule('rule2', css2);
        manager.setRule('rule3', css3);

        const expected = `${css1}\n\n${css2}\n\n${css3}`;
        expect(manager.getCssText()).toBe(expected);
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle special characters in rule keys', () => {
      const specialKeys = [
        'rule-with-dash',
        'rule_with_underscore',
        'rule.with.dots',
        'rule:with:colons',
      ];

      specialKeys.forEach(key => {
        manager.setRule(key, `.${key} { color: red; }`);
        expect(manager.hasRule(key)).toBe(true);
      });

      expect(manager.getRulesCount()).toBe(specialKeys.length);
    });

    it('should handle CSS with special characters and escaped quotes', () => {
      const cssWithQuotes = `.test::before { content: "Hello \\"World\\""; }`;
      manager.setRule('quote-rule', cssWithQuotes);

      expect(manager.getCssText()).toBe(cssWithQuotes);
      expect(manager.ensure().textContent).toBe(cssWithQuotes);
    });

    it('should handle CSS with unicode characters', () => {
      const unicodeCss = `.test::before { content: "🎉 Hello 世界"; }`;
      manager.setRule('unicode-rule', unicodeCss);

      expect(manager.getCssText()).toBe(unicodeCss);
    });

    it('should maintain rule order based on insertion order', () => {
      manager.setRule('c-rule', '.c { color: red; }');
      manager.setRule('a-rule', '.a { color: blue; }');
      manager.setRule('b-rule', '.b { color: green; }');

      const cssText = manager.getCssText();
      const lines = cssText.split('\n\n');

      expect(lines[0]).toContain('.c { color: red; }');
      expect(lines[1]).toContain('.a { color: blue; }');
      expect(lines[2]).toContain('.b { color: green; }');
    });

    it('should handle very long CSS rules', () => {
      const longSelector = Array(100).fill('.very-long-selector').join(' ');
      const longCss = `${longSelector} { color: red; }`;

      manager.setRule('long-rule', longCss);

      expect(manager.getCssText()).toBe(longCss);
      expect(manager.ensure().textContent).toBe(longCss);
    });
  });

  describe('DOM integration', () => {
    it('should create style element in head', () => {
      const styleEl = manager.ensure();

      expect(styleEl.parentElement).toBe(document.head);
      expect(document.head.contains(styleEl)).toBe(true);
    });

    it('should update DOM immediately when rules change', () => {
      const css = '.test { color: red; }';
      manager.setRule('test-rule', css);

      const styleEl = document.getElementById(testId) as HTMLStyleElement;
      expect(styleEl.textContent).toBe(css);
    });

    it('should handle document changes gracefully', () => {
      const styleEl = manager.ensure();

      // Simulate document change
      const newHead = document.createElement('head');
      document.documentElement.replaceChild(newHead, document.head);

      // Should create new element in new head
      const newStyleEl = manager.ensure();
      expect(newStyleEl).not.toBe(styleEl);
      expect(newHead.contains(newStyleEl)).toBe(true);

      // Restore original head for other tests
      document.documentElement.replaceChild(document.createElement('head'), newHead);
    });
  });

  describe('memory management', () => {
    it('should clean up references after destroy', () => {
      manager.setRule('test-rule', '.test { color: red; }');
      manager.ensure();

      manager.destroy();

      expect(manager.getRulesCount()).toBe(0);
      expect(manager.getCssText()).toBe('');
    });

    it('should handle multiple managers with same ID', () => {
      const manager2 = new StyleSheetManager(testId);

      manager.setRule('rule1', '.test1 { color: red; }');
      manager2.setRule('rule2', '.test2 { color: blue; }');

      // Both should reference the same DOM element
      expect(manager.ensure()).toBe(manager2.ensure());

      manager2.destroy();
    });

    it('should not leak DOM elements when destroyed', () => {
      const initialStyleCount = document.head.querySelectorAll('style').length;

      manager.ensure();
      expect(document.head.querySelectorAll('style').length).toBe(initialStyleCount + 1);

      manager.destroy();
      expect(document.head.querySelectorAll('style').length).toBe(initialStyleCount);
    });
  });
});
