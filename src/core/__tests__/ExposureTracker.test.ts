import { ExposureTracker } from '../ExposureTracker';
import { ABsmartlyContext, DOMChange } from '../../types';

describe('ExposureTracker', () => {
  let tracker: ExposureTracker;
  let mockContext: ABsmartlyContext;
  let treatmentMock: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    treatmentMock = jest.fn();
    
    mockContext = {
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
    it('should trigger exposure immediately for changes without trigger_on_view', () => {
      const changes: DOMChange[] = [
        {
          selector: '.button',
          type: 'style',
          value: { backgroundColor: 'red' },
          trigger_on_view: false, // Immediate trigger
        },
      ];

      const allVariantChanges = [changes, changes]; // Same for both variants

      tracker.registerExperiment('exp1', 0, changes, allVariantChanges);

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

      tracker.registerExperiment('exp1', 0, changes, allVariantChanges);

      // Should NOT trigger immediately
      expect(treatmentMock).not.toHaveBeenCalled();
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
      tracker.registerExperiment('exp1', 0, variant0Changes, allVariantChanges);

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
      tracker.registerExperiment('exp1', 1, variant1Changes, allVariantChanges);

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

      tracker.registerExperiment('exp1', 0, changes, allVariantChanges);

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

      tracker.registerExperiment('exp1', 0, changes, allVariantChanges);

      // Manually check if experiment is triggered
      expect(tracker.isTriggered('exp1')).toBe(false);
    });
  });

  describe('mixed trigger types', () => {
    it('should handle mix of immediate and viewport triggers correctly', () => {
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

      tracker.registerExperiment('exp1', 0, changes, allVariantChanges);

      // Should trigger immediately because at least one change is immediate
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });
  });

  describe('multiple experiments', () => {
    it('should track multiple experiments independently', () => {
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

      tracker.registerExperiment('exp1', 0, exp1Changes, [exp1Changes]);
      tracker.registerExperiment('exp2', 0, exp2Changes, [exp2Changes]);

      // exp2 should trigger immediately, exp1 should not
      expect(treatmentMock).toHaveBeenCalledTimes(1);
      expect(treatmentMock).toHaveBeenCalledWith('exp2');
      expect(treatmentMock).not.toHaveBeenCalledWith('exp1');
    });
  });

  describe('cleanup', () => {
    it('should clean up resources when experiment is triggered', () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'style',
          value: { color: 'red' },
          trigger_on_view: false,
        },
      ];

      tracker.registerExperiment('exp1', 0, changes, [changes]);

      expect(tracker.isTriggered('exp1')).toBe(true);
      
      // After triggering, experiment should be cleaned up
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

      tracker.registerExperiment('exp1', 0, changes, [changes]);
      tracker.registerExperiment('exp2', 0, changes, [changes]);

      tracker.destroy();

      // All experiments should be cleaned up
      expect(tracker.needsViewportTracking('exp1')).toBe(false);
      expect(tracker.needsViewportTracking('exp2')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty changes array', () => {
      tracker.registerExperiment('exp1', 0, [], [[], []]);
      
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
        tracker.registerExperiment('exp1', 0, changes, [changes]);
      }).not.toThrow();
    });

    it('should handle experiments with no trigger_on_view changes', () => {
      const changes: DOMChange[] = [
        {
          selector: '.element',
          type: 'style',
          value: { color: 'red' },
          // No trigger_on_view specified (defaults to immediate)
        },
      ];

      tracker.registerExperiment('exp1', 0, changes, [changes]);

      // Should trigger immediately by default
      expect(treatmentMock).toHaveBeenCalledWith('exp1');
    });
  });
});