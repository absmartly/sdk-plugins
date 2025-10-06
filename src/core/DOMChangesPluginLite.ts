/* eslint-disable @typescript-eslint/no-explicit-any */
import { PluginConfig, DOMChange, EventCallback, EventCallbackData } from '../types';
import { DOMManipulatorLite } from './DOMManipulatorLite';
import { VariantExtractor } from '../parsers/VariantExtractor';
import { StyleSheetManager } from './StyleSheetManager';
import { ExposureTracker } from './ExposureTracker';
import { logDebug, logExperimentSummary, logPerformance, DEBUG } from '../utils/debug';

export class DOMChangesPluginLite {
  public static readonly VERSION: string = '1.0.0-lite';

  protected config: Required<PluginConfig>;
  protected domManipulator: DOMManipulatorLite;
  protected variantExtractor: VariantExtractor;
  protected exposureTracker: ExposureTracker;
  protected mutationObserver: MutationObserver | null = null;
  protected exposedExperiments: Set<string> = new Set();
  protected eventListeners: Map<string, EventCallback[]> = new Map();
  protected styleManagers: Map<string, StyleSheetManager> = new Map();
  protected initialized = false;
  protected watchedElements: WeakMap<Element, Set<string>> = new WeakMap();
  protected persistenceObserver: MutationObserver | null = null;
  protected reapplyingElements: Set<Element> = new Set();
  protected reapplyLogThrottle: Map<string, number> = new Map();
  protected appliedStyleChanges: Map<string, DOMChange[]> = new Map();
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
      }

      if (this.config.autoApply) {
        await this.applyChanges();
      }

      this.initialized = true;

      this.registerWithContext();

      this.emit('initialized');

      const duration = performance.now() - startTime;
      logPerformance('Plugin initialization', duration);

      console.log(
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
    const observer = new MutationObserver(() => {
      // Check for pending changes that might now be applicable
      // Note: We don't have a centralized pending changes store in lite version,
      // the PendingChangeManager handles this internally
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.mutationObserver = observer;
  }

  async applyChanges(experimentName?: string): Promise<void> {
    const startTime = performance.now();

    logDebug('Starting to apply changes', {
      specificExperiment: experimentName || 'all',
      action: 'apply_start',
    });

    if (this.config.debug) {
      logDebug('[ABsmartly] === DOM Changes Application Starting ===');
      logDebug('[ABsmartly] Target:', experimentName || 'all experiments');
      logDebug('[ABsmartly] Context ready:', true);
    }

    try {
      await this.config.context.ready();
    } catch (error) {
      logDebug('[ABsmartly] Failed to wait for context ready:', error);
      return;
    }

    this.variantExtractor.clearCache();

    let changesMap: Map<string, DOMChange[]>;

    if (experimentName) {
      const changes = this.variantExtractor.getExperimentChanges(experimentName);
      changesMap = new Map(changes ? [[experimentName, changes]] : []);

      if (this.config.debug) {
        const variant = this.config.context.peek(experimentName);
        logDebug(`[ABsmartly] Single experiment '${experimentName}':`, {
          variant,
          hasChanges: !!changes,
          changeCount: changes?.length || 0,
        });
      }
    } else {
      const allVariants = this.variantExtractor.extractAllChanges();
      changesMap = new Map();

      logDebug(
        '[ABsmartly] All available experiments with DOM changes:',
        Array.from(allVariants.keys())
      );

      for (const [expName, variantMap] of allVariants) {
        const currentVariant = this.config.context.peek(expName);

        logDebug(`[ABsmartly] Experiment '${expName}':`, {
          assignedVariant: currentVariant || 0,
          availableVariants: Array.from(variantMap.keys()),
        });

        if (currentVariant) {
          const changes = variantMap.get(currentVariant);
          if (changes && changes.length > 0) {
            changesMap.set(expName, changes);
            logDebug(
              `[ABsmartly]   -> Will apply ${changes.length} changes for variant ${currentVariant}`
            );
          } else {
            logDebug(`[ABsmartly]   -> No changes found for variant ${currentVariant}`);
          }
        } else {
          logDebug(`[ABsmartly]   -> No variant assigned (control or not in experiment)`);
        }
      }
    }

    let totalApplied = 0;
    const experimentStats = new Map<string, { total: number; success: number; pending: number }>();

    logDebug('[ABsmartly] Experiments to process:', Array.from(changesMap.keys()));
    logDebug('[ABsmartly] Total experiments with changes:', changesMap.size);

    for (const [expName, changes] of changesMap) {
      const stats = { total: changes.length, success: 0, pending: 0 };

      logDebug(
        `[ABsmartly] Processing experiment '${expName}' with ${changes.length} changes:`,
        changes.map(c => ({
          type: c.type,
          selector: c.selector,
          trigger: c.trigger_on_view ? 'viewport' : 'immediate',
        }))
      );

      const currentVariant = this.config.context.peek(expName);
      const allVariantChanges = this.variantExtractor.getAllVariantChanges(expName);

      let hasImmediateTrigger = false;
      let hasViewportTrigger = false;

      for (const change of changes) {
        // Always call applyChange and let DOMManipulator handle the logic
        // It will register pending changes with PendingChangeManager when needed
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
          // Track pending changes for stats (but DOMManipulator already handles retries)
          try {
            const elements = document.querySelectorAll(change.selector);
            if (elements.length === 0 && (this.config.spa || change.waitForElement)) {
              stats.pending++;
              if (change.trigger_on_view) {
                hasViewportTrigger = true;
              }
            }
          } catch (error) {
            // Invalid selector, ignore
            if (this.config.debug) {
              logDebug(`[ABsmartly] Invalid selector: ${change.selector}`, error);
            }
          }
        }
      }

      if (hasViewportTrigger || hasImmediateTrigger) {
        this.exposureTracker.registerExperiment(
          expName,
          currentVariant || 0,
          changes,
          allVariantChanges
        );
      }

      if (hasImmediateTrigger && !hasViewportTrigger) {
        await this.config.context.ready();
        this.config.context.treatment(expName);
        this.exposedExperiments.add(expName);
        logDebug(`Triggered immediate exposure for experiment: ${expName}`);
      }

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
      this.applyChanges();
    }
  }

  destroy(): void {
    this.domManipulator.destroy();
    this.exposureTracker.destroy();

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
    this.appliedStyleChanges.clear();
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
        logDebug(`[ABsmartly] Anti-flicker fading in with transition: ${this.config.hideTransition}`);
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

    // Store the applied style change for this experiment
    if (!this.appliedStyleChanges.has(experimentName)) {
      this.appliedStyleChanges.set(experimentName, []);
    }
    const changes = this.appliedStyleChanges.get(experimentName)!;
    if (!changes.includes(change)) {
      changes.push(change);
    }

    if (!this.persistenceObserver) {
      this.setupPersistenceObserver();
    }

    if (this.config.debug) {
      logDebug('[ABsmartly] Watching element for style persistence', {
        experimentName,
        selector: change.selector,
        element: element.tagName,
      });
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

    this.persistenceObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        const element = mutation.target as Element;

        if (this.reapplyingElements.has(element)) {
          return;
        }

        const experiments = this.watchedElements.get(element);

        if (experiments) {
          if (this.config.debug) {
            logDebug('[ABsmartly] Style mutation detected on watched element', {
              element: element.tagName,
              selector: (element as HTMLElement).getAttribute('name') || element.className,
              oldValue: mutation.oldValue,
            });
          }

          experiments.forEach(experimentName => {
            const appliedChanges = this.appliedStyleChanges.get(experimentName);

            if (appliedChanges) {
              appliedChanges.forEach(change => {
                if (change.type === 'style' && element.matches(change.selector)) {
                  const needsReapply = this.checkStyleOverwritten(
                    element as HTMLElement,
                    change.value as Record<string, string>
                  );

                  if (needsReapply) {
                    this.reapplyingElements.add(element);

                    this.domManipulator.applyChange(change, experimentName);

                    const logKey = `${experimentName}-${change.selector}`;
                    const now = Date.now();
                    const lastLogged = this.reapplyLogThrottle.get(logKey) || 0;

                    if (this.config.debug && now - lastLogged > 5000) {
                      logDebug(
                        'Reapplied style after mutation (React/framework conflict detected)',
                        {
                          experimentName,
                          selector: change.selector,
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

                    setTimeout(() => {
                      this.reapplyingElements.delete(element);
                    }, 0);
                  } else if (this.config.debug) {
                    logDebug('[ABsmartly] Style mutation detected but no reapply needed', {
                      experimentName,
                      selector: change.selector,
                    });
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
      logDebug('[ABsmartly] Style persistence observer setup complete');
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
