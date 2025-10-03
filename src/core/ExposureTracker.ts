/* eslint-disable @typescript-eslint/no-explicit-any */
import { ABsmartlyContext, DOMChange, ExperimentTracking } from '../types';
import { logDebug } from '../utils/debug';

interface TrackedElement {
  element: Element;
  experiments: Set<string>;
  isPlaceholder?: boolean;
}

export class ExposureTracker {
  private experiments = new Map<string, ExperimentTracking>();
  private trackedElements = new Map<Element, TrackedElement>();
  private observer!: IntersectionObserver;
  private mutationObserver: MutationObserver | null = null;
  private debug: boolean;
  private placeholders = new Map<string, HTMLElement>(); // experimentName-selector -> placeholder

  constructor(
    private context: ABsmartlyContext,
    debug = false
  ) {
    this.debug = debug;
    this.setupIntersectionObserver();
  }

  /**
   * Register an experiment with all its variants' changes for comprehensive tracking
   */
  registerExperiment(
    experimentName: string,
    currentVariant: number,
    currentChanges: DOMChange[],
    allVariantsChanges: DOMChange[][]
  ): void {
    if (this.debug) {
      logDebug(`[ABsmartly] Registering experiment ${experimentName} for exposure tracking`);
    }

    // Collect all unique selectors that need viewport tracking across ALL variants
    const viewportSelectors = new Set<string>();
    const moveParentSelectors = new Set<string>(); // Parent containers for move changes

    // First pass: collect all move changes across all variants
    // We need to track ALL possible positions where elements could be
    const moveElements = new Map<string, Set<string>>(); // selector -> Set of target parent positions

    allVariantsChanges.forEach(variantChanges => {
      variantChanges.forEach(change => {
        if (change.trigger_on_view) {
          if (change.type === 'move') {
            if (!moveElements.has(change.selector)) {
              moveElements.set(change.selector, new Set());
            }

            // Add the target parent for this move
            if (change.targetSelector) {
              moveElements.get(change.selector)!.add(change.targetSelector);
            }
          } else {
            // For non-move changes, track the selector directly
            viewportSelectors.add(change.selector);
          }
        }
      });
    });

    // For cross-variant move tracking, we need to track the EXACT POSITION where
    // elements would appear in other variants. We use container-based invisible elements
    // positioned exactly where the element would be, using CSS positioning.
    moveElements.forEach((_targetParents, selector) => {
      // Collect all move changes for this element across ALL variants
      const allMovesForElement: Array<{
        targetSelector: string;
        position: string;
        variantIndex: number;
      }> = [];

      allVariantsChanges.forEach((variantChanges, variantIndex) => {
        const moveChange = variantChanges.find(
          c => c.type === 'move' && c.selector === selector && c.trigger_on_view
        );

        if (moveChange?.targetSelector) {
          allMovesForElement.push({
            targetSelector: moveChange.targetSelector,
            position: moveChange.position || 'lastChild',
            variantIndex,
          });
        }
      });

      // Check if current variant has a move for this element
      const currentMoveIndex = allMovesForElement.findIndex(m => m.variantIndex === currentVariant);

      if (currentMoveIndex >= 0) {
        // Current variant HAS a move - track the element in its moved position
        viewportSelectors.add(selector);

        // For all OTHER variant positions, create container-based placeholders
        allMovesForElement.forEach((move, index) => {
          if (index !== currentMoveIndex) {
            // Create placeholder at the position where element WOULD be in another variant
            this.createContainerPlaceholder(
              experimentName,
              selector,
              move.targetSelector,
              move.position
            );
          }
        });
      } else {
        // Current variant does NOT have a move - element stays in original position
        viewportSelectors.add(selector);

        // For ALL variant moves, create placeholders at those positions
        allMovesForElement.forEach(move => {
          this.createContainerPlaceholder(
            experimentName,
            selector,
            move.targetSelector,
            move.position
          );
        });
      }
    });

    // Determine what triggers are needed by checking ALL variants
    // This ensures experiments are tracked even if the user is in a variant without changes
    let hasImmediateTrigger = false;
    let hasViewportTrigger = false;

    allVariantsChanges.forEach(variantChanges => {
      variantChanges.forEach(change => {
        if (change.trigger_on_view) {
          hasViewportTrigger = true;
        } else {
          hasImmediateTrigger = true;
        }
      });
    });

    // Store experiment tracking info
    const tracking: ExperimentTracking = {
      experimentName,
      variant: currentVariant,
      changes: currentChanges,
      allPossibleSelectors: new Set([...viewportSelectors, ...moveParentSelectors]),
      triggered: false,
      hasImmediateTrigger,
      hasViewportTrigger,
    };

    this.experiments.set(experimentName, tracking);

    if (this.debug) {
      logDebug(
        `[ABsmartly] Experiment ${experimentName} will track selectors:`,
        Array.from(tracking.allPossibleSelectors)
      );
    }

    // Set up viewport observers
    if (hasViewportTrigger) {
      this.observeSelectors(experimentName, tracking.allPossibleSelectors);
    }

    // Trigger immediately if needed
    if (hasImmediateTrigger) {
      // Don't await here to avoid blocking the tracking setup
      this.triggerExposure(experimentName).catch(error => {
        logDebug(`[ABsmartly] Failed to trigger exposure for ${experimentName}:`, error);
      });
    }
  }

