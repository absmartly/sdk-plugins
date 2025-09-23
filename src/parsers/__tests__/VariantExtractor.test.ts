/* eslint-disable @typescript-eslint/no-explicit-any */
import { VariantExtractor } from '../VariantExtractor';
import { ABsmartlyContext, ContextData } from '../../types';

describe('VariantExtractor', () => {
  let variantExtractor: VariantExtractor;
  let mockContext: ABsmartlyContext;

  beforeEach(() => {
    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      data: jest.fn(),
      peek: jest.fn(),
      treatment: jest.fn(),
      override: jest.fn(),
      customFieldValue: jest.fn(),
    };
  });

  describe('variable data source', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should extract changes from variant variables', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.test',
                      type: 'text',
                      value: 'Modified text',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(1);
      expect(changes.has('exp1')).toBe(true);

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants).toBeDefined();
      expect(exp1Variants?.get(0)).toEqual([
        {
          selector: '.test',
          type: 'text',
          value: 'Modified text',
        },
      ]);
    });

    it('should handle JSON string changes data', () => {
      const changesArray = [
        {
          selector: '.test',
          type: 'text',
          value: 'Modified',
        },
      ];

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: JSON.stringify(changesArray),
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesArray);
    });

    it('should handle no variant selected', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(undefined);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle variant without variables', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [{}],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle variant without __dom_changes field', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  other_field: 'value',
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should use correct variant index', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.variant0', type: 'text', value: 'Variant 0' }],
                },
              },
              {
                variables: {
                  __dom_changes: [{ selector: '.variant1', type: 'text', value: 'Variant 1' }],
                },
              },
              {
                variables: {
                  __dom_changes: [{ selector: '.variant2', type: 'text', value: 'Variant 2' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(1);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.variant1', type: 'text', value: 'Variant 1' },
      ]);
    });
  });

  describe('customField data source', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(
        mockContext,
        'customField',
        'dom_changes_field',
        false
      );
    });

    it('should extract changes from custom field', () => {
      const changesData = [
        {
          selector: '.test',
          type: 'html',
          value: '<span>Custom field HTML</span>',
        },
      ];

      const contextData: ContextData = {
        experiments: [{ name: 'exp1' }],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.customFieldValue as jest.Mock).mockReturnValue(changesData);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesData);
      expect(mockContext.customFieldValue).toHaveBeenCalledWith('exp1', 'dom_changes_field');
    });

    it('should handle no custom field value', () => {
      const contextData: ContextData = {
        experiments: [{ name: 'exp1' }],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.customFieldValue as jest.Mock).mockReturnValue(null);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('change validation', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should filter invalid changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    { selector: '.valid', type: 'text', value: 'Valid' },
                    { type: 'text', value: 'Missing selector' } as any,
                    { selector: '.test' } as any, // Missing type
                    { selector: '.test', type: 'invalid' as any }, // Invalid type
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([{ selector: '.valid', type: 'text', value: 'Valid' }]);
    });

    it('should validate class changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    { selector: '.valid', type: 'class', add: ['new-class'] },
                    { selector: '.invalid', type: 'class' }, // No add or remove
                    { selector: '.invalid2', type: 'class', add: 'not-array' } as any,
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid', type: 'class', add: ['new-class'] },
      ]);
    });

    it('should validate move changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    { selector: '.valid', type: 'move', targetSelector: '.target' },
                    { selector: '.invalid', type: 'move' }, // No targetSelector
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid', type: 'move', targetSelector: '.target' },
      ]);
    });

    it('should validate create changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    {
                      selector: '.valid',
                      type: 'create',
                      element: '<div>New</div>',
                      targetSelector: '.target',
                    },
                    { selector: '.invalid1', type: 'create', element: '<div>New</div>' }, // No targetSelector
                    { selector: '.invalid2', type: 'create', targetSelector: '.target' }, // No element
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        {
          selector: '.valid',
          type: 'create',
          element: '<div>New</div>',
          targetSelector: '.target',
        },
      ]);
    });

    it('should validate style and attribute changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [
                    { selector: '.valid-style', type: 'style', value: { color: 'red' } },
                    { selector: '.invalid-style', type: 'style', value: 'not-object' },
                    { selector: '.valid-attr', type: 'attribute', value: { 'data-test': 'value' } },
                    { selector: '.invalid-attr', type: 'attribute' }, // No value
                  ],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid-style', type: 'style', value: { color: 'red' } },
        { selector: '.valid-attr', type: 'attribute', value: { 'data-test': 'value' } },
      ]);
    });
  });

  describe('getExperimentChanges', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should get changes for specific experiment', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
                },
              },
            ],
          },
          {
            name: 'exp2',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.getExperimentChanges('exp2');

      expect(changes).toEqual([{ selector: '.test2', type: 'text', value: 'Exp2' }]);
    });

    it('should return null for non-existent experiment', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const changes = variantExtractor.getExperimentChanges('non-existent');

      expect(changes).toBeNull();
    });

    it('should handle empty context data', () => {
      (mockContext.data as jest.Mock).mockReturnValue(null);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle context with no experiments', () => {
      (mockContext.data as jest.Mock).mockReturnValue({});

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should handle JSON parse errors', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: '{ invalid json }',
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ABsmartly] Failed to parse DOM changes JSON:'),
        expect.any(Error)
      );
    });

    it('should handle non-array changes data', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: { not: 'an array' },
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('debug mode', () => {
    it('should log debug messages when enabled', () => {
      const warnSpy = jest.spyOn(console, 'warn');

      const debugExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', true);

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ invalid: 'change' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      debugExtractor.extractAllChanges();

      expect(warnSpy).toHaveBeenCalledWith('[ABsmartly] Invalid DOM change:', {
        invalid: 'change',
      });
    });
  });

  describe('getAllVariantChanges', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should get changes for all variants of an experiment', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test1', type: 'text', value: 'Variant 0' }],
                },
              },
              {
                variables: {
                  __dom_changes: [{ selector: '.test2', type: 'text', value: 'Variant 1' }],
                },
              },
              {
                variables: {
                  // No changes for variant 2
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const allChanges = variantExtractor.getAllVariantChanges('exp1');

      expect(allChanges).toHaveLength(3);
      expect(allChanges[0]).toEqual([{ selector: '.test1', type: 'text', value: 'Variant 0' }]);
      expect(allChanges[1]).toEqual([{ selector: '.test2', type: 'text', value: 'Variant 1' }]);
      expect(allChanges[2]).toEqual([]);
    });

    it('should return empty array for non-existent experiment', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const allChanges = variantExtractor.getAllVariantChanges('non-existent');

      expect(allChanges).toEqual([]);
    });

    it('should handle experiment with no variants', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            // No variants property
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const allChanges = variantExtractor.getAllVariantChanges('exp1');

      expect(allChanges).toEqual([]);
    });
  });

  describe('getExperiment', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should get experiment data by name', () => {
      const experimentData = {
        name: 'exp1',
        variants: [
          {
            variables: {
              __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
            },
          },
        ],
      };

      const contextData: ContextData = {
        experiments: [experimentData],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const experiment = variantExtractor.getExperiment('exp1');

      expect(experiment).toEqual(experimentData);
    });

    it('should return null for non-existent experiment', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);

      const experiment = variantExtractor.getExperiment('non-existent');

      expect(experiment).toBeNull();
    });

    it('should handle null context data', () => {
      (mockContext.data as jest.Mock).mockReturnValue(null);

      const experiment = variantExtractor.getExperiment('exp1');

      expect(experiment).toBeNull();
    });
  });

  describe('edge cases and complex scenarios', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', false);
    });

    it('should handle null/undefined variant index', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(null);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle missing variant at index', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              // Variant 0 exists
              {
                variables: {
                  __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(1); // Request variant 1 which doesn't exist

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle variant with no variables', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                // No variables property
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle missing data field in variables', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  other_field: 'some value',
                  // No __dom_changes field
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle valid JSON string data', () => {
      const changesArray = [{ selector: '.test', type: 'text', value: 'From JSON' }];
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: JSON.stringify(changesArray),
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesArray);
    });

    it('should handle empty array of changes', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [], // Empty array
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle all invalid changes in array', () => {
      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [
              {
                variables: {
                  __dom_changes: [{ invalid: 'change1' }, { invalid: 'change2' }, null, undefined],
                },
              },
            ],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockReturnValue(0);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle context.data() throwing an error', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      (mockContext.data as jest.Mock).mockImplementation(() => {
        throw new Error('Context data error');
      });

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        '[ABsmartly] Error extracting DOM changes:',
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });

    it('should handle experiment extraction errors with debug', () => {
      const debugExtractor = new VariantExtractor(mockContext, 'variable', '__dom_changes', true);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const contextData: ContextData = {
        experiments: [
          {
            name: 'exp1',
            variants: [],
          },
        ],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.peek as jest.Mock).mockImplementation(() => {
        throw new Error('Peek error');
      });

      const changes = debugExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        '[ABsmartly] Error extracting changes for exp1:',
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });
  });

  describe('custom field edge cases', () => {
    beforeEach(() => {
      variantExtractor = new VariantExtractor(
        mockContext,
        'customField',
        'custom_dom_changes',
        false
      );
    });

    it('should handle custom field with string JSON data', () => {
      const changesArray = [{ selector: '.custom', type: 'text', value: 'Custom' }];
      const contextData: ContextData = {
        experiments: [{ name: 'exp1' }],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.customFieldValue as jest.Mock).mockReturnValue(JSON.stringify(changesArray));

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesArray);
    });

    it('should handle custom field with invalid JSON', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const contextData: ContextData = {
        experiments: [{ name: 'exp1' }],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.customFieldValue as jest.Mock).mockReturnValue('{ invalid json }');

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        '[ABsmartly] Failed to parse DOM changes JSON:',
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });

    it('should handle null custom field with debug', () => {
      const debugExtractor = new VariantExtractor(mockContext, 'customField', 'custom_field', true);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const contextData: ContextData = {
        experiments: [{ name: 'exp1' }],
      };

      (mockContext.data as jest.Mock).mockReturnValue(contextData);
      (mockContext.customFieldValue as jest.Mock).mockReturnValue(null);

      const changes = debugExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        '[ABsmartly] No custom field custom_field found for exp1'
      );

      logSpy.mockRestore();
    });
  });
});
