/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PluginConfig,
  DOMChange,
  EventCallback,
  EventCallbackData,
  DOMChangesData,
  DOMChangesConfig,
} from '../types';
import { DOMManipulatorLite } from './DOMManipulatorLite';
import { VariantExtractor } from '../parsers/VariantExtractor';
import { StyleSheetManager } from './StyleSheetManager';
import { ExposureTracker } from './ExposureTracker';
import { HTMLInjector } from './HTMLInjector';
import { logDebug, logExperimentSummary, logPerformance, DEBUG } from '../utils/debug';
import { URLMatcher } from '../utils/URLMatcher';
import { DOMPersistenceManager } from '../utils/persistence';
import { registerPlugin, unregisterPlugin } from '../utils/plugin-registry';

declare const __VERSION__: string;

export class DOMChangesPluginLite {
  public static readonly VERSION: string =
    typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.1.2';

  protected config: Required<PluginConfig>;
  protected domManipulator: DOMManipulatorLite;
  protected variantExtractor: VariantExtractor;
  protected exposureTracker: ExposureTracker;
  protected htmlInjector: HTMLInjector;
  protected mutationObserver: MutationObserver | null = null;
  protected exposedExperiments: Set<string> = new Set();
  protected eventListeners: Map<string, EventCallback[]> = new Map();
  protected styleManagers: Map<string, StyleSheetManager> = new Map();
  protected initialized = false;
  protected persistenceManager: DOMPersistenceManager | null = null;
  protected antiFlickerTimeout: number | null = null;
  protected antiFlickerStyleId = 'absmartly-antiflicker';
  private readyPromise: Promise<void>;

  constructor(config: PluginConfig) {
    this.config = {
      context: config.context,
      autoApply: config.autoApply ?? true,
      spa: config.spa ?? true,
      visibilityTracking: config.visibilityTracking ?? true,
      variableName: config.variableName ?? '__dom_changes',
      debug: config.debug ?? false,
      hideUntilReady: config.hideUntilReady ?? false,
      hideTimeout: config.hideTimeout ?? 3000,
      hideTransition: config.hideTransition ?? false,
    };

    if (!this.config.context) {
      throw new Error('[ABsmartly] Context is required');
    }

    console.log(`[ABsmartly] DOMChangesPluginLite v${DOMChangesPluginLite.VERSION} initialized`);

    if (this.config.hideUntilReady) {
      this.hideContent();
    }

    this.domManipulator = new DOMManipulatorLite(this.config.debug, this);
    this.variantExtractor = new VariantExtractor(
      this.config.context,
      this.config.variableName,
      this.config.debug
    );
    this.exposureTracker = new ExposureTracker(this.config.context, this.config.debug);
    this.htmlInjector = new HTMLInjector(this.config.debug);
    this.persistenceManager = new DOMPersistenceManager({
      debug: this.config.debug,
      onReapply: (change: DOMChange, experimentName: string) => {
        logDebug('[DOMChangesPluginLite] Re-applying change due to mutation', {
          experimentName,
          selector: change.selector,
          type: change.type,
        });
        this.domManipulator.applyChange(change, experimentName);
      },
    });

    // Auto-initialize when context is ready
    this.readyPromise = this.config.context
      .ready()
      .then(() => {
        logDebug('[DOMChangesPluginLite] Context is ready, starting initialization');
        return this.initialize();
      })
      .catch(error => {
        logDebug('[DOMChangesPluginLite] ERROR during initialization:', error);
        throw error;
      });
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      logDebug('Plugin already initialized');
      return;
    }

    const startTime = performance.now();
    logDebug('Initializing ABsmartly DOM Changes Plugin Lite', {
      version: DOMChangesPluginLite.VERSION,
      config: {
        autoApply: this.config.autoApply,
        spa: this.config.spa,
        visibilityTracking: this.config.visibilityTracking,
        DEBUG,
      },
    });

