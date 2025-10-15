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

export class DOMChangesPluginLite {
  public static readonly VERSION: string = '1.0.0-lite';

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
  protected watchedElements: WeakMap<Element, Set<string>> = new WeakMap();
  protected persistenceObserver: MutationObserver | null = null;
  protected reapplyingElements: Set<Element> = new Set();
  protected reapplyLogThrottle: Map<string, number> = new Map();
  protected appliedChanges: Map<string, DOMChange[]> = new Map();
  protected antiFlickerTimeout: number | null = null;
  protected antiFlickerStyleId = 'absmartly-antiflicker';

  constructor(config: PluginConfig) {
    this.config = {
      context: config.context,
      autoApply: config.autoApply ?? true,
      spa: config.spa ?? true,
      visibilityTracking: config.visibilityTracking ?? true,
      extensionBridge: false, // Always false for lite version
      dataSource: config.dataSource ?? 'variable',
      dataFieldName: config.dataFieldName ?? '__dom_changes',
      debug: config.debug ?? false,
      hideUntilReady: config.hideUntilReady ?? false,
      hideTimeout: config.hideTimeout ?? 3000,
      hideSelector: config.hideSelector ?? '[data-absmartly-hide]',
      hideTransition: config.hideTransition ?? false,
    };

    if (!this.config.context) {
      throw new Error('[ABsmartly] Context is required');
    }

    // Apply anti-flicker hiding immediately if enabled
    if (this.config.hideUntilReady) {
      this.hideContent();
    }

    this.domManipulator = new DOMManipulatorLite(this.config.debug, this);
    this.variantExtractor = new VariantExtractor(
      this.config.context,
      this.config.dataSource,
      this.config.dataFieldName,
      this.config.debug
    );
    this.exposureTracker = new ExposureTracker(this.config.context, this.config.debug);
    this.htmlInjector = new HTMLInjector(this.config.debug);
  }

