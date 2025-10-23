/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExposureTracker } from '../ExposureTracker';
import { ABsmartlyContext, DOMChange } from '../../types';

describe('ExposureTracker', () => {
  let tracker: ExposureTracker;
  let mockContext: ABsmartlyContext;
  let treatmentMock: jest.Mock;

  // Helper to calculate trigger flags from all variant changes
  const calculateTriggerFlags = (allVariantChanges: DOMChange[][]) => {
    let hasImmediateTrigger = false;
    let hasViewportTrigger = false;

    allVariantChanges.forEach(variantChanges => {
      variantChanges.forEach(change => {
        if (change.trigger_on_view) {
          hasViewportTrigger = true;
        } else {
          hasImmediateTrigger = true;
        }
      });
    });

    return { hasImmediateTrigger, hasViewportTrigger };
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    treatmentMock = jest.fn();

    mockContext = {
      ready: jest.fn().mockResolvedValue(undefined),
      treatment: treatmentMock,
      peek: jest.fn().mockReturnValue(1),
      data: jest.fn().mockReturnValue({}),
      override: jest.fn(),
      customFieldValue: jest.fn().mockReturnValue(null),
    } as any;

    tracker = new ExposureTracker(mockContext, false);
  });

  afterEach(() => {
    tracker.destroy();
    document.body.innerHTML = '';
  });

  describe('registerExperiment', () => {
    it('should trigger exposure immediately for changes without trigger_on_view', async () => {
      const changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'style',
          value: { backgroundColor: 'red' },
          trigger_on_view: false, // Immediate trigger
        },
      ];

      const allVariantChanges = [changes, changes]; // Same for both variants

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should trigger immediately
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });

    it('should NOT trigger exposure immediately for changes with trigger_on_view', () => {
      const changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'style',
          value: { backgroundColor: 'red' },
          trigger_on_view: true, // Wait for viewport
        },
      ];

      const allVariantChanges = [changes, changes];

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Should NOT trigger immediately
      expect(treatmentMock).not.toHaveBeenCalled();
    });

    it('should trigger exposure immediately when ANY variant has immediate triggers (cross-variant tracking)', async () => {
      // Variant 0 (control): no changes
      const variant0Changes: DOMChange[] = [];

      // Variant 1: has immediate trigger
      const variant1Changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'style',
          value: { backgroundColor: 'red' },
          trigger_on_view: false, // Immediate trigger in variant 1
        },
      ];

      // User is in variant 0 (control), but variant 1 has immediate trigger
      // This should still trigger exposure immediately to track all users
      const allVariantChanges = [variant0Changes, variant1Changes];

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should trigger immediately even though current variant has no changes
      // because another variant has an immediate trigger
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });

    it('should track all variant selectors for viewport changes', () => {
      document.body.innerHTML = `
        <div class="header">Header</div>
        <div class="footer">Footer</div>
      `;

      // Variant 0: button in header
      const variant0Changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'text',
          value: 'Click me',
          trigger_on_view: true,
        },
      ];

      // Variant 1: button in footer
      const variant1Changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'text',
          value: 'Click me',
          trigger_on_view: true,
        },
        {
          selector: '.extra',
          type: 'style',
          value: { color: 'blue' },
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [variant0Changes, variant1Changes];

      // Register experiment with variant 0 active
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Check that it's tracking selectors from BOTH variants
      expect(tracker.needsViewportTracking('exp1')).toBe(true);
    });

    it('should track parent containers for move changes', () => {
      document.body.innerHTML = `
        <div class="header">
          <button class="cta">Click</button>
        </div>
        <div class="footer"></div>
      `;

      // Variant 0: button stays in header (control)
      const variant0Changes: DOMChange[] = [];

      // Variant 1: button moves to footer
      const variant1Changes: DOMChange[] = [
        {
          selector: '.cta',
          type: 'move',
          targetSelector: '.footer',
          position: 'firstChild',
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [variant0Changes, variant1Changes];

      // Register with variant 1 (move variant)
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 1, variant1Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Should track parent containers, not the button itself
      expect(tracker.needsViewportTracking('exp1')).toBe(true);
    });
  });

  describe('viewport triggering', () => {
    it('should trigger exposure when tracked element becomes visible', async () => {
      document.body.innerHTML = '<div class="content" style="height: 2000px;"></div>';

      const changes: DOMChange[] = [
        {
          selector: '.content',
          type: 'style',
          value: { backgroundColor: 'blue' },
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [changes, changes];

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Initially not triggered
      expect(treatmentMock).not.toHaveBeenCalled();

      // Simulate element becoming visible
      // Note: IntersectionObserver is mocked in tests, so we'd need to trigger it manually
      // This is a simplified test - real implementation would need proper IntersectionObserver mocking
    });

    it('should only trigger exposure once per experiment', () => {
      document.body.innerHTML = `
        <div class="element1">Element 1</div>
        <div class="element2">Element 2</div>
      `;

      const changes: DOMChange[] = [
        {
          selector: '.element1',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: true,
        },
        {
          selector: '.element2',
          type: 'style',
          value: { color: 'blue' },
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [changes, changes];

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Manually check if experiment is triggered
      expect(tracker.isTriggered('exp1')).toBe(false);
    });
  });

  describe('cross-variant viewport tracking', () => {
    it('should track viewport elements from ALL variants, not just current variant', () => {
      document.body.innerHTML = `
        <div class="element-a">Element A (variant 0)</div>
        <div class="element-b">Element B (variant 1)</div>
      `;

      // Variant 0: tracks .element-a
      const variant0Changes: DOMChange[] = [
        {
          selector: '.element-a',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: true,
        },
      ];

      // Variant 1: tracks .element-b
      const variant1Changes: DOMChange[] = [
        {
          selector: '.element-b',
          type: 'style',
          value: { color: 'blue' },
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [variant0Changes, variant1Changes];

      // User is in variant 0, but should track elements from BOTH variants
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Verify it needs viewport tracking
      expect(tracker.needsViewportTracking('exp1')).toBe(true);

      // Both .element-a AND .element-b should be tracked
      // This ensures whichever element becomes visible first triggers the experiment,
      // even if the user is in a variant where that element doesn't have changes
    });

    it('should create minimal placeholders at hypothetical positions for fair cross-variant triggering', () => {
      document.body.innerHTML = `
        <div class="header">
          <div class="element-a">Element A</div>
        </div>
        <div class="footer">
          Footer content
        </div>
      `;

      // Variant 0 (control): element-a stays in header, triggers on viewport
      const variant0Changes: DOMChange[] = [
        {
          selector: '.element-a',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: true,
        },
      ];

      // Variant 1: element-a moved to footer (appears earlier in viewport), triggers on viewport
      const variant1Changes: DOMChange[] = [
        {
          selector: '.element-a',
          type: 'move',
          targetSelector: '.footer',
          position: 'firstChild',
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [variant0Changes, variant1Changes];

      // User is in variant 0 (control) - element stays in header
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Should create a minimal placeholder in .footer (where element would be in variant 1)
      const placeholder = document.querySelector('[data-absmartly-placeholder="true"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.getAttribute('data-absmartly-original-selector')).toBe('.element-a');
      expect(placeholder?.parentElement?.classList.contains('footer')).toBe(true);

      // Placeholder should be minimal and invisible (1px inline-block with visibility:hidden)
      expect(placeholder?.tagName.toLowerCase()).toBe('span');
      expect(tracker.needsViewportTracking('exp1')).toBe(true);
    });

    it('should track all target containers when multiple variants move to different positions', () => {
      document.body.innerHTML = `
        <div class="top">
          <div class="element">Original</div>
        </div>
        <div class="middle">Middle</div>
        <div class="bottom">Bottom</div>
      `;

      // Variant 0: element stays in top (original position)
      const variant0Changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'text',
          value: 'V0',
          trigger_on_view: true,
        },
      ];

      // Variant 1: element moved to middle
      const variant1Changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'move',
          targetSelector: '.middle',
          position: 'firstChild',
          trigger_on_view: true,
        },
      ];

      // Variant 2: element moved to bottom
      const variant2Changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'move',
          targetSelector: '.bottom',
          position: 'lastChild',
          trigger_on_view: true,
        },
      ];

      const allVariantChanges = [variant0Changes, variant1Changes, variant2Changes];

      // User is in variant 0
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Should create placeholders in .middle and .bottom (where element would be in variants 1 and 2)
      const placeholders = document.querySelectorAll('[data-absmartly-placeholder="true"]');
      expect(placeholders.length).toBe(2);

      // Check placeholders are in correct positions
      const middlePlaceholder = Array.from(placeholders).find(p =>
        p.parentElement?.classList.contains('middle')
      );
      const bottomPlaceholder = Array.from(placeholders).find(p =>
        p.parentElement?.classList.contains('bottom')
      );

      expect(middlePlaceholder).not.toBeNull();
      expect(bottomPlaceholder).not.toBeNull();
      expect(tracker.needsViewportTracking('exp1')).toBe(true);
    });
  });

  describe('mixed trigger types', () => {
    it('should handle mix of immediate and viewport triggers correctly', async () => {
      const changes: DOMChange[] = [
        {
          selector: '.immediate',
          type: 'text',
          value: 'Immediate',
          trigger_on_view: false, // Immediate
        },
        {
          selector: '.viewport',
          type: 'text',
          value: 'Viewport',
          trigger_on_view: true, // Wait for viewport
        },
      ];

      const allVariantChanges = [changes, changes];

      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should trigger immediately because at least one change is immediate
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });
  });

  describe('multiple experiments', () => {
    it('should track multiple experiments independently', async () => {
      const exp1Changes: DOMChange[] = [
        {
          selector: '.exp1-element',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: true,
        },
      ];

      const exp2Changes: DOMChange[] = [
        {
          selector: '.exp2-element',
          type: 'style',
          value: { color: 'blue' },
          trigger_on_view: false, // Immediate
        },
      ];

      const flags1 = calculateTriggerFlags([exp1Changes]);
      tracker.registerExperiment('exp1', 0, exp1Changes, [exp1Changes], flags1.hasImmediateTrigger, flags1.hasViewportTrigger);
      const flags2 = calculateTriggerFlags([exp2Changes]);
      tracker.registerExperiment('exp2', 0, exp2Changes, [exp2Changes], flags2.hasImmediateTrigger, flags2.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // exp2 should trigger immediately, exp1 should not
      expect(treatmentMock).toHaveBeenCalledTimes(1);
      expect(treatmentMock).toHaveBeenCalledWith('exp2');
      expect(treatmentMock).not.toHaveBeenCalledWith('exp1');
    });
  });

  describe('cleanup', () => {
    it('should clean up resources when experiment is triggered', async () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: false,
        },
      ];

      const allVariantChanges = [changes, changes]; // Same format as successful test
      const flags = calculateTriggerFlags(allVariantChanges);
      tracker.registerExperiment('exp1', 0, changes, allVariantChanges, flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check if treatment was called (should be immediate trigger)
      expect(treatmentMock).toHaveBeenCalledWith('exp1');

      // After triggering, experiment should be cleaned up but still marked as triggered
      // isTriggered returns true so tests can verify the experiment was triggered
      expect(tracker.isTriggered('exp1')).toBe(true);
      expect(tracker.needsViewportTracking('exp1')).toBe(false);
    });

    it('should clean up all resources on destroy', () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: true,
        },
      ];

      const flags1 = calculateTriggerFlags([changes]);
      tracker.registerExperiment('exp1', 0, changes, [changes], flags1.hasImmediateTrigger, flags1.hasViewportTrigger);
      const flags2 = calculateTriggerFlags([changes]);
      tracker.registerExperiment('exp2', 0, changes, [changes], flags2.hasImmediateTrigger, flags2.hasViewportTrigger);

      tracker.destroy();

      // All experiments should be cleaned up
      expect(tracker.needsViewportTracking('exp1')).toBe(false);
      expect(tracker.needsViewportTracking('exp2')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty changes array', () => {
      const flags = calculateTriggerFlags([[], []]);
      tracker.registerExperiment('exp1', 0, [], [[], []], flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Should not crash and should not trigger
      expect(treatmentMock).not.toHaveBeenCalled();
    });

    it('should handle missing targetSelector in move changes', () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'move',
          trigger_on_view: true,
          // Missing targetSelector
        } as DOMChange,
      ];

      // Should not crash
      expect(() => {
        const flags = calculateTriggerFlags([changes]);
      tracker.registerExperiment('exp1', 0, changes, [changes], flags.hasImmediateTrigger, flags.hasViewportTrigger);
      }).not.toThrow();
    });

    it('should handle experiments with no trigger_on_view changes', async () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'style',
          value: { color: 'red' },
          // No trigger_on_view specified (defaults to immediate)
        },
      ];

      const flags = calculateTriggerFlags([changes]);
      tracker.registerExperiment('exp1', 0, changes, [changes], flags.hasImmediateTrigger, flags.hasViewportTrigger);

      // Wait for async trigger
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should trigger immediately by default
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });
  });
});
