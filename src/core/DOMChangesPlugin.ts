import {
  PluginConfig,
  AppliedChange,
  PendingChange,
  Overrides,
  InjectionData,
  ElementState,
  EventCallback,
  EventCallbackData,
  DOMChange,
} from '../types';
import { StateManager } from './StateManager';
import { DOMManipulator } from './DOMManipulator';
import { MessageBridge } from './MessageBridge';
import { CodeInjector } from '../injection/CodeInjector';
import { VariantExtractor } from '../parsers/VariantExtractor';
import { StyleSheetManager } from './StyleSheetManager';
import { ExposureTracker } from './ExposureTracker';
import {
  logDebug,
  logExperimentSummary,
  logVisibilityEvent,
  logPerformance,
  DEBUG,
} from '../utils/debug';

export class DOMChangesPlugin {
  public static readonly VERSION = '1.0.0';

  private config: Required<PluginConfig>;
  private stateManager: StateManager;
  private domManipulator: DOMManipulator;
  private messageBridge: MessageBridge | null = null;
  private codeInjector: CodeInjector;
  private variantExtractor: VariantExtractor;
  private exposureTracker: ExposureTracker;
  private mutationObserver: MutationObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;
  private persistenceObserver: MutationObserver | null = null;
  private exposedExperiments: Set<string> = new Set();
  private eventListeners: Map<string, EventCallback[]> = new Map();
  private styleManagers: Map<string, StyleSheetManager> = new Map();
  private watchedElements: WeakMap<Element, Set<string>> = new WeakMap();
  private initialized = false;

  constructor(config: PluginConfig) {
    this.config = {
      context: config.context,
      autoApply: config.autoApply ?? true,
      spa: config.spa ?? true,
      visibilityTracking: config.visibilityTracking ?? true,
      extensionBridge: config.extensionBridge ?? true,
      dataSource: config.dataSource ?? 'variable',
      dataFieldName: config.dataFieldName ?? '__dom_changes',
      overrideCookieName: config.overrideCookieName ?? 'absmartly_overrides',
      debug: config.debug ?? false,
    };

    if (!this.config.context) {
      throw new Error('[ABsmartly] Context is required');
    }

    // Initialize core components
    this.stateManager = new StateManager();
    this.domManipulator = new DOMManipulator(this.stateManager, this.config.debug, this);
    this.codeInjector = new CodeInjector(this.config.debug);
    this.variantExtractor = new VariantExtractor(
      this.config.context,
      this.config.dataSource,
      this.config.dataFieldName,
      this.config.debug
    );
    this.exposureTracker = new ExposureTracker(this.config.context, this.config.debug);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logDebug('Plugin already initialized');
      return;
    }

    const startTime = performance.now();
    logDebug('Initializing ABsmartly DOM Changes Plugin', {
      version: DOMChangesPlugin.VERSION,
      config: {
        autoApply: this.config.autoApply,
        spa: this.config.spa,
        visibilityTracking: this.config.visibilityTracking,
        extensionBridge: this.config.extensionBridge,
        dataSource: this.config.dataSource,
        DEBUG,
      },
    });