  /**
   * Create a container-based placeholder at the hypothetical position
   * Uses inline-block with minimal dimensions to be observable but not affect layout
   */
  private createContainerPlaceholder(
    experimentName: string,
    originalSelector: string,
    targetSelector: string,
    position: string = 'lastChild'
  ): void {
    const targetElement = document.querySelector(targetSelector);
    if (!targetElement) return;

    const placeholderKey = `${experimentName}-${originalSelector}-${targetSelector}-${position}`;

    // Check if placeholder already exists
    if (this.placeholders.has(placeholderKey)) {
      return;
    }

    // Create minimal placeholder using inline styles
    // This will be observable by IntersectionObserver but won't affect layout
    const placeholder = document.createElement('span');
    placeholder.style.cssText = `
      display: inline-block;
      width: 1px;
      height: 1px;
      position: relative;
      left: -1px;
      visibility: hidden;
      pointer-events: none;
      font-size: 0;
      line-height: 0;
      overflow: hidden;
    `;
    placeholder.setAttribute('data-absmartly-placeholder', 'true');
    placeholder.setAttribute('data-absmartly-original-selector', originalSelector);
    placeholder.setAttribute('data-absmartly-experiment', experimentName);
    placeholder.setAttribute('aria-hidden', 'true');

    // Insert placeholder at the hypothetical position
    switch (position) {
      case 'firstChild':
        targetElement.insertBefore(placeholder, targetElement.firstChild);
        break;
      case 'lastChild':
        targetElement.appendChild(placeholder);
        break;
      case 'before':
        targetElement.parentElement?.insertBefore(placeholder, targetElement);
        break;
      case 'after':
        targetElement.parentElement?.insertBefore(placeholder, targetElement.nextSibling);
        break;
      default:
        targetElement.appendChild(placeholder);
    }

    this.placeholders.set(placeholderKey, placeholder);

    // Track the placeholder for viewport visibility
    this.trackElement(placeholder, experimentName);

    if (this.debug) {
      logDebug(
        `[ABsmartly] Created placeholder for ${originalSelector} at ${targetSelector} (${position})`
      );
    }
  }

  /**
   * Get the original parent selector for move changes
   * This should be called BEFORE the move is applied
   */
  getOriginalParentForMove(selector: string): string | null {
    const element = document.querySelector(selector);
    if (!element?.parentElement) return null;

    return this.getStableParentSelector(element.parentElement);
  }