  async ready(): Promise<void> {
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
        dataSource: this.config.dataSource,
        DEBUG,
      },
    });

    try {
      if (this.config.spa) {
        this.setupMutationObserver();
        this.setupURLChangeListener();
      }

      if (this.config.autoApply) {
        // Apply HTML injections and DOM changes in parallel to minimize flickering
        await this.applyInjectionsAndChanges();
      }

      this.initialized = true;

      this.registerWithContext();

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

  async initialize(): Promise<void> {
    return this.ready();
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
              this.appliedChanges.forEach((changes, experimentName) => {
                changes.forEach(change => {
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

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.mutationObserver = observer;
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
    this.appliedChanges.clear();

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

    // Get all experiments with their data
    const allExperiments = this.getAllExperimentsData();

    let totalApplied = 0;
    const experimentStats = new Map<string, { total: number; success: number; pending: number }>();

    logDebug('[ABsmartly] Experiments to process:', Array.from(allExperiments.keys()));
    logDebug('[ABsmartly] Total experiments with changes:', allExperiments.size);

    for (const [expName, experimentData] of allExperiments) {
      // Skip if filtering by specific experiment
      if (experimentName && expName !== experimentName) {
        continue;
      }

      const currentVariant = this.config.context.peek(expName);
      const { variantData, urlFilter, globalDefaults } = experimentData;

      // Check if ANY variant matches the current URL
      const anyVariantMatchesURL = this.variantExtractor.anyVariantMatchesURL(expName, currentURL);

      if (!anyVariantMatchesURL) {
        logDebug(
          `[ABsmartly] Skipping experiment '${expName}' - no variant matches URL: ${currentURL}`
        );
        continue;
      }

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
        logDebug(`[ABsmartly] Processing experiment '${expName}' (variant ${currentVariant}):`, {
          urlMatches: shouldApplyVisualChanges,
          changeCount: changes?.length || 0,
          userVariantHasChanges: (changes?.length || 0) > 0,
          changes:
            changes?.map(c => ({
              type: c.type,
              selector: c.selector,
              trigger: c.trigger_on_view ? 'viewport' : 'immediate',
            })) || [],
        });
      }

      let hasImmediateTrigger = false;
      let hasViewportTrigger = false;

      // Apply visual changes only if URL matches for user's variant AND user has changes
      if (shouldApplyVisualChanges && changes && changes.length > 0) {
        for (const change of changes) {
          const success = this.domManipulator.applyChange(change, expName);

          if (success) {
            totalApplied++;
            stats.success++;

            if (change.trigger_on_view) {
              hasViewportTrigger = true;
            } else {
              hasImmediateTrigger = true;
            }
          } else if (change.type !== 'create' && change.type !== 'styleRules') {
            // Track pending changes for stats
            try {
              const elements = document.querySelectorAll(change.selector);
              if (elements.length === 0 && (this.config.spa || change.waitForElement)) {
                stats.pending++;
                if (change.trigger_on_view) {
                  hasViewportTrigger = true;
                }
              }
            } catch (error) {
              if (this.config.debug) {
                logDebug(`[ABsmartly] Invalid selector: ${change.selector}`, error);
              }
            }
          }
        }
      } else if (changes && changes.length > 0) {
        // URL doesn't match for user's variant OR user has no changes
        // Check if user's changes have viewport trigger (if they exist)
        // We still need to set up tracking for SRM prevention
        for (const change of changes) {
          if (change.trigger_on_view) {
            hasViewportTrigger = true;
          } else {
            hasImmediateTrigger = true;
          }
        }
        logDebug(
          `[ABsmartly] Experiment '${expName}' variant ${currentVariant} doesn't match URL filter or has no changes, but setting up tracking for SRM prevention`
        );
      }

      // For SRM prevention: Check trigger types across ALL variants (not just user's variant)
      // If ANY variant has changes with viewport or immediate triggers, we need to track
      let hasAnyViewportTriggerInAnyVariant = hasViewportTrigger;
      let hasAnyImmediateTriggerInAnyVariant = hasImmediateTrigger;

      if (!hasViewportTrigger || !hasImmediateTrigger) {
        for (const variantChanges of allVariantChanges) {
          if (variantChanges && variantChanges.length > 0) {
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
          }
          if (hasAnyViewportTriggerInAnyVariant && hasAnyImmediateTriggerInAnyVariant) {
            break;
          }
        }
      }

      // CRITICAL: Always register experiment for tracking if ANY variant has ANY trigger type
      // This prevents SRM even when user's variant doesn't match URL filter
      if (hasAnyViewportTriggerInAnyVariant || hasAnyImmediateTriggerInAnyVariant) {
        this.exposureTracker.registerExperiment(
          expName,
          currentVariant || 0,
          changes || [],
          allVariantChanges
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

    this.emit('changes-applied', { count: totalApplied, experimentName });
  }

  /**
   * Get all experiments with their variant data and metadata
   */
  private getAllExperimentsData(): Map<
    string,
    {
      variantData: DOMChangesData;
      urlFilter: any;
      globalDefaults: Partial<DOMChangesConfig>;
    }
  > {
    const experiments = new Map();
    const allVariants = this.variantExtractor.extractAllChanges();

    for (const [expName] of allVariants) {
      const currentVariant = this.config.context.peek(expName);
      if (currentVariant === undefined || currentVariant === null) {
        continue;
      }

      const variantsData = this.variantExtractor.getAllVariantsData(expName);
      const variantData = variantsData.get(currentVariant);

      if (!variantData) {
        continue;
      }

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
    data: DOMChangesData,
    globalDefaults: Partial<DOMChangesConfig>
  ): DOMChange[] | null {
    let changes: DOMChange[] | null = null;

    // Extract changes array
    if (Array.isArray(data)) {
      changes = data;
    } else if (data && typeof data === 'object' && 'changes' in data) {
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
    variantData: DOMChangesData,
    urlFilter: any,
    url: string
  ): boolean {
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

    if (this.persistenceObserver) {
      this.persistenceObserver.disconnect();
      this.persistenceObserver = null;
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
    this.watchedElements = new WeakMap();
    this.appliedChanges.clear();
    this.reapplyingElements.clear();
    this.reapplyLogThrottle.clear();

    this.unregisterFromContext();

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
   * Hide content to prevent flicker before experiments are applied
   */
  private hideContent(): void {
    const mode = this.config.hideUntilReady;
    if (!mode) return;

    // Check if style already exists (prevent duplicate injection)
    if (document.getElementById(this.antiFlickerStyleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.antiFlickerStyleId;

    const hasTransition = this.config.hideTransition !== false;
    const selector = mode === 'body' ? 'body' : this.config.hideSelector || '[data-absmartly-hide]';

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

    // Set timeout to show content even if experiments fail to load
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
        `[ABsmartly] Anti-flicker enabled (mode: ${mode}, transition: ${hasTransition ? this.config.hideTransition : 'none'}, timeout: ${this.config.hideTimeout}ms)`
      );
    }
  }

  /**
   * Show hidden content after experiments are applied
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
      const mode = this.config.hideUntilReady;
      const selector =
        mode === 'body' ? 'body' : this.config.hideSelector || '[data-absmartly-hide]';

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
    let experiments = this.watchedElements.get(element);
    if (!experiments) {
      experiments = new Set();
      this.watchedElements.set(element, experiments);
    }
    experiments.add(experimentName);

    // Store the applied change for this experiment (ALL types: style, class, attribute, html, text, etc.)
    if (!this.appliedChanges.has(experimentName)) {
      this.appliedChanges.set(experimentName, []);
    }
    const changes = this.appliedChanges.get(experimentName)!;
    const isNewWatch = !changes.includes(change);
    if (isNewWatch) {
      changes.push(change);

      // Only log when actually adding a new watch, not on every reapply
      if (this.config.debug) {
        const currentStyles: Record<string, string> = {};
        if (change.value && typeof change.value === 'object') {
          Object.keys(change.value).forEach(prop => {
            const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            currentStyles[cssProp] = (element as HTMLElement).style.getPropertyValue(cssProp);
          });
        }
        logDebug('[WATCH-ELEMENT] Started watching element for persistence/hydration recovery', {
          experimentName,
          selector: change.selector,
          element: element.tagName,
          changeType: change.type,
          value: change.value,
          currentStyles: change.type === 'style' ? currentStyles : undefined,
          timestamp: Date.now(),
        });
      }
    }

    if (!this.persistenceObserver) {
      this.setupPersistenceObserver();
    }
  }

  unwatchElement(element: Element, experimentName: string): void {
    const experiments = this.watchedElements.get(element);
    if (experiments) {
      experiments.delete(experimentName);
      if (experiments.size === 0) {
        this.watchedElements.delete(element);
      }
    }
  }

  private setupPersistenceObserver(): void {
    if (this.persistenceObserver) return;

    if (this.config.debug) {
      logDebug('[PERSISTENCE-OBSERVER] Setting up persistence observer', {
        timestamp: Date.now(),
        watchedElementsCount: this.watchedElements ? 'has WeakMap' : 'no WeakMap',
      });
    }

    this.persistenceObserver = new MutationObserver(mutations => {
      if (this.config.debug) {
        logDebug('[MUTATION-DETECTED] Persistence observer detected mutations', {
          mutationCount: mutations.length,
          timestamp: Date.now(),
          mutations: mutations.map(m => ({
            target: (m.target as Element).tagName,
            oldValue: m.oldValue?.substring(0, 100),
          })),
        });
      }

      mutations.forEach(mutation => {
        const element = mutation.target as Element;

        if (this.reapplyingElements.has(element)) {
          if (this.config.debug) {
            logDebug('[MUTATION-SKIP] Skipping mutation - currently reapplying', {
              element: element.tagName,
            });
          }
          return;
        }

        const experiments = this.watchedElements.get(element);

        if (experiments) {
          // Throttle mutation detection logs to once per 5 seconds per element
          if (this.config.debug) {
            const elementKey = `mutation:${element.tagName}:${
              (element as HTMLElement).getAttribute('name') || element.className
            }`;
            const now = Date.now();
            const lastLogged = this.reapplyLogThrottle.get(elementKey) || 0;

            if (now - lastLogged > 5000) {
              logDebug('[MUTATION-ON-WATCHED] Style mutation detected on watched element', {
                element: element.tagName,
                selector: (element as HTMLElement).getAttribute('name') || element.className,
                oldValue: mutation.oldValue,
                newValue: (element as HTMLElement).getAttribute('style'),
                experiments: Array.from(experiments),
              });
              this.reapplyLogThrottle.set(elementKey, now);
            }
          }

          experiments.forEach(experimentName => {
            const appliedChanges = this.appliedChanges.get(experimentName);

            if (appliedChanges) {
              appliedChanges.forEach(change => {
                // Skip the .matches() check - we already know this element should have this change
                // because we added it to watchedElements when we applied it successfully.
                // The .matches() check fails for complex selectors with parent relationships (e.g., "div > p")
                if (change.type === 'style') {
                  const needsReapply = this.checkStyleOverwritten(
                    element as HTMLElement,
                    change.value as Record<string, string>
                  );

                  if (needsReapply) {
                    this.reapplyingElements.add(element);

                    const logKey = `${experimentName}-${change.selector}`;
                    const now = Date.now();
                    const lastLogged = this.reapplyLogThrottle.get(logKey) || 0;

                    if (this.config.debug && now - lastLogged > 5000) {
                      logDebug(
                        '[REAPPLY-TRIGGERED] Reapplying style after mutation (React/framework conflict detected)',
                        {
                          experimentName,
                          selector: change.selector,
                          element: element.tagName,
                          timestamp: now,
                          note: 'This happens when the page framework (React/Vue/etc) fights with DOM changes',
                        }
                      );
                      this.reapplyLogThrottle.set(logKey, now);

                      // Cleanup old throttle entries to prevent memory leak
                      if (this.reapplyLogThrottle.size > 100) {
                        const oldestAllowed = now - 60000; // 1 minute
                        for (const [key, time] of this.reapplyLogThrottle.entries()) {
                          if (time < oldestAllowed) {
                            this.reapplyLogThrottle.delete(key);
                          }
                        }
                      }
                    }

                    this.domManipulator.applyChange(change, experimentName);

                    setTimeout(() => {
                      this.reapplyingElements.delete(element);
                    }, 0);
                  } else if (this.config.debug) {
                    logDebug(
                      '[MUTATION-NO-REAPPLY] Style mutation detected but no reapply needed',
                      {
                        experimentName,
                        selector: change.selector,
                      }
                    );
                  }
                }
              });
            }
          });
        }
      });
    });

    this.persistenceObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
      attributeOldValue: true,
    });

    if (this.config.debug) {
      logDebug('[PERSISTENCE-OBSERVER] Setup complete - now observing style mutations', {
        target: 'document.body',
        attributeFilter: ['style'],
        subtree: true,
        attributeOldValue: true,
        timestamp: Date.now(),
      });
    }
  }

  private checkStyleOverwritten(
    element: HTMLElement,
    expectedStyles: Record<string, string>
  ): boolean {
    for (const [prop, value] of Object.entries(expectedStyles)) {
      const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      const currentValue = element.style.getPropertyValue(cssProp);
      const currentPriority = element.style.getPropertyPriority(cssProp);

      if (currentValue !== value || (value.includes('!important') && !currentPriority)) {
        return true;
      }
    }
    return false;
  }
}
