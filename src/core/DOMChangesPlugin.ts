/* eslint-disable @typescript-eslint/no-explicit-any */
import { PluginConfig, AppliedChange, PendingChange, InjectionData, ElementState } from '../types';
import { StateManager } from './StateManager';
import { DOMManipulator } from './DOMManipulator';
import { MessageBridge } from './MessageBridge';
import { CodeInjector } from '../injection/CodeInjector';
import { DOMChangesPluginLite } from './DOMChangesPluginLite';
import { logDebug } from '../utils/debug';

export class DOMChangesPlugin extends DOMChangesPluginLite {
  public static readonly VERSION = '1.0.1';

  private stateManager: StateManager;
  private fullDomManipulator: DOMManipulator;
  private messageBridge: MessageBridge | null = null;
  private codeInjector: CodeInjector;
  private persistenceObserver: MutationObserver | null = null;
  private watchedElements: WeakMap<Element, Set<string>> = new WeakMap();
  private reapplyingElements = new WeakSet<Element>();
  private reapplyLogThrottle = new Map<string, number>();

  constructor(config: PluginConfig) {
    // Call parent constructor with extensionBridge disabled
    super({ ...config, extensionBridge: false });

    // Initialize full-version components
    this.stateManager = new StateManager();
    this.fullDomManipulator = new DOMManipulator(this.stateManager, this.config.debug, this);
    this.codeInjector = new CodeInjector(this.config.debug);

    // Override domManipulator with the full version
    this.domManipulator = this.fullDomManipulator as any;

    // Update config to respect extensionBridge setting
    this.config = {
      ...this.config,
      extensionBridge: config.extensionBridge ?? true,
    };
  }

  override async ready(): Promise<void> {
    if (this.initialized) {
      logDebug('Plugin already initialized');
      return;
    }

    const startTime = performance.now();
    logDebug('Initializing ABsmartly DOM Changes Plugin (Full)', {
      version: DOMChangesPlugin.VERSION,
      config: {
        autoApply: this.config.autoApply,
        spa: this.config.spa,
        visibilityTracking: this.config.visibilityTracking,
        extensionBridge: this.config.extensionBridge,
        dataSource: this.config.dataSource,
      },
    });

    try {
      // Set up extension bridge
      if (this.config.extensionBridge) {
        this.setupMessageBridge();
      }

      // Call parent ready() which sets up SPA, applies changes, etc.
      await super.ready();

      // Request injection code from extension
      if (this.config.extensionBridge && this.messageBridge) {
        this.messageBridge.requestInjectionCode();
      }

      const duration = performance.now() - startTime;

      console.log(`[ABsmartly] DOM plugin loaded successfully (v${DOMChangesPlugin.VERSION})`);

      if (this.config.debug) {
        logDebug('[ABsmartly] DOM Changes Plugin (Full) initialized', { duration });
      }
    } catch (error) {
      logDebug('[ABsmartly] Failed to initialize plugin:', error);
      throw error;
    }
  }

  private setupMessageBridge(): void {
    this.messageBridge = new MessageBridge(this.config.debug);

    this.messageBridge.on('APPLY_CHANGES', payload => {
      this.applyChanges(payload.experimentName);
    });

    this.messageBridge.on('REMOVE_CHANGES', payload => {
      this.removeChanges(payload.experimentName);
    });

    this.messageBridge.on('INJECTION_CODE', payload => {
      const injectionData: InjectionData = {
        headStart: payload.headStart,
        headEnd: payload.headEnd,
        bodyStart: payload.bodyStart,
        bodyEnd: payload.bodyEnd,
      };
      this.injectCode(injectionData);
    });

    this.messageBridge.on('GET_EXPERIMENTS', async () => {
      await this.config.context.ready();
      const experiments = this.config.context.data()?.experiments || [];
      this.messageBridge?.sendExperimentData(experiments);
    });

    this.messageBridge.notifyReady(DOMChangesPlugin.VERSION, [
      'overrides',
      'injection',
      'spa',
      'visibility',
    ]);
  }

  removeChanges(experimentName?: string): AppliedChange[] {
    let removedChanges: AppliedChange[] = [];

    logDebug('Starting to remove changes', {
      specificExperiment: experimentName || 'all',
      action: 'remove_start',
    });

    if (experimentName) {
      removedChanges = this.fullDomManipulator.removeChanges(experimentName);
    } else {
      removedChanges = this.fullDomManipulator.removeAllChanges();
    }

    if (this.config.debug) {
      logDebug(`[ABsmartly] Removed ${removedChanges.length} changes`, removedChanges);
    }

    this.emit('changes-removed', { experimentName, removedChanges });
    this.messageBridge?.notifyChangesRemoved(experimentName);

    return removedChanges;
  }