  /**
   * Get a stable selector for a parent element
   */
  private getStableParentSelector(element: Element): string | null {
    // Try to get a good selector for the parent
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c && !c.startsWith('absmartly'));
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }

    // Fallback to tag name with positional info
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
    }

    return null;
  }

  /**
   * Set up observers for the given selectors
   */
  private observeSelectors(experimentName: string, selectors: Set<string>): void {
    selectors.forEach(selector => {
      // Try to find existing elements
      const elements = document.querySelectorAll(selector);

      if (elements.length > 0) {
        elements.forEach(element => {
          this.trackElement(element, experimentName);
        });
      } else {
        // Element doesn't exist yet, set up mutation observer to watch for it
        this.watchForSelector(selector, experimentName);
      }
    });
  }

  /**
   * Track an element for viewport visibility
   */
  private trackElement(element: Element, experimentName: string): void {
    if (!this.trackedElements.has(element)) {
      this.trackedElements.set(element, {
        element,
        experiments: new Set([experimentName]),
        isPlaceholder: element.hasAttribute('data-absmartly-placeholder'),
      });
      this.observer.observe(element);
    } else {
      this.trackedElements.get(element)!.experiments.add(experimentName);
    }
  }

  /**
   * Watch for elements matching a selector to appear
   */
  private watchForSelector(_selector: string, _experimentName: string): void {
    if (!this.mutationObserver) {
      this.setupMutationObserver();
    }

    // Store pending selector (implementation would need a Map for this)
    // For now, we'll rely on checking in mutation callback
  }

  /**
   * Set up the IntersectionObserver for viewport tracking
   */
  private setupIntersectionObserver(): void {
    this.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.handleElementVisible(entry.target);
          }
        });
      },
      {
        threshold: 0.01, // Trigger when even 1% is visible
        rootMargin: '0px',
      }
    );
  }

  /**
   * Set up MutationObserver for dynamic elements
   */
  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) {
            // Check if this element or its children match any tracked selectors
            this.checkNewElement(node);
          }
        });
      });
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Check if a newly added element needs tracking
   */
  private checkNewElement(element: Element): void {
    this.experiments.forEach((tracking, experimentName) => {
      tracking.allPossibleSelectors.forEach(selector => {
        if (element.matches(selector)) {
          this.trackElement(element, experimentName);
        }

        // Also check children
        element.querySelectorAll(selector).forEach(child => {
          this.trackElement(child, experimentName);
        });
      });
    });
  }

  /**
   * Handle when an element becomes visible
   */
  private handleElementVisible(element: Element): void {
    const tracked = this.trackedElements.get(element);
    if (!tracked) return;

    tracked.experiments.forEach(experimentName => {
      const experiment = this.experiments.get(experimentName);

      if (experiment && !experiment.triggered) {
        // Don't await here to avoid blocking the visibility handler
        this.triggerExposure(experimentName).catch(error => {
          logDebug(`[ABsmartly] Failed to trigger exposure for ${experimentName}:`, error);
        });

        if (this.debug) {
          const selector = tracked.isPlaceholder
            ? element.getAttribute('data-absmartly-original-selector')
            : this.getElementSelector(element);
          logDebug(`[ABsmartly] Triggering exposure for ${experimentName} via ${selector}`);
        }
      }
    });
  }

  /**
   * Trigger exposure for an experiment
   */
  private async triggerExposure(experimentName: string): Promise<void> {
    const experiment = this.experiments.get(experimentName);
    if (!experiment || experiment.triggered) return;

    // Ensure context is ready before calling treatment
    await (this.context as any).ready();
    // Call treatment to trigger exposure
    this.context.treatment(experimentName);
    experiment.triggered = true;

    if (this.debug) {
      logDebug(`[ABsmartly] Exposure triggered for experiment: ${experimentName}`);
    }

    // Clean up tracking for this experiment
    this.cleanupExperiment(experimentName);
  }

  /**
   * Clean up tracking for an experiment that has been triggered
   */
  private cleanupExperiment(experimentName: string): void {
    // Remove from tracked elements
    this.trackedElements.forEach((tracked, element) => {
      tracked.experiments.delete(experimentName);

      if (tracked.experiments.size === 0) {
        this.observer.unobserve(element);
        this.trackedElements.delete(element);
      }
    });

    // Remove placeholders
    this.placeholders.forEach((placeholder, key) => {
      if (key.startsWith(`${experimentName}-`)) {
        placeholder.remove();
        this.placeholders.delete(key);
      }
    });

    // Remove experiment
    this.experiments.delete(experimentName);

    // Clean up mutation observer if no experiments left
    if (this.experiments.size === 0 && this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * Get a selector string for an element (for debugging)
   */
  private getElementSelector(element: Element): string {
    if (element.id) return `#${element.id}`;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c && !c.startsWith('absmartly'));
      if (classes.length > 0) return `.${classes.join('.')}`;
    }
    return element.tagName.toLowerCase();
  }

  /**
   * Check if an experiment needs viewport tracking
   */
  needsViewportTracking(experimentName: string): boolean {
    const experiment = this.experiments.get(experimentName);
    return experiment?.hasViewportTrigger ?? false;
  }

  /**
   * Check if an experiment has been triggered
   */
  isTriggered(experimentName: string): boolean {
    const experiment = this.experiments.get(experimentName);
    return experiment?.triggered ?? false;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Disconnect observers
    this.observer.disconnect();
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    // Remove all placeholders
    this.placeholders.forEach(placeholder => placeholder.remove());

    // Clear all tracking
    this.experiments.clear();
    this.trackedElements.clear();
    this.placeholders.clear();

    if (this.debug) {
      logDebug('[ABsmartly] ExposureTracker destroyed');
    }
  }
}
