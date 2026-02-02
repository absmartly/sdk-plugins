/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChange } from '../types';
import { logDebug, logChangeApplication } from '../utils/debug';
import type { DOMChangesPluginLite } from './DOMChangesPluginLite';
import { PendingChangeManager } from './PendingChangeManager';

export class DOMManipulatorLite {
  protected debug: boolean;
  protected plugin: DOMChangesPluginLite;
  protected pendingManager: PendingChangeManager;
  private appliedChanges: Map<string, Set<string>> = new Map();

  constructor(debug = false, plugin: DOMChangesPluginLite) {
    this.debug = debug;
    this.plugin = plugin;

    this.pendingManager = new PendingChangeManager((change, experimentName, element) => {
      if (element) {
        return this.applyChangeToSpecificElement(change, experimentName, element as HTMLElement);
      }
      return this.applyChange(change, experimentName);
    }, debug);
  }

  applyChange(change: DOMChange, experimentName: string): boolean {
    if (!change.enabled && change.enabled !== undefined) {
      logDebug(`Skipping disabled change for experiment: ${experimentName}`, {
        experimentName,
        selector: change.selector,
        changeType: change.type,
      });
      return false;
    }

    const isReapplying =
      !!(this.plugin as any).reapplyingElements &&
      Array.from((this.plugin as any).reapplyingElements).length > 0;

    // Get user's variant for this experiment
    const userVariant = (this.plugin as any).config?.context?.peek(experimentName);

    if (this.debug) {
      logDebug(
        `[DOM-APPLY] [${experimentName}] ${isReapplying ? 'RE-APPLYING' : 'APPLYING'} change`,
        {
          experimentName,
          userVariant,
          selector: change.selector,
          type: change.type,
          timestamp: Date.now(),
          callStack: new Error().stack?.split('\n').slice(2, 4).join('\n'),
        }
      );
    }

    try {
      if (change.type === 'styleRules') {
        return this.applyStyleRules(change, experimentName);
      }

      // Handle create changes separately as they don't require a selector
      if (change.type === 'create') {
        if (change.element && change.targetSelector) {
          const created = this.createElement(change, experimentName);
          if (created) {
            this.trackAppliedChange(experimentName, change);
            logChangeApplication(experimentName, change.targetSelector, change.type, 1, true);
            return true;
          }
        }
        return false;
      }

      const elements = document.querySelectorAll(change.selector);
      const appliedElements: Element[] = [];

      if (elements.length === 0) {
        // Add to pending if waitForElement is explicitly true OR if SPA mode is enabled
        const shouldWaitForElement = change.waitForElement || (this.plugin as any).config?.spa;

        if (shouldWaitForElement) {
          if (this.debug) {
            logDebug(`[ABsmartly] Element not found, adding to pending: ${change.selector}`);
          }
          this.pendingManager.addPending({
            change,
            experimentName,
            observerRoot: change.observerRoot,
          });
          return true;
        }

        if (this.debug) {
          logDebug(`[ABsmartly] No elements found for selector: ${change.selector}`);
        }
        logDebug(`No elements found for selector`, {
          experimentName,
          selector: change.selector,
          changeType: change.type,
        });
        return false;
      }

      elements.forEach(element => {
        if (this.debug && change.type === 'style') {
          const oldStyles: Record<string, string> = {};
          if (change.value && typeof change.value === 'object') {
            Object.keys(change.value).forEach(prop => {
              const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
              oldStyles[cssProp] = (element as HTMLElement).style.getPropertyValue(cssProp);
            });
          }
          logDebug(`[DOM-BEFORE-APPLY] Element styles before change`, {
            experimentName,
            selector: change.selector,
            element: element.tagName,
            oldStyles,
            newStyles: change.value,
          });
        }

        this.applyChangeToElement(element, change);

        if (this.debug && change.type === 'style') {
          const appliedStyles: Record<string, string> = {};
          if (change.value && typeof change.value === 'object') {
            Object.keys(change.value).forEach(prop => {
              const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
              appliedStyles[cssProp] = (element as HTMLElement).style.getPropertyValue(cssProp);
            });
          }
          logDebug(`[DOM-AFTER-APPLY] Element styles after change`, {
            experimentName,
            selector: change.selector,
            element: element.tagName,
            appliedStyles,
          });
        }

        if (change.type === 'javascript') {
          if (change.value) {
            const userVariant = (this.plugin as any).config?.context?.peek(experimentName);
            try {
              if (this.debug) {
                logDebug(`[JAVASCRIPT] [${experimentName}] Executing JavaScript change`, {
                  experimentName,
                  userVariant,
                  selector: change.selector,
                  element: element.tagName,
                  code: String(change.value).substring(0, 100) + '...',
                });
              }
              const codeString = String(change.value);
              logDebug(`[JAVASCRIPT] [${experimentName}] Creating function with code: ${codeString}`);
              const fn = new Function('element', codeString);
              logDebug(`[JAVASCRIPT] [${experimentName}] Function created, now executing...`);
              fn(element);
              logDebug(`[JAVASCRIPT] [${experimentName}] Function executed, element is:`, {
                elementTag: element.tagName,
                elementClass: (element as HTMLElement).className,
                elementId: (element as HTMLElement).id,
              });
              appliedElements.push(element);
              if (this.debug) {
                logDebug(`[JAVASCRIPT] [${experimentName}] ✓ JavaScript executed successfully`, {
                  experimentName,
                  userVariant,
                  selector: change.selector,
                  element: element.tagName,
                  code: codeString,
                });
              }
            } catch (error) {
              logDebug(`[JAVASCRIPT] [${experimentName}] ✗ JavaScript execution error:`, {
                experimentName,
                userVariant,
                selector: change.selector,
                element: element.tagName,
                code: String(change.value),
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });
            }
          } else {
            logDebug(
              `[JAVASCRIPT] [${experimentName}] ✗ No JavaScript code provided in change.value`,
              {
                experimentName,
                selector: change.selector,
              }
            );
          }
        } else if (change.type === 'move') {
          const targetSelector =
            (change as any).targetSelector ||
            (change.value && typeof change.value === 'object'
              ? (change.value as any).targetSelector
              : null);
          const position =
            (change as any).position ||
            (change.value && typeof change.value === 'object'
              ? (change.value as any).position
              : null);

          if (targetSelector) {
            const target = document.querySelector(targetSelector);
            if (target) {
              this.moveElement(element, target, position);
              appliedElements.push(element);
            } else if (this.debug) {
              logDebug(`[ABsmartly] Move target not found: ${targetSelector}`);
            }
          }
        } else {
          appliedElements.push(element);
        }

        // Watch element for React hydration recovery (ALL types) OR style persistence (styles only)
        const shouldWatch =
          (change.type === 'style' && change.persistStyle) || // Explicit style persistence
          (this.plugin as any).config?.spa; // SPA mode watches ALL types for hydration recovery

        if (shouldWatch) {
          this.plugin.watchElement(element, experimentName, change);
        } else if (change.type === 'style' && this.debug) {
          logDebug(`[WATCH-SKIP] NOT watching element - persistStyle and SPA both disabled`, {
            experimentName,
            selector: change.selector,
            element: element.tagName,
            persistStyle: change.persistStyle,
            spaMode: (this.plugin as any).config?.spa,
          });
        }
      });

      if (appliedElements.length > 0) {
        this.trackAppliedChange(experimentName, change);

        if (change.waitForElement) {
          this.pendingManager.removePending(change.selector, experimentName, change.observerRoot);
        }

        // Throttle logs during style persistence reapplies (animations can trigger many times per second)
        const isReapplying = appliedElements.some(el =>
          (this.plugin as any).reapplyingElements?.has(el)
        );

        if (!isReapplying) {
          logChangeApplication(
            experimentName,
            change.selector,
            change.type,
            appliedElements.length,
            true
          );
        }
        return true;
      }

      logChangeApplication(experimentName, change.selector, change.type, 0, false);
      return false;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error applying DOM change:', error, change);
      }
      logDebug(`Error applying DOM change`, {
        experimentName,
        selector: change.selector,
        changeType: change.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  protected moveElement(element: Element, target: Element, position?: string): void {
    switch (position) {
      case 'before':
        target.parentElement?.insertBefore(element, target);
        break;
      case 'after':
        if (target.nextSibling) {
          target.parentElement?.insertBefore(element, target.nextSibling);
        } else {
          target.parentElement?.appendChild(element);
        }
        break;
      case 'firstChild':
        if (target.firstChild) {
          target.insertBefore(element, target.firstChild);
        } else {
          target.appendChild(element);
        }
        break;
      case 'lastChild':
      default:
        target.appendChild(element);
        break;
    }
  }

  private createElement(change: DOMChange, _experimentName: string): Element | null {
    if (!change.element || !change.targetSelector) {
      return null;
    }

    const target = document.querySelector(change.targetSelector);
    if (!target) {
      if (this.debug) {
        logDebug(`[ABsmartly] Create target not found: ${change.targetSelector}`);
      }
      return null;
    }

    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = change.element;

    // Move all children (not just the first one) to support multiple elements
    const children = Array.from(tempContainer.children);
    if (children.length === 0) {
      return null;
    }

    for (const child of children) {
      this.moveElement(child, target, change.position);
    }

    // Return the first element for compatibility
    return children[0] as Element;
  }

  private applyStyleRules(change: DOMChange, experimentName: string): boolean {
    try {
      const manager = this.plugin.getStyleManager(experimentName);
      const ruleKey = `${change.selector}::states`;

      let css: string;

      // Support both raw CSS string in value and structured states
      if (typeof change.value === 'string' && change.value.trim()) {
        // Raw CSS provided in value
        css = change.value;
      } else if (change.states) {
        // Structured states provided
        css = this.plugin.buildStateRules(
          change.selector,
          change.states,
          change.important !== false
        );
      } else {
        // No CSS provided
        return false;
      }

      manager.setRule(ruleKey, css);

      if (this.debug) {
        logDebug(`[ABsmartly] Applied style rule: ${ruleKey}`);
        logDebug(`[ABsmartly] CSS: ${css}`);
      }

      this.trackAppliedChange(experimentName, change);

      logChangeApplication(experimentName, change.selector, 'styleRules', 1, true);

      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error applying style rules:', error);
      }
      return false;
    }
  }

  applyChangeToElement(element: Element, change: DOMChange): void {
    switch (change.type) {
      case 'text':
        if (change.value !== undefined) {
          element.textContent = String(change.value);
        }
        break;
      case 'html':
        if (change.value !== undefined) {
          element.innerHTML = String(change.value);
        }
        break;
      case 'style':
        if (change.value && typeof change.value === 'object') {
          Object.entries(change.value).forEach(([property, value]) => {
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            const priority = change.important === true ? 'important' : '';
            (element as HTMLElement).style.setProperty(cssProperty, String(value), priority);
          });
        }
        break;
      case 'class':
        if (change.add && Array.isArray(change.add)) {
          element.classList.add(...change.add);
        }
        if (change.remove && Array.isArray(change.remove)) {
          element.classList.remove(...change.remove);
        }
        break;
      case 'attribute':
        if (change.value && typeof change.value === 'object') {
          Object.entries(change.value).forEach(([attr, value]) => {
            if (value === null || value === undefined) {
              element.removeAttribute(attr);
            } else {
              element.setAttribute(attr, String(value));
            }
          });
        }
        break;
      case 'move':
        if (change.value && typeof change.value === 'object') {
          const moveValue = change.value as {
            targetSelector: string;
            position: string;
          };
          const target = document.querySelector(moveValue.targetSelector);
          if (target) {
            this.moveElement(element, target, moveValue.position);
          } else if (this.debug) {
            logDebug(`[ABsmartly] Move target not found: ${moveValue.targetSelector}`);
          }
        }
        break;
      case 'delete':
        element.remove();
        break;
    }
  }

  private applyChangeToSpecificElement(
    change: DOMChange,
    experimentName: string,
    element: HTMLElement
  ): boolean {
    try {
      this.applyChangeToElement(element, change);

      if (change.type === 'javascript' && change.value) {
        try {
          if (this.debug) {
            logDebug(`[JAVASCRIPT] [${experimentName}] Executing JavaScript on specific element`, {
              experimentName,
              selector: change.selector,
              element: element.tagName,
              code: String(change.value).substring(0, 100) + '...',
            });
          }
          const fn = new Function('element', String(change.value));
          fn(element);
          if (this.debug) {
            logDebug(`[JAVASCRIPT] [${experimentName}] ✓ JavaScript executed successfully`, {
              experimentName,
              selector: change.selector,
              element: element.tagName,
            });
          }
        } catch (error) {
          logDebug(
            `[JAVASCRIPT] [${experimentName}] ✗ JavaScript execution error on specific element:`,
            {
              experimentName,
              selector: change.selector,
              element: element.tagName,
              code: String(change.value),
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            }
          );
          return false;
        }
      } else if (change.type === 'move') {
        const targetSelector =
          (change as any).targetSelector ||
          (change.value && typeof change.value === 'object'
            ? (change.value as any).targetSelector
            : null);
        const position =
          (change as any).position ||
          (change.value && typeof change.value === 'object'
            ? (change.value as any).position
            : null);

        if (targetSelector) {
          const target = document.querySelector(targetSelector);
          if (target) {
            this.moveElement(element, target, position);
          } else {
            return false;
          }
        }
      }

      // Watch element for React hydration recovery (ALL types) OR style persistence (styles only)
      const shouldWatch =
        (change.type === 'style' && change.persistStyle) || // Explicit style persistence
        (this.plugin as any).config?.spa; // SPA mode watches ALL types for hydration recovery

      if (shouldWatch) {
        this.plugin.watchElement(element, experimentName, change);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error applying change to specific element:', error);
      }
      return false;
    }
  }

  private trackAppliedChange(experimentName: string, change: DOMChange): void {
    let changes = this.appliedChanges.get(experimentName);
    if (!changes) {
      changes = new Set();
      this.appliedChanges.set(experimentName, changes);
    }
    const changeKey = `${change.selector}-${change.type}`;
    changes.add(changeKey);
  }

  hasChanges(experimentName: string): boolean {
    return this.appliedChanges.has(experimentName);
  }

  clearTracking(experimentName?: string): void {
    if (experimentName) {
      this.appliedChanges.delete(experimentName);
    } else {
      this.appliedChanges.clear();
    }
  }

  removeAllPending(experimentName: string): void {
    this.pendingManager.removeAllPending(experimentName);
  }

  destroy(): void {
    this.pendingManager.destroy();
    this.appliedChanges.clear();
  }
}
