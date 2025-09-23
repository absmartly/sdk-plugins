/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPlugin } from '../DOMChangesPlugin';
import { DOMChange } from '../../types';

describe('DOMChangesPlugin - Style Rules', () => {
  let plugin: DOMChangesPlugin;
  const mockContext = {
    experimentName: jest.fn().mockReturnValue('test-experiment'),
    treatment: jest.fn().mockReturnValue(1),
    ready: jest.fn().mockResolvedValue(undefined),
    data: jest.fn().mockReturnValue({}),
    variableValue: jest.fn().mockReturnValue(null),
    peekVariableValue: jest.fn().mockReturnValue(null),
    peek: jest.fn().mockReturnValue(1),
    override: jest.fn(),
    customFieldValue: jest.fn().mockReturnValue(null),
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    plugin = new DOMChangesPlugin({
      context: mockContext,
      autoApply: false,
      debug: false,
    });
  });

  afterEach(() => {
    plugin.destroy();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('styleRules type', () => {
    it('should apply style rules with hover states', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<button class="cta">Click me</button>';

      const change: DOMChange = {
        selector: '.cta',
        type: 'styleRules',
        states: {
          normal: {
            backgroundColor: '#e02424',
            color: 'white',
            padding: '10px 20px',
          },
          hover: {
            backgroundColor: '#c81e1e',
            transform: 'translateX(2px)',
          },
          active: {
            backgroundColor: '#991818',
          },
        },
        important: true,
      };

      const success = plugin.applyChange(change, 'button-test');
      expect(success).toBe(true);

      // Check that style element was created
      const styleEl = document.getElementById('absmartly-styles-button-test');
      expect(styleEl).toBeTruthy();
      expect(styleEl?.tagName).toBe('STYLE');

      // Check CSS content
      const css = styleEl?.textContent || '';
      expect(css).toContain('.cta {');
      expect(css).toContain('background-color: #e02424 !important');
      expect(css).toContain('.cta:hover {');
      expect(css).toContain('background-color: #c81e1e !important');
      expect(css).toContain('.cta:active {');
      expect(css).toContain('background-color: #991818 !important');

      // Check element attributes
      const button = document.querySelector('.cta');
      expect(button?.getAttribute('data-absmartly-modified')).toBe('true');
      expect(button?.getAttribute('data-absmartly-experiment')).toBe('button-test');
      expect(button?.getAttribute('data-absmartly-style-rules')).toBe('true');
    });

    it('should handle multiple style rules for same experiment', async () => {
      await plugin.initialize();
      document.body.innerHTML = `
        <button class="primary">Primary</button>
        <button class="secondary">Secondary</button>
      `;

      // Apply first rule
      plugin.applyChange(
        {
          selector: '.primary',
          type: 'styleRules',
          states: {
            normal: { backgroundColor: 'blue' },
            hover: { backgroundColor: 'darkblue' },
          },
        },
        'multi-test'
      );

      // Apply second rule
      plugin.applyChange(
        {
          selector: '.secondary',
          type: 'styleRules',
          states: {
            normal: { backgroundColor: 'green' },
            hover: { backgroundColor: 'darkgreen' },
          },
        },
        'multi-test'
      );

      const styleEl = document.getElementById('absmartly-styles-multi-test');
      const css = styleEl?.textContent || '';

      // Both rules should be in the same stylesheet
      expect(css).toContain('.primary {');
      expect(css).toContain('.secondary {');
      expect(css).toContain('background-color: blue !important');
      expect(css).toContain('background-color: green !important');
    });

    it('should remove style rules when experiment is removed', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="box">Box</div>';

      plugin.applyChange(
        {
          selector: '.box',
          type: 'styleRules',
          states: {
            normal: { border: '2px solid red' },
          },
        },
        'removable-test'
      );

      // Verify style exists
      let styleEl = document.getElementById('absmartly-styles-removable-test');
      expect(styleEl).toBeTruthy();

      // Remove changes
      plugin.removeChanges('removable-test');

      // Style element should be removed
      styleEl = document.getElementById('absmartly-styles-removable-test');
      expect(styleEl).toBeFalsy();

      // Attributes should be cleaned up
      const box = document.querySelector('.box');
      expect(box?.getAttribute('data-absmartly-modified')).toBeFalsy();
      expect(box?.getAttribute('data-absmartly-style-rules')).toBeFalsy();
    });

    it('should support important flag control', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<span class="text">Text</span>';

      // With important (default)
      plugin.applyChange(
        {
          selector: '.text',
          type: 'styleRules',
          states: {
            normal: { color: 'red' },
          },
        },
        'important-test'
      );

      let styleEl = document.getElementById('absmartly-styles-important-test');
      let css = styleEl?.textContent || '';
      expect(css).toContain('color: red !important');

      plugin.removeChanges('important-test');

      // Without important
      plugin.applyChange(
        {
          selector: '.text',
          type: 'styleRules',
          states: {
            normal: { color: 'blue' },
          },
          important: false,
        },
        'no-important-test'
      );

      styleEl = document.getElementById('absmartly-styles-no-important-test');
      css = styleEl?.textContent || '';
      expect(css).toContain('color: blue;');
      expect(css).not.toContain('color: blue !important');
    });
  });

  describe('Persistence with MutationObserver', () => {
    it('should watch and restore inline style changes', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="persist">Content</div>';

      // Apply inline style change
      const change: DOMChange = {
        selector: '.persist',
        type: 'style',
        value: {
          backgroundColor: 'yellow',
          padding: '20px',
        },
      };

      plugin.applyChange(change, 'persist-test');

      const element = document.querySelector('.persist') as HTMLElement;
      expect(element.style.backgroundColor).toBe('yellow');

      // Simulate React overwriting the style
      element.style.backgroundColor = 'blue';

      // Wait for MutationObserver to kick in
      await new Promise(resolve => setTimeout(resolve, 10));

      // Style should be restored
      expect(element.style.backgroundColor).toBe('yellow');
      expect(element.style.padding).toBe('20px');
    });

    it('should stop watching when change is removed', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="watch">Content</div>';

      plugin.applyChange(
        {
          selector: '.watch',
          type: 'style',
          value: { color: 'red' },
        },
        'watch-test'
      );

      const element = document.querySelector('.watch') as HTMLElement;
      expect(element.style.color).toBe('red');

      // Remove the change
      plugin.removeChanges('watch-test');

      // Change the style
      element.style.color = 'blue';

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Style should NOT be restored since we removed the change
      expect(element.style.color).toBe('blue');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle button with hover animation preservation', async () => {
      await plugin.initialize();
      document.body.innerHTML = `
        <button class="animated-btn">
          <span>Click</span>
          <svg class="icon">→</svg>
        </button>
      `;

      // Apply comprehensive style rules
      const change: DOMChange = {
        selector: '.animated-btn',
        type: 'styleRules',
        states: {
          normal: {
            backgroundColor: '#e02424',
            color: 'white',
            transition: 'all 0.2s ease',
            position: 'relative',
          },
          hover: {
            backgroundColor: '#c81e1e',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
          },
        },
      };

      plugin.applyChange(change, 'animated-button');

      // Also handle the icon animation
      plugin.applyChange(
        {
          selector: '.animated-btn:hover .icon',
          type: 'styleRules',
          states: {
            normal: {
              transform: 'translateX(5px)',
              transition: 'transform 0.2s ease',
            },
          },
        },
        'animated-button'
      );

      const styleEl = document.getElementById('absmartly-styles-animated-button');
      const css = styleEl?.textContent || '';

      // Check all rules are present
      expect(css).toContain('.animated-btn {');
      expect(css).toContain('transition: all 0.2s ease !important');
      expect(css).toContain('.animated-btn:hover {');
      expect(css).toContain('transform: translateY(-2px) !important');
      expect(css).toContain('.animated-btn:hover .icon {');
      expect(css).toContain('transform: translateX(5px) !important');
    });

    it('should handle mixed change types for same element', async () => {
      await plugin.initialize();
      document.body.innerHTML = '<div class="mixed">Original</div>';

      // Apply text change
      plugin.applyChange(
        {
          selector: '.mixed',
          type: 'text',
          value: 'Updated',
        },
        'mixed-test'
      );

      // Apply style rules for hover
      plugin.applyChange(
        {
          selector: '.mixed',
          type: 'styleRules',
          states: {
            normal: { cursor: 'pointer' },
            hover: { textDecoration: 'underline' },
          },
        },
        'mixed-test'
      );

      // Apply inline style
      plugin.applyChange(
        {
          selector: '.mixed',
          type: 'style',
          value: { fontWeight: 'bold' },
        },
        'mixed-test'
      );

      const element = document.querySelector('.mixed') as HTMLElement;
      expect(element.textContent).toBe('Updated');
      expect(element.style.fontWeight).toBe('bold');

      const styleEl = document.getElementById('absmartly-styles-mixed-test');
      expect(styleEl?.textContent).toContain('cursor: pointer !important');
    });
  });
});
