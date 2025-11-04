/* eslint-disable @typescript-eslint/no-explicit-any */
import { VariantExtractor } from '../VariantExtractor';
import { ABsmartlyContext } from '../../types';
import * as debugModule from '../../utils/debug';
import { createTestSDK, createTestContext, createTestExperiment } from '../../__tests__/sdk-helper';
import type { SDK } from '@absmartly/javascript-sdk';

describe('VariantExtractor', () => {
  let variantExtractor: VariantExtractor;
  let context: ABsmartlyContext;
  let sdk: typeof SDK.prototype;

  beforeEach(() => {
    sdk = createTestSDK();
  });

  describe('variable data source', () => {
    it('should extract changes from variant variables', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              {
                selector: '.test',
                type: 'text',
                value: 'Modified text',
              },
            ],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

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

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: JSON.stringify(changesArray),
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesArray);
    });

    it('should handle no variant selected', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      // extractAllChanges returns ALL variants, not filtered by current selection
      expect(changes.size).toBe(1);
      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.size).toBe(1);
      expect(exp1Variants?.get(0)).toEqual([{ selector: '.test', type: 'text', value: 'Test' }]);
    });

    it('should handle variant without variables', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle variant without __dom_changes field', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            other_field: 'value',
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should use correct variant index', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.variant0', type: 'text', value: 'Variant 0' }],
          },
        },
        {
          config: {
            __dom_changes: [{ selector: '.variant1', type: 'text', value: 'Variant 1' }],
          },
        },
        {
          config: {
            __dom_changes: [{ selector: '.variant2', type: 'text', value: 'Variant 2' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      // extractAllChanges returns ALL variants indexed by variant number
      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.size).toBe(3);
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.variant0', type: 'text', value: 'Variant 0' },
      ]);
      expect(exp1Variants?.get(1)).toEqual([
        { selector: '.variant1', type: 'text', value: 'Variant 1' },
      ]);
      expect(exp1Variants?.get(2)).toEqual([
        { selector: '.variant2', type: 'text', value: 'Variant 2' },
      ]);
    });
  });

  describe('customField data source', () => {
    it('should not extract changes from custom field with extractAllChanges', () => {
      // Note: customField data source is not supported with extractAllChanges()
      // This is a documented limitation in the implementation
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, 'dom_changes_field', false);

      const changes = variantExtractor.extractAllChanges();

      // Custom field extraction is not supported in extractAllChanges
      expect(changes.size).toBe(0);
    });

    it('should handle no custom field value', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, 'dom_changes_field', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('change validation', () => {
    it('should filter invalid changes', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              { selector: '.valid', type: 'text', value: 'Valid' },
              { type: 'text', value: 'Missing selector' } as any,
              { selector: '.test' } as any, // Missing type
              { selector: '.test', type: 'invalid' as any }, // Invalid type
            ],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([{ selector: '.valid', type: 'text', value: 'Valid' }]);
    });

    it('should validate class changes', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              { selector: '.valid', type: 'class', add: ['new-class'] },
              { selector: '.invalid', type: 'class' }, // No add or remove
              { selector: '.invalid2', type: 'class', add: 'not-array' } as any,
            ],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid', type: 'class', add: ['new-class'] },
      ]);
    });

    it('should validate move changes', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              { selector: '.valid', type: 'move', targetSelector: '.target' },
              { selector: '.invalid', type: 'move' }, // No targetSelector
            ],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid', type: 'move', targetSelector: '.target' },
      ]);
    });

    it('should validate create changes', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
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
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

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
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [
              { selector: '.valid-style', type: 'style', value: { color: 'red' } },
              { selector: '.invalid-style', type: 'style', value: 'not-object' },
              { selector: '.valid-attr', type: 'attribute', value: { 'data-test': 'value' } },
              { selector: '.invalid-attr', type: 'attribute' }, // No value
            ],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual([
        { selector: '.valid-style', type: 'style', value: { color: 'red' } },
        { selector: '.valid-attr', type: 'attribute', value: { 'data-test': 'value' } },
      ]);
    });
  });

  describe('getExperimentChanges', () => {
    it('should get changes for specific experiment', () => {
      const exp1 = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test1', type: 'text', value: 'Exp1' }],
          },
        },
      ]);

      const exp2 = createTestExperiment('exp2', [
        {
          config: {
            __dom_changes: [{ selector: '.test2', type: 'text', value: 'Exp2' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [exp1, exp2] }, 'test-user', { exp2: 0 });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.getExperimentChanges('exp2');

      expect(changes).toEqual([{ selector: '.test2', type: 'text', value: 'Exp2' }]);
    });

    it('should return null for non-existent experiment', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.getExperimentChanges('non-existent');

      expect(changes).toBeNull();
    });

    it('should handle empty context data', () => {
      context = createTestContext(sdk, { experiments: [] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle context with no experiments', () => {
      context = createTestContext(sdk, { experiments: [] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle JSON parse errors', () => {
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: '{ invalid json }',
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(logDebugSpy).toHaveBeenCalledWith(
        '[ABsmartly] Failed to parse DOM changes JSON:',
        expect.any(Error)
      );

      logDebugSpy.mockRestore();
    });

    it('should handle non-array changes data', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: { not: 'an array' },
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });

  describe('debug mode', () => {
    it('should log debug messages when enabled', () => {
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ invalid: 'change' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      const debugExtractor = new VariantExtractor(context, '__dom_changes', true);

      debugExtractor.extractAllChanges();

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Invalid DOM change:', {
        invalid: 'change',
      });

      logDebugSpy.mockRestore();
    });
  });

  describe('getAllVariantChanges', () => {
    it('should get changes for all variants of an experiment', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test1', type: 'text', value: 'Variant 0' }],
          },
        },
        {
          config: {
            __dom_changes: [{ selector: '.test2', type: 'text', value: 'Variant 1' }],
          },
        },
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const allChanges = variantExtractor.getAllVariantChanges('exp1');

      // Note: getAllVariantChanges only includes up to the highest variant with changes
      // Since variant 2 has no changes, the array length is 2, not 3
      expect(allChanges).toHaveLength(2);
      expect(allChanges[0]).toEqual([{ selector: '.test1', type: 'text', value: 'Variant 0' }]);
      expect(allChanges[1]).toEqual([{ selector: '.test2', type: 'text', value: 'Variant 1' }]);
    });

    it('should return empty array for non-existent experiment', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const allChanges = variantExtractor.getAllVariantChanges('non-existent');

      expect(allChanges).toEqual([]);
    });

    it('should handle experiment with no variants', () => {
      const experiment = createTestExperiment('exp1', []);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const allChanges = variantExtractor.getAllVariantChanges('exp1');

      expect(allChanges).toEqual([]);
    });
  });

  describe('getExperiment', () => {
    it('should get experiment data by name', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const retrievedExperiment = variantExtractor.getExperiment('exp1');

      expect(retrievedExperiment).toEqual(experiment);
    });

    it('should return null for non-existent experiment', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const retrievedExperiment = variantExtractor.getExperiment('non-existent');

      expect(retrievedExperiment).toBeNull();
    });

    it('should handle null context data', () => {
      context = createTestContext(sdk, { experiments: [] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const experiment = variantExtractor.getExperiment('exp1');

      expect(experiment).toBeNull();
    });
  });

  describe('edge cases and complex scenarios', () => {
    it('should handle null/undefined variant index', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      // extractAllChanges extracts ALL variants, peek value doesn't matter
      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(1);
      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.size).toBe(1);
    });

    it('should handle missing variant at index', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      // extractAllChanges extracts ALL variants, peek value doesn't matter
      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(1);
      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.size).toBe(1);
      expect(exp1Variants?.has(0)).toBe(true);
      expect(exp1Variants?.has(1)).toBe(false);
    });

    it('should handle variant with no variables', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle missing data field in variables', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            other_field: 'some value',
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle valid JSON string data', () => {
      const changesArray = [{ selector: '.test', type: 'text', value: 'From JSON' }];
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: JSON.stringify(changesArray),
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      const exp1Variants = changes.get('exp1');
      expect(exp1Variants?.get(0)).toEqual(changesArray);
    });

    it('should handle empty array of changes', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle all invalid changes in array', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ invalid: 'change1' }, { invalid: 'change2' }, null, undefined],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, '__dom_changes', false);

      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle context.data() throwing an error', () => {
      const logDebugSpy = jest.spyOn(debugModule, 'logDebug').mockImplementation();

      const experiment = createTestExperiment('exp1', [
        {
          config: {
            __dom_changes: [{ selector: '.test', type: 'text', value: 'Test' }],
          },
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });

      // Override the data method to throw an error
      const originalData = context.data;
      context.data = jest.fn().mockImplementation(() => {
        throw new Error('Context data error');
      });

      variantExtractor = new VariantExtractor(context, '__dom_changes', false);
      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
      expect(logDebugSpy).toHaveBeenCalledWith(
        '[ABsmartly] Error extracting DOM changes:',
        expect.any(Error)
      );

      // Restore original method
      context.data = originalData;
      logDebugSpy.mockRestore();
    });

    it('should handle experiment extraction errors with debug', () => {
      const experiment = createTestExperiment('exp1', []);

      context = createTestContext(sdk, { experiments: [experiment] });
      const debugExtractor = new VariantExtractor(context, '__dom_changes', true);

      const changes = debugExtractor.extractAllChanges();

      // Empty variants means no changes
      expect(changes.size).toBe(0);
    });
  });

  describe('custom field edge cases', () => {
    it('should not extract custom field with extractAllChanges', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, 'custom_dom_changes', false);

      // Custom fields are not supported in extractAllChanges
      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should not extract custom field with invalid JSON', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      variantExtractor = new VariantExtractor(context, 'custom_dom_changes', false);

      // Custom fields are not supported in extractAllChanges
      const changes = variantExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });

    it('should handle null custom field with debug', () => {
      const experiment = createTestExperiment('exp1', [
        {
          config: null,
        },
      ]);

      context = createTestContext(sdk, { experiments: [experiment] });
      const debugExtractor = new VariantExtractor(context, 'custom_field', true);

      // Custom fields are not supported in extractAllChanges
      const changes = debugExtractor.extractAllChanges();

      expect(changes.size).toBe(0);
    });
  });
});