    try {
      // Apply cookie overrides to context
      if (this.config.overrideCookieName) {
        this.applyOverridesToContext();
      }

      // Set up extension bridge
      if (this.config.extensionBridge) {
        this.setupMessageBridge();
      }

      // Set up SPA support
      if (this.config.spa) {
        this.setupMutationObserver();
      }

      // Note: Visibility tracking is now handled by ExposureTracker
      // The old visibilityTracking config is kept for backward compatibility

      // Auto-apply changes if configured
      if (this.config.autoApply) {
        await this.applyChanges();
      }

      // Request injection code from extension
      if (this.config.extensionBridge && this.messageBridge) {
        this.messageBridge.requestInjectionCode();
      }

      this.initialized = true;

      // Register plugin with context for detection by extension
      this.registerWithContext();

      this.emit('initialized');

      const duration = performance.now() - startTime;
      logPerformance('Plugin initialization', duration);

      if (this.config.debug) {
        console.log('[ABsmartly] DOM Changes Plugin initialized');
      }
    } catch (error) {
      console.error('[ABsmartly] Failed to initialize plugin:', error);
      throw error;
    }
  }

  private setupMessageBridge(): void {
    this.messageBridge = new MessageBridge(this.config.debug);

    // Handle apply changes
    this.messageBridge.on('APPLY_CHANGES', payload => {
      this.applyChanges(payload.experimentName);
    });

    // Handle remove changes
    this.messageBridge.on('REMOVE_CHANGES', payload => {
      this.removeChanges(payload.experimentName);
    });

    // Handle injection code
    this.messageBridge.on('INJECTION_CODE', payload => {
      const injectionData: InjectionData = {
        headStart: payload.headStart,
        headEnd: payload.headEnd,
        bodyStart: payload.bodyStart,
        bodyEnd: payload.bodyEnd,
      };
      this.injectCode(injectionData);
    });

    // Handle override updates
    this.messageBridge.on('UPDATE_OVERRIDES', payload => {
      if (payload.overrides) {
        this.setOverrideCookie(payload.overrides);
        this.applyOverridesToContext();
        this.refreshChanges();
      }
    });

    // Handle data requests
    this.messageBridge.on('GET_OVERRIDES', () => {
      const overrides = this.getOverridesFromCookie();
      this.messageBridge?.sendOverridesData(overrides);
    });

    this.messageBridge.on('GET_EXPERIMENTS', () => {
      const experiments = this.config.context.data()?.experiments || [];
      this.messageBridge?.sendExperimentData(experiments);
    });

    // Notify extension that plugin is ready
    this.messageBridge.notifyReady(DOMChangesPlugin.VERSION, [
      'overrides',
      'injection',
      'spa',
      'visibility',
    ]);
  }

  private setupMutationObserver(): void {
    const observer = new MutationObserver(() => {
      // Check for pending changes that might now be applicable
      const pending = this.stateManager.getPendingChanges();
      if (pending.length === 0) return;

      for (const pendingChange of pending) {
        const elements = document.querySelectorAll(pendingChange.change.selector);
        if (elements.length > 0) {
          const success = this.domManipulator.applyChange(
            pendingChange.change,
            pendingChange.experimentName
          );

          if (success) {
            this.stateManager.removePendingChange(
              pendingChange.experimentName,
              pendingChange.change
            );
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.mutationObserver = observer;
  }

  // Legacy method - exposure tracking now handled by ExposureTracker
  private setupVisibilityObserver(): void {
    // Deprecated - kept for backward compatibility
    // ExposureTracker now handles all viewport-based exposure tracking
  }

  async applyChanges(experimentName?: string): Promise<void> {
    const startTime = performance.now();

    logDebug('Starting to apply changes', {
      specificExperiment: experimentName || 'all',
      action: 'apply_start',
    });

    const changesMap = experimentName
      ? new Map([
          [experimentName, this.variantExtractor.getExperimentChanges(experimentName) || []],
        ])
      : this.variantExtractor.extractAllChanges();

    let totalApplied = 0;
    const experimentStats = new Map<string, { total: number; success: number; pending: number }>();

    for (const [expName, changes] of changesMap) {
      const stats = { total: changes.length, success: 0, pending: 0 };

      logDebug(`Applying changes for experiment: ${expName}`, {
        experimentName: expName,
        totalChanges: changes.length,
      });

      // Get the current variant for this experiment
      const currentVariant = this.config.context.peek(expName);
      if (currentVariant === undefined || currentVariant === null) {
        logDebug(`No variant selected for experiment: ${expName}`);
        continue;
      }

      // Get ALL variant changes for exposure tracking
      const allVariantChanges = this.variantExtractor.getAllVariantChanges(expName);
      
      // Track what types of triggers we have
      let hasImmediateTrigger = false;
      let hasViewportTrigger = false;

      for (const change of changes) {
        const elements = document.querySelectorAll(change.selector);

        if (elements.length === 0 && change.type !== 'create') {
          // Element not found, add to pending if SPA mode or waitForElement
          if (this.config.spa || change.waitForElement) {
            this.stateManager.addPendingChange(expName, change);
            stats.pending++;
            
            // Still need to track for exposure if trigger_on_view
            if (change.trigger_on_view) {
              hasViewportTrigger = true;
            }
          }
        } else {
          const success = this.domManipulator.applyChange(change, expName);
          if (success) {
            totalApplied++;
            stats.success++;

            // Determine trigger type
            if (change.trigger_on_view) {
              hasViewportTrigger = true;
            } else {
              hasImmediateTrigger = true;
            }
          }
        }
      }

      // Set up exposure tracking for this experiment
      if (hasViewportTrigger || hasImmediateTrigger) {
        this.exposureTracker.registerExperiment(
          expName,
          currentVariant,
          changes,
          allVariantChanges
        );
      }

      // If there are only immediate triggers (no viewport tracking), trigger exposure now
      if (hasImmediateTrigger && !hasViewportTrigger) {
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

    this.emit('changes-applied', { count: totalApplied, experimentName });
    this.messageBridge?.notifyChangesApplied(totalApplied, experimentName);
  }

  removeChanges(experimentName?: string): AppliedChange[] {
    const startTime = performance.now();
    let removedChanges: AppliedChange[] = [];

    logDebug('Starting to remove changes', {
      specificExperiment: experimentName || 'all',
      action: 'remove_start',
    });

    if (experimentName) {
      // Call the fixed method that handles all changes for an experiment
      removedChanges = this.domManipulator.removeChanges(experimentName);
    } else {
      // Remove all changes
      removedChanges = this.domManipulator.removeAllChanges();
    }

    const duration = performance.now() - startTime;
    logPerformance('Remove changes', duration, {
      changesRemoved: removedChanges.length,
    });

    // Log removed changes for debugging
    if (this.config.debug) {
      console.log(`[ABsmartly] Removed ${removedChanges.length} changes`, removedChanges);
    }

    this.emit('changes-removed', { experimentName, removedChanges });
    this.messageBridge?.notifyChangesRemoved(experimentName);

    return removedChanges;
  }

  refreshChanges(): void {
    this.removeChanges();
    this.applyChanges();
  }

  getOverridesFromCookie(): Overrides {
    const name = this.config.overrideCookieName + '=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookies = decodedCookie.split(';');

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(name) === 0) {
        const value = cookie.substring(name.length);
        try {
          return JSON.parse(value);
        } catch (error) {
          console.error('[ABsmartly] Failed to parse overrides cookie:', error);
        }
      }
    }

    return {};
  }

  private setOverrideCookie(overrides: Overrides): void {
    const value = JSON.stringify(overrides);
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days

    document.cookie = `${this.config.overrideCookieName}=${value}; expires=${expires.toUTCString()}; path=/`;
  }

  applyOverridesToContext(): void {
    const overrides = this.getOverridesFromCookie();

    for (const [experimentName, variantIndex] of Object.entries(overrides)) {
      this.config.context.override(experimentName, variantIndex);

      if (this.config.debug) {
        console.log(`[ABsmartly] Applied override: ${experimentName} -> variant ${variantIndex}`);
      }
    }
  }

  injectCode(data: InjectionData): void {
    const locations = this.codeInjector.inject(data);
    this.emit('code-injected', { locations });
    this.messageBridge?.notifyCodeInjected(locations);
  }

  requestInjectionCode(): void {
    this.messageBridge?.requestInjectionCode();
  }

  getPendingChanges(): PendingChange[] {
    return this.stateManager.getPendingChanges();
  }

  hasChanges(experimentName: string): boolean {
    return this.stateManager.hasChanges(experimentName);
  }

  getOriginalState(selector: string): ElementState | undefined {
    // Try to find the state from any change type
    const types = ['text', 'html', 'style', 'class', 'attribute', 'move'];
    for (const type of types) {
      const state = this.stateManager.getOriginalState(selector, type);
      if (state) {
        return state;
      }
    }
    return undefined;
  }

  removeSpecificChange(experimentName: string, selector: string, changeType: string): boolean {
    return this.domManipulator.removeSpecificChange(experimentName, selector, changeType);
  }

  /**
   * Apply a single DOM change
   * This is the main method extensions should use to apply individual changes
   */
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
        console.error('[ABsmartly] Error applying change:', error);
      }
      return false;
    }
  }

  /**
   * Remove all changes for a specific experiment
   * Delegates to the existing removeChanges method
   */
  removeAllChanges(experimentName?: string): AppliedChange[] {
    return this.removeChanges(experimentName);
  }

  /**
   * Get applied changes for a specific experiment
   * Overrides the existing method to support filtering by experiment
   */
  getAppliedChanges(experimentName?: string): AppliedChange[] {
    if (experimentName) {
      return this.stateManager.getAppliedChanges(experimentName);
    }
    return this.stateManager.getAppliedChanges();
  }

  /**
   * Revert a specific applied change
   * Useful for undo functionality
   */
  revertChange(appliedChange: AppliedChange): boolean {
    try {
      return this.domManipulator.revertChange(appliedChange);
    } catch (error) {
      if (this.config.debug) {
        console.error('[ABsmartly] Error reverting change:', error);
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

  private emit(event: string, data?: EventCallbackData): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[ABsmartly] Error in event listener for ${event}:`, error);
      }
    });
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

  setupPersistenceObserver(): void {
    if (this.persistenceObserver) return;

    this.persistenceObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        const element = mutation.target as Element;
        const experiments = this.watchedElements.get(element);

        if (experiments) {
          // Check each experiment's changes for this element
          experiments.forEach(experimentName => {
            const appliedChanges = this.stateManager.getAppliedChanges(experimentName);

            appliedChanges.forEach(({ change }) => {
              if (change.type === 'style' && element.matches(change.selector)) {
                // Check if inline styles were overwritten
                const needsReapply = this.checkStyleOverwritten(
                  element as HTMLElement,
                  change.value as Record<string, string>
                );

                if (needsReapply) {
                  // Reapply the change
                  this.domManipulator.applyChange(change, experimentName);
                  logDebug('Reapplied style after mutation', {
                    experimentName,
                    selector: change.selector,
                  });
                }
              }
            });
          });
        }
      });
    });

    // Observe only style attribute changes
    this.persistenceObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
      attributeOldValue: true,
    });
  }

  private checkStyleOverwritten(
    element: HTMLElement,
    expectedStyles: Record<string, string>
  ): boolean {
    for (const [prop, value] of Object.entries(expectedStyles)) {
      const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      const currentValue = element.style.getPropertyValue(cssProp);
      const currentPriority = element.style.getPropertyPriority(cssProp);

      // Check if the value was changed or priority was removed
      if (currentValue !== value || (value.includes('!important') && !currentPriority)) {
        return true;
      }
    }
    return false;
  }

  watchElement(element: Element, experimentName: string): void {
    let experiments = this.watchedElements.get(element);
    if (!experiments) {
      experiments = new Set();
      this.watchedElements.set(element, experiments);
    }
    experiments.add(experimentName);

    // Ensure persistence observer is running
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

  destroy(): void {
    // Clean up all resources
    this.removeChanges();
    this.codeInjector.cleanup();
    this.stateManager.clearAll();

    // Clean up DOM manipulator (includes pending manager)
    this.domManipulator.destroy();
    
    // Clean up exposure tracker
    this.exposureTracker.destroy();

    // Clean up style managers
    this.styleManagers.forEach(manager => manager.destroy());
    this.styleManagers.clear();

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }

    if (this.persistenceObserver) {
      this.persistenceObserver.disconnect();
      this.persistenceObserver = null;
    }

    if (this.messageBridge) {
      this.messageBridge.destroy();
      this.messageBridge = null;
    }

    this.eventListeners.clear();
    this.exposedExperiments.clear();
    this.watchedElements = new WeakMap();

    // Unregister from context
    this.unregisterFromContext();

    this.initialized = false;

    if (this.config.debug) {
      console.log('[ABsmartly] DOM Changes Plugin destroyed');
    }
  }

  private registerWithContext(): void {
    if (this.config.context) {
      // Register plugin with context for discovery
      this.config.context.__domPlugin = {
        version: DOMChangesPlugin.VERSION,
        initialized: true,
        capabilities: ['overrides', 'injection', 'spa', 'visibility'],
        instance: this,
        timestamp: Date.now(),
      };

      if (this.config.debug) {
        console.log('[ABsmartly] Plugin registered with context');
      }
    }
  }

  private unregisterFromContext(): void {
    if (this.config.context && this.config.context.__domPlugin) {
      delete this.config.context.__domPlugin;

      if (this.config.debug) {
        console.log('[ABsmartly] Plugin unregistered from context');
      }
    }
  }
}
