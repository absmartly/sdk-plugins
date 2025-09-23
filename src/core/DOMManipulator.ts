/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChange, ElementState, AppliedChange } from '../types';
import { StateManager } from './StateManager';
import { logDebug, logChangeApplication, logChangeRemoval } from '../utils/debug';
import type { DOMChangesPlugin } from './DOMChangesPlugin';
import { PendingChangeManager } from './PendingChangeManager';

export class DOMManipulator {
  private stateManager: StateManager;
  private debug: boolean;
  private plugin: DOMChangesPlugin;
  private pendingManager: PendingChangeManager;

  constructor(stateManager: StateManager, debug = false, plugin: DOMChangesPlugin) {
    this.stateManager = stateManager;
    this.debug = debug;
    this.plugin = plugin;

    // Initialize pending manager with a callback to apply changes
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
      // Handle styleRules type separately - doesn't iterate over elements
      // This needs to be checked BEFORE element selection since styleRules
      // can have pseudo-classes that won't match querySelectorAll
      if (change.type === 'styleRules') {
        return this.applyStyleRules(change, experimentName);
      }

      const elements = document.querySelectorAll(change.selector);
      const appliedElements: Element[] = [];

      if (elements.length === 0 && change.type !== 'create') {
        // If waitForElement is true, add to pending changes
        if (change.waitForElement) {
          if (this.debug) {
            logDebug(`[ABsmartly] Element not found, adding to pending: ${change.selector}`);
          }
          this.pendingManager.addPending({
            change,
            experimentName,
            observerRoot: change.observerRoot,
          });
          return true; // Return true as it's been queued for later
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
        this.stateManager.storeOriginalState(change.selector, element, change.type);

        // Apply the change using the helper method
        this.applyChangeToElement(element, change);

        // Handle special cases
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
          // Move changes can have targetSelector at root or inside value object
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

        element.setAttribute('data-absmartly-modified', 'true');
        element.setAttribute('data-absmartly-experiment', experimentName);

        // Watch for persistence if it's an inline style change
        if (change.type === 'style') {
          this.plugin.watchElement(element, experimentName);
        }
      });

      // Handle create type separately
      if (change.type === 'create' && change.element && change.targetSelector) {
        const created = this.createElement(change, experimentName);
        if (created) {
          appliedElements.push(created);
        }
      }

      if (appliedElements.length > 0) {
        this.stateManager.addAppliedChange(experimentName, change, appliedElements);

        // Remove from pending if it was there
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

  private moveElement(element: Element, target: Element, position?: string): void {
    // Track original parent before moving
    const originalParent = element.parentElement;
    if (originalParent) {
      const parentSelector = this.getParentSelector(originalParent);
      if (parentSelector) {
        element.setAttribute('data-absmartly-original-parent', parentSelector);
      }
    }

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

  private createElement(change: DOMChange, experimentName: string): Element | null {
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

  removeChanges(experimentName: string): AppliedChange[] {
    const removedChanges: AppliedChange[] = [];

    // Remove any pending changes for this experiment
    this.pendingManager.removeAllPending(experimentName);

    logDebug(`Starting to remove changes for experiment: ${experimentName}`, {
      experimentName,
      action: 'remove_start',
    });

    try {
      // Get all applied changes for this experiment from state manager
      const appliedChanges = this.stateManager.getAppliedChanges(experimentName);

      // Store them for return value
      removedChanges.push(...appliedChanges);

      // Process each applied change
      for (const applied of appliedChanges) {
        const { change, elements } = applied;

        // Handle styleRules removal
        if (change.type === 'styleRules') {
          const manager = this.plugin.getStyleManager(experimentName);
          const ruleKey = `${change.selector}::states`;
          manager.deleteRule(ruleKey);

          // Clean up element attributes
          const styledElements = document.querySelectorAll(change.selector);
          styledElements.forEach(element => {
            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
            element.removeAttribute('data-absmartly-style-rules');
          });
          continue;
        }

        // For each element that was modified by this change
        elements.forEach(element => {
          if (element.hasAttribute('data-absmartly-created')) {
            // Remove created elements
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
            // Restore modified elements to their original state
            const originalState = this.stateManager.getOriginalState(change.selector, change.type);

            if (originalState) {
              this.restoreElement(element, originalState, change.type);
              logChangeRemoval(experimentName, change.selector, change.type, 1);
            } else if (this.debug) {
              logDebug(`[ABsmartly] No original state found for restoration`, {
                selector: change.selector,
                type: change.type,
                experimentName
              });
            }

            // Clean up tracking attributes
            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
            element.removeAttribute('data-absmartly-style-rules');

            // Stop watching for persistence
            if (change.type === 'style') {
              this.plugin.unwatchElement(element, experimentName);
            }
          }
        });

        // Clear the original state after restoring so it can be recaptured on next apply
        this.stateManager.clearOriginalState(change.selector, change.type);
      }

      // Clear the applied changes from state manager
      this.stateManager.removeAppliedChanges(experimentName);

      // Clean up style manager if it exists
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

    // Return the changes that were removed for debugging or reapplication
    return removedChanges;
  }

  private applyStyleRules(change: DOMChange, experimentName: string): boolean {
    try {
      const manager = this.plugin.getStyleManager(experimentName);
      const ruleKey = `${change.selector}::states`;

      // Build CSS from states
      const css = this.plugin.buildStateRules(
        change.selector,
        change.states || {},
        change.important !== false // default true
      );

      // Set the rule in the stylesheet
      manager.setRule(ruleKey, css);

      if (this.debug) {
        logDebug(`[ABsmartly] Applied style rule: ${ruleKey}`);
        logDebug(`[ABsmartly] CSS: ${css}`);
      }

      // Extract base selector without pseudo-classes for element selection
      // e.g., ".btn:hover .icon" -> ".btn .icon"
      const baseSelector = change.selector.replace(/:hover|:active|:focus|:visited/g, '');

      // Try to mark elements - may not match if selector is complex
      let elements: NodeListOf<Element>;
      try {
        elements = document.querySelectorAll(baseSelector);
        elements.forEach(element => {
          element.setAttribute('data-absmartly-modified', 'true');
          element.setAttribute('data-absmartly-experiment', experimentName);
          element.setAttribute('data-absmartly-style-rules', 'true');
        });
      } catch (e) {
        // If selector doesn't match (e.g., complex pseudo-selectors), that's OK
        // The CSS rules will still apply
        elements = document.querySelectorAll(
          '*[data-absmartly-experiment="' + experimentName + '"]'
        );
      }

      // Store the change even if no elements matched
      // (CSS rules are still active and will apply when conditions are met)
      this.stateManager.addAppliedChange(experimentName, change, Array.from(elements));

      logChangeApplication(experimentName, change.selector, 'styleRules', elements.length, true);

      return true; // Success if rule was added, regardless of element matches
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
            // Convert camelCase to kebab-case for CSS properties
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
        // Handle move changes - value contains targetSelector and position
        if (change.value && typeof change.value === 'object') {
          const moveValue = change.value as {
            targetSelector: string;
            position: string;
            originalTargetSelector?: string;
            originalPosition?: string;
          };
          const target = document.querySelector(moveValue.targetSelector);
          if (target) {
            // Store original position if provided (for reverting)
            if (moveValue.originalTargetSelector && moveValue.originalPosition) {
              element.setAttribute(
                'data-absmartly-original-target',
                moveValue.originalTargetSelector
              );
              element.setAttribute('data-absmartly-original-position', moveValue.originalPosition);
            }
            this.moveElement(element, target, moveValue.position);
          } else if (this.debug) {
            logDebug(`[ABsmartly] Move target not found: ${moveValue.targetSelector}`);
          }
        }
        break;
    }
  }

  private restoreElement(element: Element, state: ElementState, changeType: string): void {
    const original = state.originalState;

    switch (changeType) {
      case 'text':
        if (original.text !== undefined) {
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
            // If original had no style, remove the attribute entirely
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
            selector: element.className
          });
        }
        if (original.classList) {
          // Clear all classes first
          element.className = '';
          // Then add back the original classes
          if (original.classList.length > 0) {
            element.classList.add(...original.classList);
          }
        } else {
          // If there were no original classes, clear all classes
          element.className = '';
        }
        if (this.debug) {
          logDebug(`[ABsmartly] Classes after restoration`, {
            classes: Array.from(element.classList)
          });
        }
        break;

      case 'attribute':
        if (original.attributes) {
          // Get current attribute names
          const currentAttrs = new Set<string>();
          for (let i = 0; i < element.attributes.length; i++) {
            currentAttrs.add(element.attributes[i].name);
          }

          // Restore original attributes (add/update)
          Object.entries(original.attributes).forEach(([name, value]) => {
            element.setAttribute(name, value as string);
            currentAttrs.delete(name);
          });

          // Remove attributes that weren't in the original
          // but skip special attributes managed by other change types
          currentAttrs.forEach(name => {
            // Don't remove style, class, or our tracking attributes as they're managed separately
            if (name !== 'style' && name !== 'class' && !name.startsWith('data-absmartly-')) {
              element.removeAttribute(name);
            }
          });
        }
        break;

      case 'move': {
        // First try to use the stored original position from the move change
        const originalTarget = element.getAttribute('data-absmartly-original-target');
        const originalPosition = element.getAttribute('data-absmartly-original-position');

        if (originalTarget && originalPosition) {
          const target = document.querySelector(originalTarget);
          if (target) {
            this.moveElement(element, target, originalPosition);
            // Clean up move-related attributes
            element.removeAttribute('data-absmartly-original-target');
            element.removeAttribute('data-absmartly-original-position');
          } else if (this.debug) {
            logDebug(`[ABsmartly] Original move target not found: ${originalTarget}`);
          }
        } else if (original.parent) {
          // Fallback to the old method if no original position data
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
      // Remove changes for specific experiment
      const removed = this.removeChanges(experimentName);
      allRemovedChanges.push(...removed);
    } else {
      // Remove ALL changes across all experiments
      const allExperiments = this.stateManager.getAllExperimentNames();
      for (const exp of allExperiments) {
        const removed = this.removeChanges(exp);
        allRemovedChanges.push(...removed);
      }
    }

    return allRemovedChanges;
  }

  // Apply change to a specific element (used by PendingChangeManager)
  private applyChangeToSpecificElement(
    change: DOMChange,
    experimentName: string,
    element: HTMLElement
  ): boolean {
    try {
      // Store original state
      this.stateManager.storeOriginalState(change.selector, element, change.type);

      // Apply the change
      this.applyChangeToElement(element, change);

      // Handle special cases
      if (change.type === 'javascript' && change.value) {
        try {
          const fn = new Function('element', String(change.value));
          fn(element);
        } catch (error) {
          logDebug('[ABsmartly] JavaScript execution error:', error);
          return false;
        }
      } else if (change.type === 'move') {
        // Move changes can have targetSelector at root or inside value object
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

      // Mark element as modified
      element.setAttribute('data-absmartly-modified', 'true');
      element.setAttribute('data-absmartly-experiment', experimentName);

      // Watch for persistence if it's an inline style change
      if (change.type === 'style') {
        this.plugin.watchElement(element, experimentName);
      }

      // Update state manager
      const existing = this.stateManager.getAppliedChanges(experimentName);
      const found = existing.find(
        ac => ac.change.selector === change.selector && ac.change.type === change.type
      );

      if (found) {
        // Add to existing elements array if not already there
        if (!found.elements.includes(element)) {
          found.elements.push(element);
        }
      } else {
        // Add new applied change
        this.stateManager.addAppliedChange(experimentName, change, [element]);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        logDebug('[ABsmartly] Error applying change to specific element:', error);
      }
      return false;
    }
  }

  // Get a selector for a parent element
  private getParentSelector(element: Element): string | null {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c && !c.startsWith('absmartly'));
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }

    return element.tagName.toLowerCase();
  }

  // Clean up pending manager on destroy
  destroy(): void {
    this.pendingManager.destroy();
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

      // Find ALL changes for this selector and type
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

      // Find the index of the first matching change to remove
      const changeIndex = appliedChanges.findIndex(
        applied => applied.change.selector === selector && applied.change.type === changeType
      );

      const applied = appliedChanges[changeIndex];
      const { change, elements } = applied;

      // If this is a created element, just remove it
      if (elements[0]?.hasAttribute('data-absmartly-created')) {
        elements.forEach(element => {
          const changeId = element.getAttribute('data-absmartly-change-id');
          if (changeId) {
            this.stateManager.removeCreatedElement(changeId);
          }
          element.remove();
        });
      } else {
        // For modified elements, we need to handle multiple changes
        const originalState = this.stateManager.getOriginalState(change.selector, change.type);

        // First, restore to original state
        if (originalState) {
          elements.forEach(element => {
            this.restoreElement(element, originalState, change.type);
          });
        }

        // Then reapply all OTHER changes of the same type for this selector
        // (excluding the one we're removing)
        const remainingChanges = matchingChanges.filter(
          (_, idx) => appliedChanges.indexOf(matchingChanges[idx]) !== changeIndex
        );

        for (const remainingChange of remainingChanges) {
          // Reapply the change
          const reapplyElements = document.querySelectorAll(remainingChange.change.selector);
          reapplyElements.forEach(element => {
            this.applyChangeToElement(element, remainingChange.change);
          });
        }

        // Clean up attributes only if no more changes for this element
        if (remainingChanges.length === 0) {
          elements.forEach(element => {
            element.removeAttribute('data-absmartly-modified');
            element.removeAttribute('data-absmartly-experiment');
          });
        }
      }

      // Remove this specific change from the state manager
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
        if (!element) return; // Skip null/undefined elements

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
}
