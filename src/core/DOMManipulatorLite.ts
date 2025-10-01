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
        this.applyChangeToElement(element, change);

        if (change.type === 'javascript') {
          if (change.value) {
            try {
              const fn = new Function('element', String(change.value));
              fn(element);
              appliedElements.push(element);
            } catch (error) {
              logDebug('[ABsmartly] JavaScript execution error:', error);
            }
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
      });

      if (appliedElements.length > 0) {
        this.trackAppliedChange(experimentName, change);

        if (change.waitForElement) {
          this.pendingManager.removePending(change.selector, experimentName, change.observerRoot);
        }

        logChangeApplication(
          experimentName,
          change.selector,
          change.type,
          appliedElements.length,
          true
        );
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
            (element as HTMLElement).style.setProperty(cssProperty, String(value));
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
    _experimentName: string,
    element: HTMLElement
  ): boolean {
    try {
      this.applyChangeToElement(element, change);

      if (change.type === 'javascript' && change.value) {
        try {
          const fn = new Function('element', String(change.value));
          fn(element);
        } catch (error) {
          logDebug('[ABsmartly] JavaScript execution error:', error);
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
