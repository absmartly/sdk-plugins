import { VariantExtractor } from '../VariantExtractor';
import { ABsmartlyContext, ContextData } from '../../types';

describe('VariantExtractor', () => {
  let variantExtractor: VariantExtractor;
  let mockContext: ABsmartlyContext;

  beforeEach(() => {
    mockContext = {
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
      expect(changes.get('exp1')).toEqual([
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

      expect(changes.get('exp1')).toEqual(changesArray);
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

      expect(changes.get('exp1')).toEqual([
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

      expect(changes.get('exp1')).toEqual(changesData);
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

      expect(changes.get('exp1')).toEqual([{ selector: '.valid', type: 'text', value: 'Valid' }]);
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

      expect(changes.get('exp1')).toEqual([
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

      expect(changes.get('exp1')).toEqual([
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

      expect(changes.get('exp1')).toEqual([
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

      expect(changes.get('exp1')).toEqual([
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
});
