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
   *
   * @param hasImmediateTrigger - Whether ANY variant matching URL filter has immediate trigger
   * @param hasViewportTrigger - Whether ANY variant matching URL filter has viewport trigger
   */
  registerExperiment(
    experimentName: string,
    currentVariant: number,
    currentChanges: DOMChange[],
    allVariantsChanges: DOMChange[][],
    hasImmediateTrigger: boolean,
    hasViewportTrigger: boolean
  ): void {
    if (this.debug) {
      logDebug(`[EXPOSURE] [${experimentName}] Registering experiment for exposure tracking`, {
        experimentName,
        currentVariant,
        hasImmediateTrigger,
        hasViewportTrigger,
        currentChangesCount: currentChanges.length,
        allVariantsCount: allVariantsChanges.length,
        currentChangeTypes: currentChanges.map(c => ({
          type: c.type,
          selector: c.selector,
          trigger_on_view: c.trigger_on_view || false,
        })),
      });
    }

    // Collect all unique selectors that need viewport tracking across ALL variants
    const viewportSelectors = new Set<string>();
    const moveParentSelectors = new Set<string>(); // Parent containers for move changes

    // First pass: collect all move, delete, and create changes across all variants
    // We need to track ALL possible positions where elements could be
    const moveElements = new Map<string, Set<string>>(); // selector -> Set of target parent positions
    const deleteElements = new Set<string>(); // selectors for delete changes
    // For create: cross-variant exposure is positional (the created element only
    // exists in its own variant). Nested map avoids any composite-key collision —
    // CSS selectors can legally contain characters like '|' or ':', so we key
    // structurally instead of stringifying the pair.
    const createPositions = new Map<string, Set<string>>(); // targetSelector -> Set<position>

    for (const variantChanges of allVariantsChanges) {
      for (const change of variantChanges) {
        if (change.trigger_on_view) {
          if (change.type === 'move') {
            if (!moveElements.has(change.selector)) {
              moveElements.set(change.selector, new Set());
            }

            // Add the target parent for this move
            if (change.targetSelector) {
              moveElements.get(change.selector)!.add(change.targetSelector);
            }
          } else if (change.type === 'delete') {
            // Track delete changes - need special handling for placeholders
            deleteElements.add(change.selector);
          } else if (change.type === 'create') {
            // create requires targetSelector to have a DOM position; without it
            // the manipulator can't apply the change at all (DOMManipulatorLite
            // returns false), so there's nothing to track.
            if (change.targetSelector) {
              const position = change.position || 'lastChild';
              let positions = createPositions.get(change.targetSelector);
              if (!positions) {
                positions = new Set();
                createPositions.set(change.targetSelector, positions);
              }
              positions.add(position);
            } else if (this.debug) {
              logDebug(
                `[EXPOSURE] [${experimentName}] Skipping create change with no targetSelector — manipulator can't apply it either`,
                { change }
              );
            }
          } else {
            // For other change types, track the selector directly
            viewportSelectors.add(change.selector);
          }
        }
      }
    }

    // For cross-variant move tracking, we need to track the EXACT POSITION where
    // elements would appear in other variants. We use container-based invisible elements
    // positioned exactly where the element would be, using CSS positioning.
    for (const [selector] of moveElements) {
      // Collect all move changes for this element across ALL variants
      const allMovesForElement: Array<{
        targetSelector: string;
        position: string;
        variantIndex: number;
      }> = [];

      for (let variantIndex = 0; variantIndex < allVariantsChanges.length; variantIndex++) {
        const variantChanges = allVariantsChanges[variantIndex];
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
      }

      // Check if current variant has a move for this element
      const currentMoveIndex = allMovesForElement.findIndex(m => m.variantIndex === currentVariant);

      if (currentMoveIndex >= 0) {
        // Current variant HAS a move - track the element in its moved position
        viewportSelectors.add(selector);

        // For all OTHER variant positions, create container-based placeholders
        for (let index = 0; index < allMovesForElement.length; index++) {
          const move = allMovesForElement[index];
          if (index !== currentMoveIndex) {
            // Create placeholder at the position where element WOULD be in another variant
            this.createContainerPlaceholder(
              experimentName,
              selector,
              move.targetSelector,
              move.position
            );
          }
        }
      } else {
        // Current variant does NOT have a move - element stays in original position
        viewportSelectors.add(selector);

        // For ALL variant moves, create placeholders at those positions
        for (const move of allMovesForElement) {
          this.createContainerPlaceholder(
            experimentName,
            selector,
            move.targetSelector,
            move.position
          );
        }
      }
    }

    // For cross-variant delete tracking, we need to handle elements that are deleted in some variants
    // For variants with delete: replace element with 1px placeholder in the same position
    // For variants without delete: track the actual element
    for (const selector of deleteElements) {
      // Check if current variant has a delete for this selector
      const currentVariantHasDelete = currentChanges.some(
        c => c.type === 'delete' && c.selector === selector && c.trigger_on_view
      );

      if (currentVariantHasDelete) {
        // Current variant will delete this element - replace with in-place placeholder
        const placeholdersCreated = this.createInPlacePlaceholder(experimentName, selector);

        // If no placeholders created (element doesn't exist yet), track the selector
        // so when element appears via MutationObserver, it will be tracked
        if (placeholdersCreated === 0) {
          viewportSelectors.add(selector);
          if (this.debug) {
            logDebug(
              `[EXPOSURE] [${experimentName}] Delete element doesn't exist yet - tracking selector for when it appears`,
              { selector }
            );
          }
        }
      } else {
        // Current variant doesn't delete - track the real element
        viewportSelectors.add(selector);
      }
    }

    // For cross-variant create tracking: drop an invisible placeholder at every
    // (targetSelector, position) where any variant creates an element with
    // trigger_on_view. This guarantees exposure fires when the user scrolls to
    // the position regardless of whether their variant actually created the
    // element. The user's variant that does create the element gets the real
    // element in DOM at the same position (applyChange runs before this), and
    // the 1px invisible placeholder coexists harmlessly.
    //
    // Fallback: if the targetSelector isn't in the DOM at registration time
    // (SPA late-mount), createContainerPlaceholder returns false. Track the
    // targetSelector itself so the existing MutationObserver picks up exposure
    // when the target eventually appears.
    for (const [targetSelector, positions] of createPositions) {
      let anyInserted = false;
      for (const position of positions) {
        if (
          this.createContainerPlaceholder(
            experimentName,
            '__create_placeholder__',
            targetSelector,
            position
          )
        ) {
          anyInserted = true;
        }
      }
      if (!anyInserted) {
        viewportSelectors.add(targetSelector);
      }
    }

    // Trigger flags are now passed in from DOMChangesPluginLite after URL filtering
    // This ensures only variants matching the current URL determine trigger behavior

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

    // Trigger immediately if needed
    if (hasImmediateTrigger) {
      logDebug(`[EXPOSURE] [${experimentName}] ✓ HAS IMMEDIATE TRIGGER - triggering exposure NOW`, {
        experimentName,
        currentVariant,
        allVariantCounts: allVariantsChanges.map((vc, idx) => ({ variant: idx, count: vc.length })),
      });
      // Don't await here to avoid blocking the tracking setup
      this.triggerExposure(experimentName).catch(error => {
        logDebug(`[EXPOSURE] [${experimentName}] ✗ Failed to trigger exposure:`, error);
      });
    } else if (hasViewportTrigger) {
      logDebug(
        `[EXPOSURE] [${experimentName}] ✓ HAS VIEWPORT TRIGGER - setting up viewport observers`,
        {
          experimentName,
          currentVariant,
          selectorsToWatch: Array.from(tracking.allPossibleSelectors),
          allVariantCounts: allVariantsChanges.map((vc, idx) => ({
            variant: idx,
            count: vc.length,
          })),
        }
      );
      // Only set up viewport observers if there's NO immediate trigger
      // If there's an immediate trigger, the experiment will be triggered and cleaned up right away
      this.observeSelectors(experimentName, tracking.allPossibleSelectors);
    } else {
      logDebug(
        `[EXPOSURE] [${experimentName}] ⚠️  No immediate or viewport trigger detected - experiment will NOT be exposed!`,
        {
          experimentName,
          currentVariant,
          hasImmediateTrigger,
          hasViewportTrigger,
          currentChanges: currentChanges.map(c => ({
            type: c.type,
            trigger_on_view: c.trigger_on_view,
          })),
        }
      );
    }
  }

  /**
   * Create a container-based placeholder at the hypothetical position
   * Uses inline-block with minimal dimensions to be observable but not affect layout
   * Returns true when a placeholder was inserted (or already exists for this key);
   * false when the target element isn't in the DOM yet, so callers can fall back.
   */
  private createContainerPlaceholder(
    experimentName: string,
    originalSelector: string,
    targetSelector: string,
    position: string = 'lastChild'
  ): boolean {
    const targetElement = document.querySelector(targetSelector);
    if (!targetElement) return false;

    const placeholderKey = `${experimentName}-${originalSelector}-${targetSelector}-${position}`;

    // Check if placeholder already exists
    if (this.placeholders.has(placeholderKey)) {
      return true;
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

    return true;
  }

  /**
   * Create an in-place placeholder that replaces a deleted element
   * This allows viewport tracking for delete changes
   * Returns the number of placeholders created
   */
  private createInPlacePlaceholder(experimentName: string, selector: string): number {
    const elements = document.querySelectorAll(selector);

    if (elements.length === 0) {
      if (this.debug) {
        logDebug(
          `[EXPOSURE] [${experimentName}] No elements found for delete placeholder - will track selector instead`,
          { selector }
        );
      }
      return 0;
    }

    let placeholdersCreated = 0;

    for (let index = 0; index < elements.length; index++) {
      const element = elements[index];
      // Create unique ID for the placeholder (remove special chars from selector for valid ID)
      const selectorId = selector.replace(/[^a-zA-Z0-9-]/g, '_');
      const placeholderId = `absmartly-delete-${experimentName}-${selectorId}-${index}`;
      const placeholderKey = `${experimentName}-delete-${selector}-${index}`;

      // Check if this element already has a placeholder
      if (element.hasAttribute('data-absmartly-delete-placeholder')) {
        continue;
      }

      // Create minimal placeholder using inline styles
      // This will be observable by IntersectionObserver but won't affect layout
      const placeholder = document.createElement('span');
      placeholder.id = placeholderId;
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
      placeholder.setAttribute('data-absmartly-delete-placeholder', 'true');
      placeholder.setAttribute('data-absmartly-original-selector', selector);
      placeholder.setAttribute('data-absmartly-experiment', experimentName);
      placeholder.setAttribute('aria-hidden', 'true');

      // Insert placeholder before the element, then remove the element
      element.parentElement?.insertBefore(placeholder, element);
      element.remove();

      this.placeholders.set(placeholderKey, placeholder);

      // Track the placeholder for viewport visibility
      this.trackElement(placeholder, experimentName);

      placeholdersCreated++;

      if (this.debug) {
        logDebug(
          `[ABsmartly] Created in-place delete placeholder for ${selector} in experiment ${experimentName}`
        );
      }
    }

    return placeholdersCreated;
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
    for (const selector of selectors) {
      // Try to find existing elements
      const elements = document.querySelectorAll(selector);

      if (elements.length > 0) {
        for (const element of elements) {
          this.trackElement(element, experimentName);
        }
      } else {
        // Element doesn't exist yet, set up mutation observer to watch for it
        this.watchForSelector(selector, experimentName);
      }
    }
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
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.handleElementVisible(entry.target);
          }
        }
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
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            // Check if this element or its children match any tracked selectors
            this.checkNewElement(node);
          }
        }
      }
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
    for (const [experimentName, tracking] of this.experiments) {
      for (const selector of tracking.allPossibleSelectors) {
        if (element.matches(selector)) {
          this.trackElement(element, experimentName);
        }

        // Also check children
        for (const child of element.querySelectorAll(selector)) {
          this.trackElement(child, experimentName);
        }
      }
    }
  }

  /**
   * Handle when an element becomes visible
   */
  private handleElementVisible(element: Element): void {
    const tracked = this.trackedElements.get(element);
    if (!tracked) return;

    for (const experimentName of tracked.experiments) {
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
    }
  }

  /**
   * Trigger exposure for an experiment
   */
  private async triggerExposure(experimentName: string): Promise<void> {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) {
      logDebug(`[EXPOSURE] [${experimentName}] ✗ Cannot trigger - experiment not found in tracker`);
      return;
    }

    if (experiment.triggered) {
      logDebug(`[EXPOSURE] [${experimentName}] Already triggered, skipping`);
      return;
    }

    logDebug(`[EXPOSURE] [${experimentName}] ✓ CALLING context.treatment() to trigger exposure`, {
      experimentName,
      variant: experiment.variant,
    });

    // Ensure context is ready before calling treatment
    await this.context.ready();

    // Call treatment to trigger exposure
    const treatment = this.context.treatment(experimentName);
    experiment.triggered = true;

    logDebug(
      `[EXPOSURE] [${experimentName}] ✓✓ EXPOSURE TRIGGERED - context.treatment() completed`,
      {
        experimentName,
        variant: experiment.variant,
        treatment,
      }
    );

    // Clean up tracking for this experiment
    this.cleanupExperiment(experimentName);
  }

  /**
   * Clean up tracking for an experiment that has been triggered
   */
  private cleanupExperiment(experimentName: string): void {
    // Remove from tracked elements
    for (const [element, tracked] of this.trackedElements) {
      tracked.experiments.delete(experimentName);

      if (tracked.experiments.size === 0) {
        this.observer.unobserve(element);
        this.trackedElements.delete(element);
      }
    }

    // Remove placeholders
    for (const [key, placeholder] of this.placeholders) {
      if (key.startsWith(`${experimentName}-`)) {
        placeholder.remove();
        this.placeholders.delete(key);
      }
    }

    // Don't delete the experiment - keep it in the map so isTriggered() can still return true
    // Just clear the selectors since we don't need to track them anymore
    const experiment = this.experiments.get(experimentName);
    if (experiment) {
      experiment.allPossibleSelectors.clear();
    }

    // Clean up mutation observer if all experiments have been triggered
    const allTriggered = Array.from(this.experiments.values()).every(exp => exp.triggered);
    if (allTriggered && this.mutationObserver) {
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
    for (const placeholder of this.placeholders.values()) {
      placeholder.remove();
    }

    // Clear all tracking
    this.experiments.clear();
    this.trackedElements.clear();
    this.placeholders.clear();

    if (this.debug) {
      logDebug('[ABsmartly] ExposureTracker destroyed');
    }
  }
}
