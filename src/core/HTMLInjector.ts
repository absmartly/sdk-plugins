import { InjectionItem, InjectionLocation, InjectionDataWithFilter } from '../types';
import { logDebug } from '../utils/debug';
import { URLMatcher } from '../utils/URLMatcher';

export class HTMLInjector {
  private debug: boolean;
  private injectedIds: Set<string> = new Set();

  constructor(debug = false) {
    this.debug = debug;
  }

  parseInjectionKey(key: string): { location: InjectionLocation; priority: number } | null {
    const validLocations: InjectionLocation[] = ['headStart', 'headEnd', 'bodyStart', 'bodyEnd'];

    for (const location of validLocations) {
      if (key === location) {
        return { location, priority: 0 };
      }

      if (key.startsWith(location)) {
        const priorityStr = key.substring(location.length);
        const priority = parseInt(priorityStr, 10);

        if (!isNaN(priority)) {
          return { location, priority };
        }
      }
    }

    if (this.debug) {
      logDebug('[HTMLInjector] Invalid injection key:', key);
    }

    return null;
  }

  collectInjections(
    allInjectHTML: Map<string, Map<number, InjectionDataWithFilter>>,
    currentUrl: string = window.location.href
  ): Map<InjectionLocation, InjectionItem[]> {
    const injectionsByLocation = new Map<InjectionLocation, InjectionItem[]>();

    for (const [experimentName, variantMap] of allInjectHTML) {
      for (const [variantIndex, dataWithFilter] of variantMap) {
        if (!dataWithFilter || typeof dataWithFilter !== 'object') {
          if (this.debug) {
            logDebug(
              `[HTMLInjector] Invalid injection data for ${experimentName} variant ${variantIndex}:`,
              dataWithFilter
            );
          }
          continue;
        }

        // Check URL filter if present
        if (dataWithFilter.urlFilter) {
          const matches = URLMatcher.matches(dataWithFilter.urlFilter, currentUrl);

          if (!matches) {
            if (this.debug) {
              logDebug(
                `[HTMLInjector] Skipping ${experimentName} variant ${variantIndex} - URL filter doesn't match:`,
                {
                  currentUrl,
                  urlFilter: dataWithFilter.urlFilter,
                }
              );
            }
            continue;
          }
        }

        const rawData = dataWithFilter.data;

        if (!rawData || typeof rawData !== 'object') {
          if (this.debug) {
            logDebug(
              `[HTMLInjector] Invalid injection data for ${experimentName} variant ${variantIndex}:`,
              rawData
            );
          }
          continue;
        }

        for (const [key, code] of Object.entries(rawData)) {
          if (typeof code !== 'string') {
            if (this.debug) {
              logDebug(`[HTMLInjector] Skipping non-string injection code for key ${key}:`, code);
            }
            continue;
          }

          const parsed = this.parseInjectionKey(key);

          if (parsed) {
            const item: InjectionItem = {
              code,
              priority: parsed.priority,
              location: parsed.location,
            };

            if (!injectionsByLocation.has(parsed.location)) {
              injectionsByLocation.set(parsed.location, []);
            }

            injectionsByLocation.get(parsed.location)!.push(item);

            if (this.debug) {
              logDebug(`[HTMLInjector] Collected injection:`, {
                experiment: experimentName,
                variant: variantIndex,
                location: parsed.location,
                priority: parsed.priority,
                codeLength: code.length,
              });
            }
          }
        }
      }
    }

    for (const [location, items] of injectionsByLocation) {
      items.sort((a, b) => b.priority - a.priority);

      if (this.debug) {
        logDebug(`[HTMLInjector] Sorted ${location} injections by priority:`, {
          location,
          count: items.length,
          priorities: items.map(item => item.priority),
        });
      }
    }

    return injectionsByLocation;
  }

  inject(injectionsByLocation: Map<InjectionLocation, InjectionItem[]>): void {
    for (const [location, items] of injectionsByLocation) {
      // For headStart and bodyStart, we insert at the beginning (firstChild)
      // Each insertion pushes previous ones down, so we need to reverse
      // to maintain priority order (higher priority = earlier in DOM)
      const orderedItems = location === 'headStart' || location === 'bodyStart'
        ? [...items].reverse()
        : items;

      for (const item of orderedItems) {
        this.injectAtLocation(location, item.code);
      }
    }

    if (this.debug) {
      logDebug('[HTMLInjector] All injections complete');
    }
  }

  private injectAtLocation(location: InjectionLocation, code: string): void {
    const injectionId = `absmartly-inject-${location}-${Date.now()}-${Math.random()}`;

    if (this.injectedIds.has(injectionId)) {
      return;
    }

    try {
      switch (location) {
        case 'headStart':
          this.injectHeadStart(code, injectionId);
          break;
        case 'headEnd':
          this.injectHeadEnd(code, injectionId);
          break;
        case 'bodyStart':
          this.injectBodyStart(code, injectionId);
          break;
        case 'bodyEnd':
          this.injectBodyEnd(code, injectionId);
          break;
      }

      this.injectedIds.add(injectionId);

      if (this.debug) {
        logDebug(`[HTMLInjector] Injected at ${location}:`, {
          location,
          codeLength: code.length,
          injectionId,
        });
      }
    } catch (error) {
      if (this.debug) {
        logDebug(`[HTMLInjector] Error injecting at ${location}:`, error);
      }
    }
  }

  private injectHeadStart(code: string, id: string): void {
    if (!document.head) {
      if (this.debug) {
        logDebug('[HTMLInjector] <head> element not found for headStart injection');
      }
      return;
    }

    const container = this.createContainer(code, id);
    document.head.insertBefore(container, document.head.firstChild);
  }

  private injectHeadEnd(code: string, id: string): void {
    if (!document.head) {
      if (this.debug) {
        logDebug('[HTMLInjector] <head> element not found for headEnd injection');
      }
      return;
    }

    const container = this.createContainer(code, id);
    document.head.appendChild(container);
  }

  private injectBodyStart(code: string, id: string): void {
    if (!document.body) {
      if (this.debug) {
        logDebug('[HTMLInjector] <body> element not found for bodyStart injection');
      }
      return;
    }

    const container = this.createContainer(code, id);
    document.body.insertBefore(container, document.body.firstChild);
  }

  private injectBodyEnd(code: string, id: string): void {
    if (!document.body) {
      if (this.debug) {
        logDebug('[HTMLInjector] <body> element not found for bodyEnd injection');
      }
      return;
    }

    const container = this.createContainer(code, id);
    document.body.appendChild(container);
  }

  private createContainer(code: string, id: string): HTMLElement {
    const container = document.createElement('div');
    container.id = id;
    container.setAttribute('data-absmartly-injection', 'true');
    container.innerHTML = code;

    return container;
  }

  destroy(): void {
    for (const id of this.injectedIds) {
      const element = document.getElementById(id);
      if (element) {
        element.remove();
      }
    }

    this.injectedIds.clear();

    if (this.debug) {
      logDebug('[HTMLInjector] Destroyed and cleaned up all injections');
    }
  }
}
