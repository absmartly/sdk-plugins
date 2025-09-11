import { ABsmartlyContext, DOMChange, ExperimentTracking } from '../types';

interface TrackedElement {
  element: Element;
  experiments: Set<string>;
  isPlaceholder?: boolean;
}

export class ExposureTracker {
  private experiments = new Map<string, ExperimentTracking>();
  private trackedElements = new Map<Element, TrackedElement>();
  private observer: IntersectionObserver;
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
      console.log(`[ABsmartly] Registering experiment ${experimentName} for exposure tracking`);
    }

    // Collect all unique selectors that need viewport tracking across ALL variants
    const viewportSelectors = new Set<string>();
    const moveParentSelectors = new Set<string>(); // Parent containers for move changes
    
    // Analyze all variants to find what needs tracking
    allVariantsChanges.forEach((variantChanges, variantIndex) => {
      variantChanges.forEach(change => {
        if (change.trigger_on_view) {
          if (change.type === 'move') {
            // For move changes, we need to track ONLY parent containers
            // This ensures all variants track the same elements
            
            // Get the original parent container (where element starts in control)
            // We need to determine this from the control variant (usually index 0)
            if (variantIndex === 0) {
              // Control variant - element is in original position
              const element = document.querySelector(change.selector);
              if (element?.parentElement) {
                const parentSelector = this.getStableParentSelector(element.parentElement);
                if (parentSelector) {
                  moveParentSelectors.add(parentSelector);
                }
              }
            }
            
            // Always add the target container for move destinations
            if (change.targetSelector) {
              // The target selector should be a container, not the element itself
              moveParentSelectors.add(change.targetSelector);
            }
          } else {
            // For non-move changes, track the selector directly
            viewportSelectors.add(change.selector);
          }
        }
      });
    });

    // Determine what triggers are needed
    let hasImmediateTrigger = false;
    let hasViewportTrigger = false;
    
    currentChanges.forEach(change => {
      if (change.trigger_on_view) {
        hasViewportTrigger = true;
      } else {
        hasImmediateTrigger = true;
      }
    });

    // Store experiment tracking info
    const tracking: ExperimentTracking = {
      experimentName,
      variant: currentVariant,
      changes: currentChanges,
      allPossibleSelectors: new Set([...viewportSelectors, ...moveParentSelectors]),
      triggered: false,
      hasImmediateTrigger,
      hasViewportTrigger
    };

    this.experiments.set(experimentName, tracking);

    if (this.debug) {
      console.log(`[ABsmartly] Experiment ${experimentName} will track selectors:`, 
        Array.from(tracking.allPossibleSelectors));
    }

    // Set up viewport observers
    if (hasViewportTrigger) {
      this.observeSelectors(experimentName, tracking.allPossibleSelectors);
    }

    // Trigger immediately if needed
    if (hasImmediateTrigger) {
      this.triggerExposure(experimentName);
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
        isPlaceholder: element.hasAttribute('data-absmartly-placeholder')
      });
      this.observer.observe(element);
    } else {
      this.trackedElements.get(element)!.experiments.add(experimentName);
    }
  }

  /**
   * Watch for elements matching a selector to appear
   */
  private watchForSelector(selector: string, experimentName: string): void {
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
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.handleElementVisible(entry.target);
        }
      });
    }, {
      threshold: 0.01, // Trigger when even 1% is visible
      rootMargin: '0px'
    });
  }

  /**
   * Set up MutationObserver for dynamic elements
   */
  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
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
      subtree: true
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
        this.triggerExposure(experimentName);
        
        if (this.debug) {
          const selector = tracked.isPlaceholder 
            ? element.getAttribute('data-absmartly-original-selector')
            : this.getElementSelector(element);
          console.log(`[ABsmartly] Triggering exposure for ${experimentName} via ${selector}`);
        }
      }
    });
  }

  /**
   * Trigger exposure for an experiment
   */
  private triggerExposure(experimentName: string): void {
    const experiment = this.experiments.get(experimentName);
    if (!experiment || experiment.triggered) return;

    // Call treatment to trigger exposure
    this.context.treatment(experimentName);
    experiment.triggered = true;

    if (this.debug) {
      console.log(`[ABsmartly] Exposure triggered for experiment: ${experimentName}`);
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
      console.log('[ABsmartly] ExposureTracker destroyed');
    }
  }
}