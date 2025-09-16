import { DOMChangesPlugin } from '../core/DOMChangesPlugin';
import { DOMChange, ContextData, ExperimentData } from '../types';

// Mock ABsmartly Context
const createMockContext = (experiments: ExperimentData[] = []) => ({
  data: jest.fn().mockReturnValue({ experiments } as ContextData),
  peek: jest.fn(),
  treatment: jest.fn(),
  override: jest.fn(),
  customFieldValue: jest.fn(),
});

describe('Integration Tests - End-to-End Plugin Workflows', () => {
  let plugin: DOMChangesPlugin;
  let mockContext: any;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    mockContext = createMockContext();
    plugin = new DOMChangesPlugin({
      context: mockContext,
      autoApply: false, // Manual control for testing
      spa: true,
      debug: false,
    });
  });

  afterEach(() => {
    plugin.destroy();
  });

  describe('Complete A/B Test Workflow', () => {
    it('should handle complete text change A/B test', async () => {
      // Setup DOM
      document.body.innerHTML = `
        <div class="hero">
          <h1 class="title">Original Title</h1>
          <button class="cta">Original Button</button>
        </div>
      `;

      // Setup experiment data
      const experiment: ExperimentData = {
        name: 'hero_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.title',
                  type: 'text',
                  value: 'New Improved Title',
                },
                {
                  selector: '.cta',
                  type: 'text',
                  value: 'Click Now!',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      // Initialize and apply changes
      await plugin.initialize();
      await plugin.applyChanges();

      // Verify changes were applied
      expect(document.querySelector('.title')?.textContent).toBe('New Improved Title');
      expect(document.querySelector('.cta')?.textContent).toBe('Click Now!');

      // Verify elements are marked as modified
      expect(document.querySelector('.title')?.getAttribute('data-absmartly-experiment')).toBe(
        'hero_test'
      );
      expect(document.querySelector('.cta')?.getAttribute('data-absmartly-experiment')).toBe(
        'hero_test'
      );

      // Test removal/rollback
      const removed = plugin.removeChanges('hero_test');
      expect(removed).toHaveLength(2);
      expect(document.querySelector('.title')?.textContent).toBe('Original Title');
      expect(document.querySelector('.cta')?.textContent).toBe('Original Button');
    });

    it('should handle complex style and class changes', async () => {
      document.body.innerHTML = `
        <div class="product-card original-style">
          <img class="product-image" src="original.jpg" alt="Product">
          <h3 class="product-title">Product Name</h3>
          <div class="product-price">$99</div>
        </div>
      `;

      const experiment: ExperimentData = {
        name: 'product_styling',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.product-card',
                  type: 'style',
                  value: {
                    backgroundColor: '#f0f0f0',
                    borderRadius: '8px',
                    padding: '20px',
                  },
                },
                {
                  selector: '.product-card',
                  type: 'class',
                  add: ['featured', 'highlight'],
                  remove: ['original-style'],
                },
                {
                  selector: '.product-price',
                  type: 'style',
                  value: {
                    color: 'red',
                    fontWeight: 'bold',
                    fontSize: '1.2em',
                  },
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      const productCard = document.querySelector('.product-card') as HTMLElement;
      const productPrice = document.querySelector('.product-price') as HTMLElement;

      // Verify style changes
      expect(productCard.style.backgroundColor).toBe('rgb(240, 240, 240)');
      expect(productCard.style.borderRadius).toBe('8px');
      expect(productCard.style.padding).toBe('20px');

      expect(productPrice.style.color).toBe('red');
      expect(productPrice.style.fontWeight).toBe('bold');

      // Verify class changes
      expect(productCard.classList.contains('featured')).toBe(true);
      expect(productCard.classList.contains('highlight')).toBe(true);
      expect(productCard.classList.contains('original-style')).toBe(false);

      // Test restoration
      plugin.removeChanges('product_styling');

      expect(productCard.style.backgroundColor).toBe('');
      expect(productCard.classList.contains('featured')).toBe(false);
      expect(productCard.classList.contains('original-style')).toBe(true);
    });

    it('should handle element movement workflow', async () => {
      document.body.innerHTML = `
        <div class="header">
          <div class="logo">Logo</div>
          <div class="nav">Navigation</div>
          <div class="search-box">Search</div>
        </div>
        <div class="sidebar">
          <div class="sidebar-content">Sidebar</div>
        </div>
      `;

      const experiment: ExperimentData = {
        name: 'layout_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.search-box',
                  type: 'move',
                  targetSelector: '.sidebar',
                  position: 'firstChild',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      const sidebar = document.querySelector('.sidebar');
      const searchBox = document.querySelector('.search-box');
      const header = document.querySelector('.header');

      // Verify element was moved
      expect(sidebar?.contains(searchBox)).toBe(true);
      expect(header?.contains(searchBox)).toBe(false);
      expect(sidebar?.firstElementChild).toBe(searchBox);

      // Test restoration
      plugin.removeChanges('layout_test');

      expect(header?.contains(searchBox)).toBe(true);
      expect(sidebar?.contains(searchBox)).toBe(false);
    });
  });

  describe('Multi-Experiment Scenarios', () => {
    it('should handle multiple experiments simultaneously', async () => {
      document.body.innerHTML = `
        <div class="page">
          <h1 class="main-title">Main Title</h1>
          <p class="description">Description text</p>
          <button class="primary-btn">Button</button>
        </div>
      `;

      const experiments: ExperimentData[] = [
        {
          name: 'title_exp',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.main-title',
                    type: 'text',
                    value: 'Experiment 1 Title',
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'button_exp',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.primary-btn',
                    type: 'style',
                    value: { backgroundColor: 'green' },
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'description_exp',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.description',
                    type: 'html',
                    value: '<strong>Enhanced description</strong>',
                  },
                ],
              },
            },
          ],
        },
      ];

      mockContext.data.mockReturnValue({ experiments });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      // Verify all experiments applied
      expect(document.querySelector('.main-title')?.textContent).toBe('Experiment 1 Title');
      expect((document.querySelector('.primary-btn') as HTMLElement)?.style.backgroundColor).toBe(
        'green'
      );
      expect(document.querySelector('.description')?.innerHTML).toBe(
        '<strong>Enhanced description</strong>'
      );

      // Test selective removal
      plugin.removeChanges('button_exp');

      expect(document.querySelector('.main-title')?.textContent).toBe('Experiment 1 Title'); // Still there
      expect((document.querySelector('.primary-btn') as HTMLElement)?.style.backgroundColor).toBe(
        ''
      ); // Removed
      expect(document.querySelector('.description')?.innerHTML).toBe(
        '<strong>Enhanced description</strong>'
      ); // Still there

      // Test remove all
      plugin.removeAllChanges();

      expect(document.querySelector('.main-title')?.textContent).toBe('Main Title');
      expect(document.querySelector('.description')?.innerHTML).toBe('Description text');
    });

    it('should handle conflicting experiments gracefully', async () => {
      document.body.innerHTML = '<h1 class="title">Original</h1>';

      const experiments: ExperimentData[] = [
        {
          name: 'exp1',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.title',
                    type: 'text',
                    value: 'First Experiment',
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'exp2',
          variants: [
            {
              variables: {
                __dom_changes: [
                  {
                    selector: '.title',
                    type: 'text',
                    value: 'Second Experiment',
                  },
                ],
              },
            },
          ],
        },
      ];

      mockContext.data.mockReturnValue({ experiments });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      // Last experiment should win
      const titleElement = document.querySelector('.title');
      expect(titleElement?.textContent).toBe('Second Experiment');

      // But both experiments should be tracked
      const appliedChanges1 = plugin.getAppliedChanges('exp1');
      const appliedChanges2 = plugin.getAppliedChanges('exp2');

      expect(appliedChanges1).toHaveLength(1);
      expect(appliedChanges2).toHaveLength(1);

      // Remove first experiment - this will restore to original state
      // because both experiments store the same original state
      plugin.removeChanges('exp1');
      expect(titleElement?.textContent).toBe('Original');

      // Remove second experiment (should restore original)
      plugin.removeChanges('exp2');
      expect(titleElement?.textContent).toBe('Original');
    });
  });

  describe('SPA (Single Page Application) Support', () => {
    it('should handle pending changes when elements appear later', async () => {
      // Start with empty DOM
      document.body.innerHTML = '<div class="container"></div>';

      const experiment: ExperimentData = {
        name: 'spa_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.dynamic-element',
                  type: 'text',
                  value: 'Dynamic Content',
                  waitForElement: true,
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      // Element doesn't exist yet, should be added to pending
      expect(plugin.getPendingChanges()).toHaveLength(1);

      // Simulate dynamic content loading
      const container = document.querySelector('.container')!;
      container.innerHTML = '<div class="dynamic-element">Original Text</div>';

      // Trigger mutation observer manually (in real scenario, this happens automatically)
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check if the change was applied
      expect(document.querySelector('.dynamic-element')?.textContent).toBe('Dynamic Content');
      expect(plugin.getPendingChanges()).toHaveLength(0);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large numbers of changes efficiently', async () => {
      // Create many elements
      const elements = Array.from(
        { length: 100 },
        (_, i) => `<div class="item-${i}">Item ${i}</div>`
      ).join('');
      document.body.innerHTML = `<div class="container">${elements}</div>`;

      // Create changes for many elements
      const changes: DOMChange[] = Array.from({ length: 100 }, (_, i) => ({
        selector: `.item-${i}`,
        type: 'text',
        value: `Modified Item ${i}`,
      }));

      const experiment: ExperimentData = {
        name: 'bulk_test',
        variants: [{ variables: { __dom_changes: changes } }],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      const startTime = performance.now();

      await plugin.initialize();
      await plugin.applyChanges();

      const endTime = performance.now();

      // Should complete in reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);

      // Verify all changes were applied
      for (let i = 0; i < 100; i++) {
        expect(document.querySelector(`.item-${i}`)?.textContent).toBe(`Modified Item ${i}`);
      }

      // Test bulk removal
      const removeStartTime = performance.now();
      const removed = plugin.removeChanges('bulk_test');
      const removeEndTime = performance.now();

      expect(removed).toHaveLength(100);
      expect(removeEndTime - removeStartTime).toBeLessThan(50);

      // Verify all changes were reverted
      for (let i = 0; i < 100; i++) {
        expect(document.querySelector(`.item-${i}`)?.textContent).toBe(`Item ${i}`);
      }
    });

    it('should properly clean up resources on destroy', () => {
      document.body.innerHTML = '<div class="test">Test</div>';

      const experiment: ExperimentData = {
        name: 'cleanup_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.test',
                  type: 'text',
                  value: 'Modified',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      // Initialize and apply
      plugin.initialize();
      plugin.applyChanges();

      expect(document.querySelector('.test')?.textContent).toBe('Modified');

      // Destroy should clean up
      plugin.destroy();

      // Verify cleanup
      expect(plugin.getAppliedChanges('cleanup_test')).toHaveLength(0);
      expect(plugin.getPendingChanges()).toHaveLength(0);

      // Element should be restored
      expect(document.querySelector('.test')?.textContent).toBe('Test');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed experiment data gracefully', async () => {
      const badExperiment: any = {
        name: 'bad_experiment',
        variants: [
          {
            variables: {
              __dom_changes: [
                { selector: '.test' }, // Missing type
                { type: 'text' }, // Missing selector
                { selector: '.test', type: 'invalid_type', value: 'test' }, // Invalid type
                null, // Null change
                'invalid', // Non-object change
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [badExperiment] });
      mockContext.peek.mockReturnValue(0);

      // Should not throw
      await expect(plugin.initialize()).resolves.not.toThrow();
      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });

    it('should handle missing context data', async () => {
      mockContext.data.mockReturnValue(null);

      await expect(plugin.initialize()).resolves.not.toThrow();
      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });

    it('should handle DOM mutations during processing', async () => {
      document.body.innerHTML = '<div class="target">Original</div>';

      const experiment: ExperimentData = {
        name: 'mutation_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.target',
                  type: 'text',
                  value: 'Modified',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();

      // Modify DOM during processing
      setTimeout(() => {
        document.querySelector('.target')?.remove();
      }, 5);

      await expect(plugin.applyChanges()).resolves.not.toThrow();
    });
  });

  describe('State Management Integration', () => {
    it('should maintain consistent state across operations', async () => {
      document.body.innerHTML = '<div class="state-test">Original</div>';

      const experiment: ExperimentData = {
        name: 'state_test',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.state-test',
                  type: 'text',
                  value: 'Modified',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment] });
      mockContext.peek.mockReturnValue(0);

      await plugin.initialize();
      await plugin.applyChanges();

      // Check applied changes
      const appliedChanges = plugin.getAppliedChanges('state_test');
      expect(appliedChanges).toHaveLength(1);
      expect(appliedChanges[0].change.value).toBe('Modified');

      // Check original state is preserved
      const originalState = plugin.getOriginalState('.state-test');
      expect(originalState).toBeDefined();
      expect(originalState?.originalState.text).toBe('Original');

      // Apply another experiment to same element
      const experiment2: ExperimentData = {
        name: 'state_test2',
        variants: [
          {
            variables: {
              __dom_changes: [
                {
                  selector: '.state-test',
                  type: 'text',
                  value: 'Double Modified',
                },
              ],
            },
          },
        ],
      };

      mockContext.data.mockReturnValue({ experiments: [experiment, experiment2] });
      await plugin.applyChanges();

      expect(document.querySelector('.state-test')?.textContent).toBe('Double Modified');

      // Original state should still be preserved
      const originalStateAfter = plugin.getOriginalState('.state-test');
      expect(originalStateAfter?.originalState.text).toBe('Original');

      // Remove all experiments
      plugin.removeAllChanges();
      expect(document.querySelector('.state-test')?.textContent).toBe('Original');
    });
  });
});