  refreshChanges(): void {
    this.removeChanges();
    this.applyChanges();
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

  getOriginalState(selector: string): ElementState | undefined {
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
    return this.fullDomManipulator.removeSpecificChange(experimentName, selector, changeType);
  }

  removeAllChanges(experimentName?: string): AppliedChange[] {
    return this.removeChanges(experimentName);
  }

  getAppliedChanges(experimentName?: string): AppliedChange[] {
    if (experimentName) {
      return this.stateManager.getAppliedChanges(experimentName);
    }
    return this.stateManager.getAppliedChanges();
  }

  revertChange(appliedChange: AppliedChange): boolean {
    try {
      return this.fullDomManipulator.revertChange(appliedChange);
    } catch (error) {
      if (this.config.debug) {
        logDebug('[ABsmartly] Error reverting change:', error);
      }
      return false;
    }
  }

  setupPersistenceObserver(): void {
    if (this.persistenceObserver) return;

    this.persistenceObserver = new MutationObserver(mutations => {
      const isModifying = (window as any).__absmartlyVisualEditorModifying;

      if (isModifying) {
        logDebug('Skipping style persistence - visual editor is modifying DOM', {
          mutationCount: mutations.length,
        });
        return;
      }

      mutations.forEach(mutation => {
        const element = mutation.target as Element;

        if (this.reapplyingElements.has(element)) {
          return;
        }

        const experiments = this.watchedElements.get(element);

        if (experiments) {
          experiments.forEach(experimentName => {
            const appliedChanges = this.stateManager.getAppliedChanges(experimentName);

            appliedChanges.forEach(({ change }) => {
              if (change.type === 'style' && element.matches(change.selector)) {
                const needsReapply = this.checkStyleOverwritten(
                  element as HTMLElement,
                  change.value as Record<string, string>
                );

                if (needsReapply) {
                  const isModifyingNow = (window as any).__absmartlyVisualEditorModifying;

                  if (isModifyingNow) {
                    logDebug('Skipping style reapplication - visual editor is modifying DOM', {
                      selector: change.selector,
                    });
                    return;
                  }

                  this.reapplyingElements.add(element);

                  this.fullDomManipulator.applyChange(change, experimentName);

                  const logKey = `${experimentName}-${change.selector}`;
                  const now = Date.now();
                  const lastLogged = this.reapplyLogThrottle.get(logKey) || 0;

                  if (this.config.debug && now - lastLogged > 5000) {
                    logDebug('Reapplied style after mutation (React/framework conflict detected)', {
                      experimentName,
                      selector: change.selector,
                      note: 'This happens when the page framework (React/Vue/etc) fights with DOM changes',
                    });
                    this.reapplyLogThrottle.set(logKey, now);

                    if (this.reapplyLogThrottle.size > 100) {
                      const oldestAllowed = now - 60000;
                      for (const [key, time] of this.reapplyLogThrottle.entries()) {
                        if (time < oldestAllowed) {
                          this.reapplyLogThrottle.delete(key);
                        }
                      }
                    }
                  }

                  Promise.resolve().then(() => {
                    this.reapplyingElements.delete(element);
                  });
                }
              }
            });
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

  watchElement(element: Element, experimentName: string): void {
    let experiments = this.watchedElements.get(element);
    if (!experiments) {
      experiments = new Set();
      this.watchedElements.set(element, experiments);
    }
    experiments.add(experimentName);

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

  override destroy(): void {
    this.removeChanges();
    this.codeInjector.cleanup();
    this.stateManager.clearAll();

    if (this.persistenceObserver) {
      this.persistenceObserver.disconnect();
      this.persistenceObserver = null;
    }

    if (this.messageBridge) {
      this.messageBridge.destroy();
      this.messageBridge = null;
    }

    this.watchedElements = new WeakMap();

    super.destroy();

    if (this.config.debug) {
      logDebug('[ABsmartly] DOM Changes Plugin (Full) destroyed');
    }
  }

  protected override registerWithContext(): void {
    if (this.config.context) {
      if (!this.config.context.__plugins) {
        this.config.context.__plugins = {};
      }

      this.config.context.__plugins.domPlugin = {
        name: 'DOMChangesPlugin',
        version: DOMChangesPlugin.VERSION,
        initialized: true,
        capabilities: ['overrides', 'injection', 'spa', 'visibility'],
        instance: this,
        timestamp: Date.now(),
      };

      this.config.context.__domPlugin = this.config.context.__plugins.domPlugin;

      if (this.config.debug) {
        logDebug('[ABsmartly] DOMChangesPlugin registered with context at __plugins.domPlugin');
      }
    }
  }
}
