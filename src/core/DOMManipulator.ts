/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChange, ElementState, AppliedChange } from '../types';
import { StateManager } from './StateManager';
import { logDebug, logChangeApplication, logChangeRemoval } from '../utils/debug';
import type { DOMChangesPlugin } from './DOMChangesPlugin';
import { DOMManipulatorLite } from './DOMManipulatorLite';

export class DOMManipulator extends DOMManipulatorLite {
  private stateManager: StateManager;
  protected override plugin: DOMChangesPlugin;

  constructor(stateManager: StateManager, debug = false, plugin: DOMChangesPlugin) {
    super(debug, plugin as any);
    this.stateManager = stateManager;
    this.plugin = plugin;
  }

  override applyChange(change: DOMChange, experimentName: string): boolean {
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
        return this.applyStyleRulesWithState(change, experimentName);
      }

      const elements = document.querySelectorAll(change.selector);
      const appliedElements: Element[] = [];

      if (elements.length === 0 && change.type !== 'create') {
        if (change.waitForElement) {
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
        // Store original state before applying change
        this.stateManager.storeOriginalState(change.selector, element, change.type);

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

        // Add tracking attributes
        element.setAttribute('data-absmartly-modified', 'true');
        element.setAttribute('data-absmartly-experiment', experimentName);

        // Watch for persistence if it's an inline style change
        if (change.type === 'style') {
          this.plugin.watchElement(element, experimentName);
        }
      });

      if (change.type === 'create' && change.element && change.targetSelector) {
        const created = this.createElementWithState(change, experimentName);
        if (created) {
          appliedElements.push(created);
        }
      }

      if (appliedElements.length > 0) {
        this.stateManager.addAppliedChange(experimentName, change, appliedElements);

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

  private createElementWithState(change: DOMChange, experimentName: string): Element | null {
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
    const newElement = tempContainer.firstElementChild;

    if (!newElement) {
      return null;
    }

    const changeId = `${experimentName}-${change.selector}-create-${Date.now()}`;
    this.stateManager.addCreatedElement(changeId, newElement);

    this.moveElement(newElement, target, change.position);

    newElement.setAttribute('data-absmartly-created', 'true');
    newElement.setAttribute('data-absmartly-experiment', experimentName);
    newElement.setAttribute('data-absmartly-change-id', changeId);

    return newElement;
  }

  private applyStyleRulesWithState(change: DOMChange, experimentName: string): boolean {
    try {
      const manager = this.plugin.getStyleManager(experimentName);
      const ruleKey = `${change.selector}::states`;

      const css = this.plugin.buildStateRules(
        change.selector,
        change.states || {},
        change.important !== false
      );

      manager.setRule(ruleKey, css);

      if (this.debug) {
        logDebug(`[ABsmartly] Applied style rule: ${ruleKey}`);
        logDebug(`[ABsmartly] CSS: ${css}`);
      }

      const baseSelector = change.selector.replace(/:hover|:active|:focus|:visited/g, '');

      let elements: NodeListOf<Element>;
      try {
        elements = document.querySelectorAll(baseSelector);
        elements.forEach(element => {
          element.setAttribute('data-absmartly-modified', 'true');
          element.setAttribute('data-absmartly-experiment', experimentName);
          element.setAttribute('data-absmartly-style-rules', 'true');
        });
      } catch (e) {
        elements = document.querySelectorAll(
          '*[data-absmartly-experiment="' + experimentName + '"]'
        );
      }

      this.stateManager.addAppliedChange(experimentName, change, Array.from(elements));

      logChangeApplication(experimentName, change.selector, 'styleRules', elements.length, true);

      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error applying style rules:', error);
      }
      return false;
    }
  }