    try {
      if (this.config.spa) {
        // SPA mode: observe body for React/Vue hydration recovery
        // and listen for URL changes to re-apply changes on navigation
        this.setupMutationObserver();
        this.setupURLChangeListener();
      } else {
        logDebug('[DOMChangesPluginLite] SPA mode disabled - skipping body observer');
      }

      if (this.config.autoApply) {
        // Apply HTML injections and DOM changes in parallel to minimize flickering
        await this.applyInjectionsAndChanges();
      }

      this.initialized = true;

      this.registerWithContext();
      this.registerGlobally();

      this.emit('initialized');

      const duration = performance.now() - startTime;
      logPerformance('Plugin initialization', duration);

      logDebug(
        `[ABsmartly] DOM plugin lite loaded successfully (v${DOMChangesPluginLite.VERSION})`
      );

      if (this.config.debug) {
        logDebug('[ABsmartly] DOM Changes Plugin Lite initialized with debug mode');
      }
    } catch (error) {
      logDebug('[ABsmartly] Failed to initialize plugin:', error);
      throw error;
    }
  }

  private setupMutationObserver(): void {
    const observer = new MutationObserver(mutations => {
      // Re-apply ALL changes to elements that were replaced by React (hydration mismatch)
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check if any added nodes match our applied change selectors
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              // Check all experiments with applied changes (not just style changes)
              const appliedChanges = this.persistenceManager?.getAppliedChanges() || new Map();
              appliedChanges.forEach((changes: DOMChange[], experimentName: string) => {
                changes.forEach((change: DOMChange) => {
                  try {
                    // Check if this new element or any of its descendants match the selector
                    const matchingElements = element.matches(change.selector)
                      ? [element]
                      : Array.from(element.querySelectorAll(change.selector));

                    matchingElements.forEach(matchingEl => {
                      if (this.config.debug) {
                        logDebug(
                          '[SPA-REAPPLY] Re-applying change to newly added element (React hydration recovery)',
                          {
                            experimentName,
                            selector: change.selector,
                            element: matchingEl.tagName,
                            changeType: change.type,
                          }
                        );
                      }

                      // Re-apply the change to the new element (ALL types: style, class, attribute, html, text, etc.)
                      this.domManipulator.applyChange(change, experimentName);
                    });
                  } catch (e) {
                    // Invalid selector, skip
                  }
                });
              });
            }
          });
        }
      });
    });

    // Wait for document.body to exist before observing
    // This prevents "parameter 1 is not of type 'Node'" errors when SDK loads in <head>
    const startObserving = () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      this.mutationObserver = observer;
      logDebug('[DOMChangesPluginLite] MutationObserver started on document.body');
    };

    if (document.body) {
      startObserving();
    } else {
      // Use MutationObserver on documentElement to detect when body is added
      const bodyObserver = new MutationObserver((_mutations, obs) => {
        if (document.body) {
          obs.disconnect();
          startObserving();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
      logDebug('[DOMChangesPluginLite] Waiting for document.body...');
    }
  }

  /**
   * Set up URL change listener for SPA mode
   * Re-evaluates URL filters when URL changes and applies/removes changes accordingly
   */
  private setupURLChangeListener(): void {
    const handleURLChange = async () => {
      const newURL = window.location.href;
      logDebug('[ABsmartly] URL changed, re-evaluating experiments:', newURL);

      // Remove all current changes
      await this.removeAllChanges();

      // Re-apply changes and injections with new URL (in parallel)
      await this.applyInjectionsAndChanges();
    };

    // Listen to popstate (back/forward navigation)
    window.addEventListener('popstate', handleURLChange);

    // Intercept pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      handleURLChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      handleURLChange();
    };

    if (this.config.debug) {
      logDebug('[ABsmartly] URL change listener set up for SPA mode');
    }
  }

  /**
   * Remove all currently applied changes
   * Used when URL changes in SPA mode
   */
  private async removeAllChanges(): Promise<void> {
    // Clear exposed experiments - ExposureTracker will re-register on next applyChanges
    this.exposedExperiments.clear();

    // Clear style managers - StyleSheetManager doesn't have a remove method
    // The stylesheets will be reused or cleared on next applyChanges
    this.styleManagers.clear();

    // Clear applied changes
    if (this.persistenceManager) {
      this.persistenceManager.clearAll();
    }

    // Clear HTML injections
    this.htmlInjector.destroy();

    // Clear variant extractor cache to force re-extraction
    this.variantExtractor.clearCache();

    if (this.config.debug) {
      logDebug('[ABsmartly] All change tracking cleared for URL change');
    }
  }

  /**
   * Apply HTML injections and DOM changes in parallel to minimize flickering
   */
  private async applyInjectionsAndChanges(): Promise<void> {
    const startTime = performance.now();
    const currentURL = window.location.href;

    try {
      await this.config.context.ready();
    } catch (error) {
      logDebug('[ABsmartly] Failed to wait for context ready:', error);
      return;
    }

    // Extract both __inject_html and __dom_changes in parallel
    const allInjectHTML = this.variantExtractor.extractAllInjectHTML();

    // Apply injections and DOM changes in parallel for minimal flickering
    await Promise.all([this.applyHTMLInjections(allInjectHTML, currentURL), this.applyChanges()]);

    const duration = performance.now() - startTime;
    logPerformance('Apply injections and changes (parallel)', duration);

    if (this.config.debug) {
      logDebug('[ABsmartly] HTML injections and DOM changes applied in parallel', {
        duration: `${duration.toFixed(2)}ms`,
        currentURL,
      });
    }
  }

  /**
   * Apply HTML injections from all variants
   */
  private async applyHTMLInjections(
    allInjectHTML: Map<string, Map<number, any>>,
    currentUrl: string = window.location.href
  ): Promise<void> {
    if (allInjectHTML.size === 0) {
      if (this.config.debug) {
        logDebug('[ABsmartly] No HTML injections found');
      }
      return;
    }

    const injectionsByLocation = this.htmlInjector.collectInjections(allInjectHTML, currentUrl);
    this.htmlInjector.inject(injectionsByLocation);

    if (this.config.debug) {
      logDebug('[ABsmartly] HTML injections complete', {
        experimentsWithInjections: allInjectHTML.size,
        totalLocations: injectionsByLocation.size,
        currentUrl,
      });
    }
  }

  async applyChanges(experimentName?: string): Promise<void> {
    const startTime = performance.now();
    const currentURL = window.location.href;

    logDebug('Starting to apply changes', {
      specificExperiment: experimentName || 'all',
      url: currentURL,
      action: 'apply_start',
    });

    if (this.config.debug) {
      logDebug('[ABsmartly] === DOM Changes Application Starting ===');
      logDebug('[ABsmartly] Target:', experimentName || 'all experiments');
      logDebug('[ABsmartly] Current URL:', currentURL);
      logDebug('[ABsmartly] Context ready:', true);
    }

    try {
      await this.config.context.ready();
    } catch (error) {
      logDebug('[ABsmartly] Failed to wait for context ready:', error);
      return;
    }

    this.variantExtractor.clearCache();

    const allExperiments = this.getAllExperimentsData();

    let totalApplied = 0;
    const experimentStats = new Map<string, { total: number; success: number; pending: number }>();

    logDebug('[APPLY-CHANGES] Experiments found with DOM changes:', {
      experimentNames: Array.from(allExperiments.keys()),
      totalCount: allExperiments.size,
      currentURL,
    });

    if (allExperiments.size === 0) {
      logDebug('[APPLY-CHANGES] ⚠️  No experiments found with DOM changes - nothing to process');
    }

    for (const [expName, experimentData] of allExperiments) {
      logDebug(`[APPLY-CHANGES] [${expName}] Starting to process experiment`, {
        experimentName: expName,
        currentURL,
      });

      // Skip if filtering by specific experiment
      if (experimentName && expName !== experimentName) {
        logDebug(`[APPLY-CHANGES] [${expName}] ⏭️  Skipping - filtering for different experiment`, {
          filteringFor: experimentName,
        });
        continue;
      }

      const currentVariant = this.config.context.peek(expName);

      if (currentVariant === undefined || currentVariant === null) {
        logDebug(
          `[APPLY-CHANGES] [${expName}] ⏭️  Skipping - no variant assigned (peek returned ${currentVariant})`,
          {
            experimentName: expName,
          }
        );
        continue;
      }

      logDebug(`[APPLY-CHANGES] [${expName}] User assigned to variant ${currentVariant}`);

      const { variantData, urlFilter, globalDefaults } = experimentData;

      // Check if ANY variant matches the current URL
      const anyVariantMatchesURL = this.variantExtractor.anyVariantMatchesURL(expName, currentURL);

      if (!anyVariantMatchesURL) {
        logDebug(
          `[APPLY-CHANGES] [${expName}] ⏭️  Skipping - no variant matches URL: ${currentURL}`,
          {
            experimentName: expName,
            currentURL,
          }
        );
        continue;
      }

      logDebug(`[APPLY-CHANGES] [${expName}] ✓ At least one variant matches current URL`);

      // Determine if we should apply visual changes for the user's variant
      const shouldApplyVisualChanges = this.shouldApplyVisualChanges(
        variantData,
        urlFilter,
        currentURL
      );

      // Extract changes for user's variant and apply global defaults
      const changes = this.extractChangesFromData(variantData, globalDefaults);

      // Get all variant changes for cross-variant tracking (SRM prevention)
      const allVariantChanges = this.extractAllVariantChanges(expName);

      // Check if ANY variant has ANY changes (not just user's variant)
      // This is critical for SRM prevention - we must track if ANY variant has changes
      const hasAnyChangesInAnyVariant = allVariantChanges.some(
        variantChanges => variantChanges && variantChanges.length > 0
      );

      if (!hasAnyChangesInAnyVariant) {
        // If NO variant has ANY changes, skip the entire experiment
        if (this.config.debug) {
          logDebug(`[ABsmartly] Skipping experiment '${expName}' - no variants have changes`);
        }
        continue;
      }

      const stats = { total: changes?.length || 0, success: 0, pending: 0 };

      if (this.config.debug) {
        logDebug(
          `[ABsmartly] Processing experiment '${expName}' - User is in variant ${currentVariant}:`,
          {
            experimentName: expName,
            userVariant: currentVariant,
            urlMatches: shouldApplyVisualChanges,
            changeCount: changes?.length || 0,
            userVariantHasChanges: (changes?.length || 0) > 0,
            changes:
              changes?.map(c => ({
                type: c.type,
                selector: c.selector,
                trigger: c.trigger_on_view ? 'viewport' : 'immediate',
              })) || [],
          }
        );
      }

      // Log if user is in control variant (no changes)
      if (!changes || changes.length === 0) {
        if (this.config.debug) {
          logDebug(
            `[ABsmartly] User is in control variant ${currentVariant} with no changes, but will still track for SRM prevention`,
            {
              experimentName: expName,
              currentVariant,
            }
          );
        }
      }

      // Apply visual changes only if URL matches for user's variant AND user has changes
      if (shouldApplyVisualChanges && changes && changes.length > 0) {
        for (const change of changes) {
          // Skip delete changes with viewport triggers - they must be applied AFTER exposure
          // Otherwise the element is removed before it can be observed
          if (change.type === 'delete' && change.trigger_on_view) {
            if (this.config.debug) {
              logDebug(
                `[ABsmartly] Deferring delete change until after viewport trigger for '${expName}'`,
                { selector: change.selector }
              );
            }
            continue;
          }

          const success = this.domManipulator.applyChange(change, expName);

          if (success) {
            totalApplied++;
            stats.success++;
          } else if (change.type !== 'create' && change.type !== 'styleRules') {
            // Track pending changes for stats
            try {
              const elements = document.querySelectorAll(change.selector);
              if (elements.length === 0 && (this.config.spa || change.waitForElement)) {
                stats.pending++;
              }
            } catch (error) {
              if (this.config.debug) {
                logDebug(`[ABsmartly] Invalid selector: ${change.selector}`, error);
              }
            }
          }
        }
      } else if (changes && changes.length > 0) {
        logDebug(
          `[ABsmartly] Experiment '${expName}' variant ${currentVariant} doesn't match URL filter or has no changes, but setting up tracking for SRM prevention`
        );
      }

      // For SRM prevention: Check trigger types ONLY from variants whose URL filters match
      // CRITICAL: Only variants matching the current URL should determine the trigger behavior
      let hasAnyViewportTriggerInAnyVariant = false;
      let hasAnyImmediateTriggerInAnyVariant = false;

      // Get all variants data to check URL filters
      const allVariantsData = this.variantExtractor.getAllVariantsData(expName);

      if (this.config.debug) {
        logDebug(
          `[ABsmartly] Checking trigger types for experiment '${expName}' on URL: ${currentURL}`,
          {
            allVariantsDataSize: allVariantsData.size,
            allVariantChangesLength: allVariantChanges.length,
          }
        );

        // Log the structure of each variant's data
        allVariantsData.forEach((data, idx) => {
          logDebug(`[ABsmartly] Variant ${idx} data structure:`, {
            isArray: Array.isArray(data),
            isObject: typeof data === 'object',
            hasUrlFilter:
              data && typeof data === 'object' && !Array.isArray(data) && 'urlFilter' in data,
            keys:
              data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : 'N/A',
          });
        });
      }

      // Loop through ALL variants (not just ones with changes)
      // We need to check URL filters from the raw data, which includes variants without changes
      for (const [variantIndex, variantData] of allVariantsData) {
        const variantChanges = allVariantChanges[variantIndex];
        if (!variantChanges || variantChanges.length === 0) {
          continue;
        }

        // Check if this variant's URL filter matches the current URL
        let variantMatchesURL = true; // Default to true for legacy format (no URL filter)

        if (variantData && typeof variantData === 'object' && !Array.isArray(variantData)) {
          const config = variantData as { urlFilter?: unknown };
          if ('urlFilter' in config && config.urlFilter) {
            // This variant has a URL filter - check if it matches
            const urlFilterConfig = config as {
              urlFilter: { include?: string[]; exclude?: string[] };
            };
            variantMatchesURL = URLMatcher.matches(urlFilterConfig.urlFilter, currentURL);

            if (this.config.debug) {
              logDebug(
                `[ABsmartly] Variant ${variantIndex} has URL filter, matches: ${variantMatchesURL}`
              );
            }
          }
          // If no urlFilter property, variantMatchesURL stays true (legacy behavior)
        }

        // Only collect trigger types from variants whose URL filters match
        if (variantMatchesURL) {
          for (const change of variantChanges) {
            if (change.trigger_on_view) {
              hasAnyViewportTriggerInAnyVariant = true;
            } else {
              hasAnyImmediateTriggerInAnyVariant = true;
            }

            // Early exit if we found both types
            if (hasAnyViewportTriggerInAnyVariant && hasAnyImmediateTriggerInAnyVariant) {
              break;
            }
          }

          if (this.config.debug) {
            logDebug(
              `[ABsmartly] Variant ${variantIndex} matches URL - hasImmediate: ${hasAnyImmediateTriggerInAnyVariant}, hasViewport: ${hasAnyViewportTriggerInAnyVariant}`
            );
          }
        } else {
          if (this.config.debug) {
            logDebug(`[ABsmartly] Variant ${variantIndex} does NOT match URL - skipping`);
          }
        }

        if (hasAnyViewportTriggerInAnyVariant && hasAnyImmediateTriggerInAnyVariant) {
          break;
        }
      }

      if (this.config.debug) {
        logDebug(`[TRIGGER-DETECTION] [${expName}] Final trigger decision for '${expName}':`, {
          experimentName: expName,
          userVariant: currentVariant,
          hasImmediateTrigger: hasAnyImmediateTriggerInAnyVariant,
          hasViewportTrigger: hasAnyViewportTriggerInAnyVariant,
          willRegisterExperiment:
            hasAnyViewportTriggerInAnyVariant || hasAnyImmediateTriggerInAnyVariant,
          userChangesCount: changes?.length || 0,
          allVariantsChangesCount: allVariantChanges.map(vc => vc.length),
        });
      }

      // CRITICAL: Always register experiment for tracking if ANY variant has ANY trigger type
      // This prevents SRM even when user's variant doesn't match URL filter
      // Pass the URL-filtered trigger flags to ExposureTracker
      if (hasAnyViewportTriggerInAnyVariant || hasAnyImmediateTriggerInAnyVariant) {
        logDebug(
          `[TRIGGER-DETECTION] [${expName}] ✓ REGISTERING EXPERIMENT - Calling exposureTracker.registerExperiment()`,
          {
            experimentName: expName,
            userVariant: currentVariant,
            hasImmediateTrigger: hasAnyImmediateTriggerInAnyVariant,
            hasViewportTrigger: hasAnyViewportTriggerInAnyVariant,
            changesForUser: changes?.length || 0,
            allVariantCounts: allVariantChanges.map((vc, idx) => ({
              variant: idx,
              count: vc.length,
            })),
          }
        );
        this.exposureTracker.registerExperiment(
          expName,
          currentVariant || 0,
          changes || [],
          allVariantChanges,
          hasAnyImmediateTriggerInAnyVariant,
          hasAnyViewportTriggerInAnyVariant
        );
      } else {
        logDebug(
          `[TRIGGER-DETECTION] [${expName}] ⚠️  No triggers detected - experiment will NOT be registered!`,
          {
            experimentName: expName,
            userVariant: currentVariant,
            hasAnyChangesInAnyVariant,
            allVariantsChangesCount: allVariantChanges.map(vc => vc.length),
          }
        );
      }

      // Note: We do NOT call treatment() here anymore to avoid duplicate calls.
      // The ExposureTracker.registerExperiment() will call triggerExposure() internally
      // when hasImmediateTrigger is true (see ExposureTracker line 169-174).
      // This prevents double treatment() calls that were causing test failures.

      experimentStats.set(expName, stats);
      logExperimentSummary(expName, stats.total, stats.success, stats.pending);
    }

    const duration = performance.now() - startTime;
    logPerformance('Apply changes', duration, {
      totalApplied,
      experiments: experimentStats.size,
    });

    if (this.config.debug) {
      logDebug('[ABsmartly] === DOM Changes Application Complete ===');
      logDebug('[ABsmartly] Summary:', {
        totalChangesApplied: totalApplied,
        experimentsProcessed: experimentStats.size,
        duration: `${duration.toFixed(2)}ms`,
        experiments: Array.from(experimentStats.entries()).map(([name, stats]) => ({
          name,
          total: stats.total,
          success: stats.success,
          pending: stats.pending,
          pendingReason:
            stats.pending > 0 ? 'Elements not found yet (SPA mode will retry)' : undefined,
        })),
      });
    }

    // Show hidden content after changes are applied
    if (this.config.hideUntilReady) {
      this.showContent();
    }

    logDebug('[ABsmartly] DOM changes applied');
    this.emit('changes-applied', { count: totalApplied, experimentName });
  }

  /**
   * Get all experiments with their variant data and metadata
   */
  private getAllExperimentsData(): Map<
    string,
    {
      variantData: DOMChangesData | null;
      urlFilter: any;
      globalDefaults: Partial<DOMChangesConfig>;
    }
  > {
    const experiments = new Map();
    const allVariants = this.variantExtractor.extractAllChanges();

    logDebug('[GET-EXPERIMENTS] Extracting experiment data from context', {
      experimentsWithChanges: Array.from(allVariants.keys()),
      totalCount: allVariants.size,
    });

    for (const [expName] of allVariants) {
      const currentVariant = this.config.context.peek(expName);

      logDebug(`[GET-EXPERIMENTS] [${expName}] Checking experiment`, {
        experimentName: expName,
        currentVariant,
        variantIsValid: currentVariant !== undefined && currentVariant !== null,
      });

      if (currentVariant === undefined || currentVariant === null) {
        logDebug(
          `[GET-EXPERIMENTS] [${expName}] ⏭️  Skipping - context.peek() returned ${currentVariant}`
        );
        continue;
      }

      const variantsData = this.variantExtractor.getAllVariantsData(expName);
      const variantData = variantsData.get(currentVariant);

      if (this.config.debug) {
        logDebug(`[GET-EXPERIMENTS] [${expName}] Variant data lookup:`, {
          experimentName: expName,
          userVariant: currentVariant,
          variantDataExists: !!variantData,
          allVariantsInMap: Array.from(variantsData.keys()),
          userVariantInMap: variantsData.has(currentVariant),
        });
      }

      if (!variantData) {
        logDebug(
          `[GET-EXPERIMENTS] [${expName}] ⚠️  User's variant ${currentVariant} has no DOM changes (control variant)`,
          {
            availableVariants: Array.from(variantsData.keys()),
            note: 'Will still track for SRM prevention',
          }
        );
        // Don't skip! Include experiments even if user's variant has no changes
        // This is critical for SRM prevention - we need to track ALL experiments
      }

      logDebug(`[GET-EXPERIMENTS] [${expName}] ✓ Including experiment (variant ${currentVariant})`);

      // Extract URL filter and global defaults if using wrapped format
      let urlFilter = null;
      let globalDefaults = {};

      if (
        variantData &&
        typeof variantData === 'object' &&
        !Array.isArray(variantData) &&
        'changes' in variantData
      ) {
        const config = variantData as DOMChangesConfig;
        urlFilter = config.urlFilter;
        globalDefaults = {
          waitForElement: config.waitForElement,
          persistStyle: config.persistStyle,
          important: config.important,
          observerRoot: config.observerRoot,
        };
      }

      experiments.set(expName, { variantData, urlFilter, globalDefaults });
    }

    return experiments;
  }

  /**
   * Extract changes from DOMChangesData and apply global defaults
   */
  private extractChangesFromData(
    data: DOMChangesData | null,
    globalDefaults: Partial<DOMChangesConfig>
  ): DOMChange[] | null {
    if (!data) {
      return null;
    }

    let changes: DOMChange[] | null = null;

    // Extract changes array
    if (Array.isArray(data)) {
      changes = data;
    } else if (typeof data === 'object' && 'changes' in data) {
      changes = (data as DOMChangesConfig).changes;
    }

    if (!changes || changes.length === 0) {
      return null;
    }

    // Apply global defaults to each change
    return changes.map(change => ({
      ...change,
      waitForElement: change.waitForElement ?? globalDefaults.waitForElement,
      persistStyle: change.persistStyle ?? globalDefaults.persistStyle,
      important: change.important ?? globalDefaults.important,
      observerRoot: change.observerRoot ?? globalDefaults.observerRoot,
    }));
  }

  /**
   * Extract all variant changes for cross-variant tracking
   */
  private extractAllVariantChanges(experimentName: string): DOMChange[][] {
    const allVariantChanges = this.variantExtractor.getAllVariantChanges(experimentName);
    const variantsData = this.variantExtractor.getAllVariantsData(experimentName);

    // Apply global defaults to each variant's changes
    const processedVariants: DOMChange[][] = [];

    for (let i = 0; i < allVariantChanges.length; i++) {
      const variantChanges = allVariantChanges[i];
      const variantData = variantsData.get(i);

      if (!variantChanges || variantChanges.length === 0) {
        processedVariants.push([]);
        continue;
      }

      // Extract global defaults if using wrapped format
      let globalDefaults: Partial<DOMChangesConfig> = {};
      if (
        variantData &&
        typeof variantData === 'object' &&
        !Array.isArray(variantData) &&
        'changes' in variantData
      ) {
        const config = variantData as DOMChangesConfig;
        globalDefaults = {
          waitForElement: config.waitForElement,
          persistStyle: config.persistStyle,
          important: config.important,
          observerRoot: config.observerRoot,
        };
      }

      // Apply global defaults
      const processedChanges = variantChanges.map(change => ({
        ...change,
        waitForElement: change.waitForElement ?? globalDefaults.waitForElement,
        persistStyle: change.persistStyle ?? globalDefaults.persistStyle,
        important: change.important ?? globalDefaults.important,
        observerRoot: change.observerRoot ?? globalDefaults.observerRoot,
      }));

      processedVariants.push(processedChanges);
    }

    return processedVariants;
  }

  /**
   * Determine if visual changes should be applied based on URL filter
   */
  private shouldApplyVisualChanges(
    variantData: DOMChangesData | null,
    urlFilter: any,
    url: string
  ): boolean {
    // No data for this variant - no changes to apply
    if (!variantData) {
      return false;
    }

    // Legacy array format has no URL filter - always apply
    if (Array.isArray(variantData)) {
      return true;
    }

    // Wrapped format without URL filter - always apply
    if (!urlFilter) {
      return true;
    }

    // Check URL filter
    return URLMatcher.matches(urlFilter, url);
  }

  hasChanges(experimentName: string): boolean {
    return this.domManipulator.hasChanges(experimentName);
  }

  applyChange(change: DOMChange, experimentName: string): boolean {
    logDebug('Applying single change via public API', {
      experimentName,
      selector: change.selector,
      changeType: change.type,
    });

    try {
      const success = this.domManipulator.applyChange(change, experimentName);

      if (success) {
        this.emit('change_applied', {
          experimentName,
          change,
        });
      }

      return success;
    } catch (error) {
      if (this.config.debug) {
        logDebug('[ABsmartly] Error applying change:', error);
      }
      return false;
    }
  }

  on(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  off(event: string, callback?: EventCallback): void {
    if (!callback) {
      this.eventListeners.delete(event);
    } else {
      const listeners = this.eventListeners.get(event) || [];
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  protected emit(event: string, data?: EventCallbackData): void {
    const listeners = this.eventListeners.get(event) || [];
    for (const callback of listeners) {
      try {
        callback(data);
      } catch (error) {
        logDebug(`[ABsmartly] Error in event listener for ${event}:`, error);
      }
    }
  }

  getStyleManager(experimentName: string): StyleSheetManager {
    const id = `absmartly-styles-${experimentName}`;
    let manager = this.styleManagers.get(experimentName);

    if (!manager) {
      manager = new StyleSheetManager(id, this.config.debug);
      this.styleManagers.set(experimentName, manager);
    }

    return manager;
  }

  buildCssRule(selector: string, properties: Record<string, string>, important = true): string {
    const declarations = Object.entries(properties)
      .map(([prop, value]) => {
        const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        const bang = important ? ' !important' : '';
        return `  ${cssProp}: ${value}${bang};`;
      })
      .join('\n');

    return `${selector} {\n${declarations}\n}`;
  }

  buildStateRules(selector: string, states: any, important = true): string {
    const rules: string[] = [];

    if (states.normal) {
      rules.push(this.buildCssRule(selector, states.normal, important));
    }
    if (states.hover) {
      rules.push(this.buildCssRule(`${selector}:hover`, states.hover, important));
    }
    if (states.active) {
      rules.push(this.buildCssRule(`${selector}:active`, states.active, important));
    }
    if (states.focus) {
      rules.push(this.buildCssRule(`${selector}:focus`, states.focus, important));
    }

    return rules.join('\n\n');
  }

  public refreshExperiments(): void {
    if (this.config.debug) {
      logDebug('[ABsmartly] Refreshing experiments and clearing cache');
    }
    this.variantExtractor.clearCache();
    if (this.config.autoApply) {
      this.applyInjectionsAndChanges();
    }
  }

  destroy(): void {
    this.domManipulator.destroy();
    this.exposureTracker.destroy();
    this.htmlInjector.destroy();

    this.styleManagers.forEach(manager => manager.destroy());
    this.styleManagers.clear();

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.persistenceManager) {
      this.persistenceManager.destroy();
      this.persistenceManager = null;
    }

    // Clean up anti-flicker timeout and style
    if (this.antiFlickerTimeout !== null) {
      clearTimeout(this.antiFlickerTimeout);
      this.antiFlickerTimeout = null;
    }
    const antiFlickerStyle = document.getElementById(this.antiFlickerStyleId);
    if (antiFlickerStyle) {
      antiFlickerStyle.remove();
    }

    this.eventListeners.clear();
    this.exposedExperiments.clear();

    this.unregisterFromContext();
    this.unregisterGlobally();

    this.initialized = false;

    if (this.config.debug) {
      logDebug('[ABsmartly] DOM Changes Plugin Lite destroyed');
    }
  }

  protected registerWithContext(): void {
    if (this.config.context) {
      if (!this.config.context.__plugins) {
        this.config.context.__plugins = {};
      }

      this.config.context.__plugins.domPlugin = {
        name: 'DOMChangesPluginLite',
        version: DOMChangesPluginLite.VERSION,
        initialized: true,
        capabilities: ['spa', 'visibility'],
        instance: this,
        timestamp: Date.now(),
      };

      this.config.context.__domPlugin = this.config.context.__plugins.domPlugin;

      if (this.config.debug) {
        logDebug('[ABsmartly] DOMChangesPluginLite registered with context at __plugins.domPlugin');
      }
    }
  }

  protected unregisterFromContext(): void {
    if (this.config.context) {
      if (this.config.context.__plugins?.domPlugin) {
        delete this.config.context.__plugins.domPlugin;
      }

      if (this.config.context.__domPlugin) {
        delete this.config.context.__domPlugin;
      }

      if (this.config.debug) {
        logDebug('[ABsmartly] DOMChangesPluginLite unregistered from context');
      }
    }
  }

  /**
   * Register plugin in global registry for detection
   */
  protected registerGlobally(): void {
    registerPlugin('dom', {
      name: 'DOMChangesPluginLite',
      version: DOMChangesPluginLite.VERSION,
      initialized: true,
      timestamp: Date.now(),
      capabilities: ['spa', 'visibility', 'auto-apply'],
      instance: this,
    });

    if (this.config.debug) {
      logDebug(
        '[ABsmartly] DOMChangesPluginLite registered in global window.__ABSMARTLY_PLUGINS__'
      );
    }
  }

  /**
   * Unregister plugin from global registry
   */
  protected unregisterGlobally(): void {
    unregisterPlugin('dom');

    if (this.config.debug) {
      logDebug('[ABsmartly] DOMChangesPluginLite unregistered from global registry');
    }
  }

  /**
   * Hide content to prevent flicker before experiments are applied
   */
  private hideContent(): void {
    const selector = this.config.hideUntilReady;
    if (!selector) return;

    // Check if style already exists (prevent duplicate injection)
    if (document.getElementById(this.antiFlickerStyleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.antiFlickerStyleId;

    const hasTransition = this.config.hideTransition !== false;

    if (hasTransition) {
      // Use both visibility:hidden and opacity:0 for smooth transition
      style.textContent = `
        ${selector} {
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `;
    } else {
      // Use only visibility:hidden for instant reveal (no layout shift)
      style.textContent = `
        ${selector} {
          visibility: hidden !important;
        }
      `;
    }

    document.head.appendChild(style);

    // Set timeout to show content even if experiments fail to load or timeout expires
    this.antiFlickerTimeout = window.setTimeout(() => {
      if (this.config.debug) {
        logDebug(
          `[ABsmartly] Anti-flicker timeout reached (${this.config.hideTimeout}ms), showing content`
        );
      }
      this.showContent();
    }, this.config.hideTimeout);

    if (this.config.debug) {
      logDebug(
        `[ABsmartly] Anti-flicker enabled (selector: '${selector}', transition: ${hasTransition ? this.config.hideTransition : 'none'}, timeout: ${this.config.hideTimeout}ms)`
      );
    }
  }

  /**
   * Show hidden content after experiments are applied or timeout expires
   */
  private showContent(): void {
    // Clear timeout if still pending
    if (this.antiFlickerTimeout !== null) {
      clearTimeout(this.antiFlickerTimeout);
      this.antiFlickerTimeout = null;
    }

    const style = document.getElementById(this.antiFlickerStyleId);
    if (!style) return;

    const hasTransition = this.config.hideTransition !== false;

    if (hasTransition) {
      // Smooth fade-in: remove visibility, add transition, then animate opacity
      const selector = this.config.hideUntilReady as string;

      // Step 1: Remove visibility:hidden, keep opacity:0, add transition
      style.textContent = `
        ${selector} {
          opacity: 0 !important;
          transition: opacity ${this.config.hideTransition} !important;
        }
      `;

      // Step 2: Force reflow to ensure transition applies
      style.offsetHeight;

      // Step 3: Trigger fade-in by setting opacity to 1
      style.textContent = `
        ${selector} {
          opacity: 1 !important;
          transition: opacity ${this.config.hideTransition} !important;
        }
      `;

      // Step 4: Remove style after transition completes
      const transitionDuration = parseFloat(this.config.hideTransition as string) * 1000;
      setTimeout(() => {
        style.remove();
        if (this.config.debug) {
          logDebug('[ABsmartly] Anti-flicker fade-in complete, style removed');
        }
      }, transitionDuration);

      if (this.config.debug) {
        logDebug(
          `[ABsmartly] Anti-flicker fading in with transition: ${this.config.hideTransition}`
        );
      }
    } else {
      // Instant reveal: just remove the style
      style.remove();

      if (this.config.debug) {
        logDebug('[ABsmartly] Anti-flicker removed, content now visible');
      }
    }
  }

  watchElement(element: Element, experimentName: string, change: DOMChange): void {
    if (this.persistenceManager) {
      this.persistenceManager.watchElement(element, experimentName, change);
    }
  }

  unwatchElement(element: Element, experimentName: string): void {
    if (this.persistenceManager) {
      this.persistenceManager.unwatchElement(element, experimentName);
    }
  }
}
