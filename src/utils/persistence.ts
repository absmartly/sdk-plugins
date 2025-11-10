import { logDebug } from './debug';
import type { DOMChange } from '../types';

export interface PersistenceConfig {
  debug?: boolean;
  onReapply: (change: DOMChange, experimentName: string) => void;
}

export class DOMPersistenceManager {
  private watchedElements: WeakMap<Element, Set<string>> = new WeakMap();
  private persistenceObserver: MutationObserver | null = null;
  private reapplyingElements: Set<Element> = new Set();
  private reapplyLogThrottle: Map<string, number> = new Map();
  private appliedChanges: Map<string, DOMChange[]> = new Map();
  private config: PersistenceConfig;

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  watchElement(element: Element, experimentName: string, change: DOMChange): void {
    let experiments = this.watchedElements.get(element);
    if (!experiments) {
      experiments = new Set();
      this.watchedElements.set(element, experiments);
    }
    experiments.add(experimentName);

    if (!this.appliedChanges.has(experimentName)) {
      this.appliedChanges.set(experimentName, []);
    }
    const changes = this.appliedChanges.get(experimentName)!;
    const isNewWatch = !changes.includes(change);
    if (isNewWatch) {
      changes.push(change);

      if (this.config.debug) {
        const currentStyles: Record<string, string> = {};
        if (change.value && typeof change.value === 'object') {
          Object.keys(change.value).forEach(prop => {
            const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            currentStyles[cssProp] = (element as HTMLElement).style.getPropertyValue(cssProp);
          });
        }
        logDebug('[WATCH-ELEMENT] Started watching element for persistence', {
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

  unwatchExperiment(experimentName: string): void {
    this.appliedChanges.delete(experimentName);
  }

  getAppliedChanges(): Map<string, DOMChange[]> {
    return this.appliedChanges;
  }

  clearAll(): void {
    this.appliedChanges.clear();
  }

  destroy(): void {
    if (this.persistenceObserver) {
      this.persistenceObserver.disconnect();
      this.persistenceObserver = null;
    }
    this.appliedChanges.clear();
    this.reapplyingElements.clear();
    this.reapplyLogThrottle.clear();
  }

  private setupPersistenceObserver(): void {
    if (this.persistenceObserver) return;

    if (this.config.debug) {
      logDebug('[PERSISTENCE-OBSERVER] Setting up persistence observer', {
        timestamp: Date.now(),
      });
    }

    this.persistenceObserver = new MutationObserver(mutations => {
      if (this.config.debug) {
        logDebug('[MUTATION-DETECTED] Persistence observer detected mutations', {
          mutationCount: mutations.length,
          timestamp: Date.now(),
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
          if (this.config.debug) {
            const elementKey = `mutation:${element.tagName}:${
              (element as HTMLElement).getAttribute('name') || element.className
            }`;
            const now = Date.now();
            const lastLogged = this.reapplyLogThrottle.get(elementKey) || 0;

            if (now - lastLogged > 5000) {
              logDebug('[MUTATION-ON-WATCHED] Mutation detected on watched element', {
                element: element.tagName,
                attributeName: mutation.attributeName,
                oldValue: mutation.oldValue,
                experiments: Array.from(experiments),
              });
              this.reapplyLogThrottle.set(elementKey, now);
            }
          }

          experiments.forEach(experimentName => {
            const appliedChanges = this.appliedChanges.get(experimentName);

            if (appliedChanges) {
              appliedChanges.forEach(change => {
                let needsReapply = false;

                if (
                  change.type === 'style' &&
                  mutation.attributeName === 'style' &&
                  change.persistStyle !== false
                ) {
                  needsReapply = this.checkStyleOverwritten(
                    element as HTMLElement,
                    change.value as Record<string, string>
                  );
                } else if (change.type === 'attribute' && change.persistAttribute !== false) {
                  if (change.value && typeof change.value === 'object') {
                    for (const attrName of Object.keys(change.value)) {
                      if (mutation.attributeName === attrName) {
                        needsReapply = this.checkAttributeOverwritten(
                          element,
                          change.value as Record<string, string>
                        );
                        break;
                      }
                    }
                  }
                }

                if (needsReapply) {
                  this.reapplyingElements.add(element);

                  const logKey = `${experimentName}-${change.selector}`;
                  const now = Date.now();
                  const lastLogged = this.reapplyLogThrottle.get(logKey) || 0;

                  if (this.config.debug && now - lastLogged > 5000) {
                    logDebug(
                      '[REAPPLY-TRIGGERED] Reapplying after mutation (React/framework conflict detected)',
                      {
                        experimentName,
                        selector: change.selector,
                        element: element.tagName,
                        changeType: change.type,
                        timestamp: now,
                      }
                    );
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

                  this.config.onReapply(change, experimentName);

                  setTimeout(() => {
                    this.reapplyingElements.delete(element);
                  }, 0);
                }
              });
            }
          });
        }
      });
    });

    this.persistenceObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeOldValue: true,
    });

    if (this.config.debug) {
      logDebug('[PERSISTENCE-OBSERVER] Setup complete - now observing mutations', {
        target: 'document.body',
        attributeFilter: ['style', 'class'],
        subtree: true,
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

  private checkAttributeOverwritten(
    element: Element,
    expectedAttributes: Record<string, string>
  ): boolean {
    for (const [attr, value] of Object.entries(expectedAttributes)) {
      const currentValue = element.getAttribute(attr);
      if (currentValue !== value) {
        return true;
      }
    }
    return false;
  }
}