  removeChanges(experimentName: string): AppliedChange[] {
    const removedChanges: AppliedChange[] = [];

    this.removeAllPending(experimentName);

    logDebug(`Starting to remove changes for experiment: ${experimentName}`, {
      experimentName,
      action: 'remove_start',
    });

    try {
      const appliedChanges = this.stateManager.getAppliedChanges(experimentName);

      removedChanges.push(...appliedChanges);

      for (const applied of appliedChanges) {
        const { change, elements } = applied;

        if (change.type === 'styleRules') {
          const manager = this.plugin.getStyleManager(experimentName);
          const ruleKey = `${change.selector}::states`;
          manager.deleteRule(ruleKey);

          const styledElements = document.querySelectorAll(change.selector);
          styledElements.forEach(element => {
            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
            element.removeAttribute('data-absmartly-style-rules');
          });
          continue;
        }

        if (change.type === 'delete' && change.value) {
          const deleteValue = change.value as {
            html?: string;
            parentSelector?: string;
            nextSiblingSelector?: string;
          };

          if (deleteValue.html && deleteValue.parentSelector) {
            const parent = document.querySelector(deleteValue.parentSelector);

            if (parent) {
              const temp = document.createElement('div');
              temp.innerHTML = deleteValue.html;
              const elementToRestore = temp.firstElementChild as HTMLElement;

              if (elementToRestore) {
                if (deleteValue.nextSiblingSelector) {
                  const nextSibling = document.querySelector(deleteValue.nextSiblingSelector);
                  if (nextSibling && nextSibling.parentElement === parent) {
                    parent.insertBefore(elementToRestore, nextSibling);
                  } else {
                    parent.appendChild(elementToRestore);
                  }
                } else {
                  parent.appendChild(elementToRestore);
                }

                logDebug(`Restored deleted element`, {
                  experimentName,
                  selector: change.selector,
                  changeType: 'delete',
                });
              }
            }
          }
          continue;
        }

        elements.forEach(element => {
          if (element.hasAttribute('data-absmartly-created')) {
            const changeId = element.getAttribute('data-absmartly-change-id');
            if (changeId) {
              this.stateManager.removeCreatedElement(changeId);
            }
            element.remove();
            logDebug(`Removed created element`, {
              experimentName,
              changeId,
              changeType: 'create',
            });
          } else {
            const originalState = this.stateManager.getOriginalState(change.selector, change.type);

            if (originalState) {
              this.restoreElement(element, originalState, change.type);
              logChangeRemoval(experimentName, change.selector, change.type, 1);
            } else if (this.debug) {
              logDebug(`[ABsmartly] No original state found for restoration`, {
                selector: change.selector,
                type: change.type,
                experimentName,
              });
            }

            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
            element.removeAttribute('data-absmartly-style-rules');

            if (change.type === 'style') {
              this.plugin.unwatchElement(element, experimentName);
            }
          }
        });

        this.stateManager.clearOriginalState(change.selector, change.type);
      }

      this.stateManager.removeAppliedChanges(experimentName);

      const styleManager = this.plugin.getStyleManager(experimentName);
      if (styleManager) {
        styleManager.destroy();
      }

      logDebug(`Successfully removed changes for experiment: ${experimentName}`, {
        experimentName,
        changesRemoved: removedChanges.length,
        action: 'remove_complete',
      });
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error removing changes for experiment:', error);
      }
      logDebug(`Error removing changes`, {
        experimentName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return removedChanges;
  }

  private restoreElement(element: Element, state: ElementState, changeType: string): void {
    const original = state.originalState;

    switch (changeType) {
      case 'text':
        if (original.html !== undefined) {
          element.innerHTML = original.html;
        } else if (original.text !== undefined) {
          element.textContent = original.text;
        }
        break;

      case 'html':
        if (original.html !== undefined) {
          element.innerHTML = original.html;
        }
        break;

      case 'style':
        if (original.style !== undefined) {
          if (original.style === '') {
            element.removeAttribute('style');
          } else {
            element.setAttribute('style', original.style);
          }
        }
        break;

      case 'class':
        if (this.debug) {
          logDebug(`[ABsmartly] Restoring classes`, {
            originalClasses: original.classList,
            currentClasses: Array.from(element.classList),
            selector: element.className,
          });
        }
        if (original.classList) {
          element.className = '';
          if (original.classList.length > 0) {
            element.classList.add(...original.classList);
          }
        } else {
          element.className = '';
        }
        if (this.debug) {
          logDebug(`[ABsmartly] Classes after restoration`, {
            classes: Array.from(element.classList),
          });
        }
        break;

      case 'attribute':
        if (original.attributes) {
          const currentAttrs = new Set<string>();
          for (let i = 0; i < element.attributes.length; i++) {
            currentAttrs.add(element.attributes[i].name);
          }

          Object.entries(original.attributes).forEach(([name, value]) => {
            element.setAttribute(name, value as string);
            currentAttrs.delete(name);
          });

          currentAttrs.forEach(name => {
            if (name !== 'style' && name !== 'class' && !name.startsWith('data-absmartly-')) {
              element.removeAttribute(name);
            }
          });
        }
        break;

      case 'move': {
        const originalTarget = element.getAttribute('data-absmartly-original-target');
        const originalPosition = element.getAttribute('data-absmartly-original-position');

        if (originalTarget && originalPosition) {
          const target = document.querySelector(originalTarget);
          if (target) {
            this.moveElement(element, target, originalPosition);
            element.removeAttribute('data-absmartly-original-target');
            element.removeAttribute('data-absmartly-original-position');
          } else if (this.debug) {
            logDebug(`[ABsmartly] Original move target not found: ${originalTarget}`);
          }
        } else if (original.parent) {
          if (original.nextSibling) {
            original.parent.insertBefore(element, original.nextSibling);
          } else {
            original.parent.appendChild(element);
          }
        }
        break;
      }
    }
  }

  removeAllChanges(experimentName?: string): AppliedChange[] {
    const allRemovedChanges: AppliedChange[] = [];

    if (experimentName) {
      const removed = this.removeChanges(experimentName);
      allRemovedChanges.push(...removed);
    } else {
      const allExperiments = this.stateManager.getAllExperimentNames();
      for (const exp of allExperiments) {
        const removed = this.removeChanges(exp);
        allRemovedChanges.push(...removed);
      }
    }

    return allRemovedChanges;
  }

  removeSpecificChange(experimentName: string, selector: string, changeType: string): boolean {
    logDebug(`Removing specific change`, {
      experimentName,
      selector,
      changeType,
      action: 'remove_specific',
    });

    try {
      const appliedChanges = this.stateManager.getAppliedChanges(experimentName);

      const matchingChanges = appliedChanges.filter(
        applied => applied.change.selector === selector && applied.change.type === changeType
      );

      if (matchingChanges.length === 0) {
        logDebug(`Specific change not found`, {
          experimentName,
          selector,
          changeType,
        });
        return false;
      }

      const changeIndex = appliedChanges.findIndex(
        applied => applied.change.selector === selector && applied.change.type === changeType
      );

      const applied = appliedChanges[changeIndex];
      const { change, elements } = applied;

      if (elements[0]?.hasAttribute('data-absmartly-created')) {
        elements.forEach(element => {
          const changeId = element.getAttribute('data-absmartly-change-id');
          if (changeId) {
            this.stateManager.removeCreatedElement(changeId);
          }
          element.remove();
        });
      } else {
        const originalState = this.stateManager.getOriginalState(change.selector, change.type);

        if (originalState) {
          elements.forEach(element => {
            this.restoreElement(element, originalState, change.type);
          });
        }

        const remainingChanges = matchingChanges.filter(
          (_, idx) => appliedChanges.indexOf(matchingChanges[idx]) !== changeIndex
        );

        for (const remainingChange of remainingChanges) {
          const reapplyElements = document.querySelectorAll(remainingChange.change.selector);
          reapplyElements.forEach(element => {
            this.applyChangeToElement(element, remainingChange.change);
          });
        }

        if (remainingChanges.length === 0) {
          elements.forEach(element => {
            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
          });
        }
      }

      this.stateManager.removeSpecificAppliedChange(experimentName, selector, changeType);

      logChangeRemoval(experimentName, selector, changeType, elements.length);
      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error removing specific change:', error);
      }
      return false;
    }
  }

  revertChange(appliedChange: AppliedChange): boolean {
    const { experimentName, change, elements } = appliedChange;

    try {
      elements.forEach(element => {
        if (!element) return;

        if (element.hasAttribute('data-absmartly-created')) {
          const changeId = element.getAttribute('data-absmartly-change-id');
          if (changeId) {
            this.stateManager.removeCreatedElement(changeId);
          }
          element.remove();
        } else {
          const originalState = this.stateManager.getOriginalState(change.selector, change.type);
          if (originalState) {
            this.restoreElement(element, originalState, change.type);
          }
          element.removeAttribute('data-absmartly-modified');
          element.removeAttribute('data-absmartly-experiment');
        }
      });

      logChangeRemoval(experimentName, change.selector, change.type, elements.length);
      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error reverting change:', error);
      }
      return false;
    }
  }

  getAppliedChanges(experimentName?: string): AppliedChange[] {
    if (experimentName) {
      return this.stateManager.getAppliedChanges(experimentName);
    }
    return this.stateManager.getAppliedChanges();
  }

  getOriginalState(selector: string, changeType: string): ElementState | undefined {
    return this.stateManager.getOriginalState(selector, changeType);
  }

  getPendingChanges(): Array<{ experimentName: string; change: DOMChange; retryCount: number }> {
    return this.stateManager.getPendingChanges();
  }

  override hasChanges(experimentName: string): boolean {
    return this.stateManager.hasChanges(experimentName);
  }
}
