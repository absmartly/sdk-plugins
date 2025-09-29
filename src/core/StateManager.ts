import { DOMChange, ElementState, AppliedChange, PendingChange } from '../types';
import { logDebug, logStateOperation } from '../utils/debug';

export class StateManager {
  private appliedChanges: Map<string, AppliedChange[]> = new Map();
  private pendingChanges: Map<string, PendingChange[]> = new Map();
  private originalStates: Map<string, ElementState> = new Map();
  private createdElements: Map<string, Element> = new Map();

  storeOriginalState(selector: string, element: Element, changeType: string): void {
    const key = `${selector}-${changeType}`;

    if (this.originalStates.has(key)) {
      logDebug('Original state already stored', {
        selector,
        changeType,
        action: 'skip_store',
      });
      return; // Already stored
    }

    const state: ElementState = {
      selector,
      type: changeType,
      originalState: {},
    };

    switch (changeType) {
      case 'text':
        state.originalState.text = element.textContent || '';
        // Also store HTML for text changes in case element has child elements
        // This preserves structure when reverting text changes
        if (element.children.length > 0) {
          state.originalState.html = element.innerHTML;
        }
        break;
      case 'html':
        state.originalState.html = element.innerHTML;
        break;
      case 'style':
        state.originalState.style = element.getAttribute('style') || '';
        break;
      case 'class':
        state.originalState.classList = Array.from(element.classList);
        break;
      case 'attribute':
        state.originalState.attributes = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          // Don't store style, class, or our tracking attributes
          // as they're managed by other change types
          if (
            attr.name !== 'style' &&
            attr.name !== 'class' &&
            !attr.name.startsWith('data-absmartly-')
          ) {
            state.originalState.attributes[attr.name] = attr.value;
          }
        }
        break;
      case 'move':
        state.originalState.parent = element.parentElement;
        state.originalState.nextSibling = element.nextElementSibling;
        break;
    }

    this.originalStates.set(key, state);
    logStateOperation('store', selector, changeType);
  }

  getOriginalState(selector: string, changeType: string): ElementState | undefined {
    return this.originalStates.get(`${selector}-${changeType}`);
  }

  clearOriginalState(selector: string, changeType: string): void {
    const key = `${selector}-${changeType}`;
    if (this.originalStates.has(key)) {
      this.originalStates.delete(key);
      logDebug('Cleared original state', {
        selector,
        changeType,
        action: 'clear_state',
      });
    }
  }

  addAppliedChange(experimentName: string, change: DOMChange, elements: Element[]): void {
    const appliedChange: AppliedChange = {
      experimentName,
      change,
      elements,
      timestamp: Date.now(),
    };

    logDebug('Adding applied change', {
      experimentName,
      selector: change.selector,
      changeType: change.type,
      elementsCount: elements.length,
    });

    const changes = this.appliedChanges.get(experimentName) || [];
    changes.push(appliedChange);
    this.appliedChanges.set(experimentName, changes);
  }

  getAppliedChanges(experimentName?: string): AppliedChange[] {
    if (experimentName) {
      return this.appliedChanges.get(experimentName) || [];
    }

    const allChanges: AppliedChange[] = [];
    this.appliedChanges.forEach(changes => {
      allChanges.push(...changes);
    });
    return allChanges;
  }

  removeAppliedChanges(experimentName?: string): void {
    if (experimentName) {
      const changesCount = this.appliedChanges.get(experimentName)?.length || 0;
      this.appliedChanges.delete(experimentName);
      logDebug('Removed applied changes for experiment', {
        experimentName,
        changesRemoved: changesCount,
      });
    } else {
      const totalChanges = this.getAppliedChanges().length;
      this.appliedChanges.clear();
      logDebug('Cleared all applied changes', {
        changesRemoved: totalChanges,
      });
    }
  }

  removeSpecificAppliedChange(experimentName: string, selector: string, changeType: string): void {
    const changes = this.appliedChanges.get(experimentName);
    if (changes) {
      const index = changes.findIndex(
        applied => applied.change.selector === selector && applied.change.type === changeType
      );
      if (index !== -1) {
        changes.splice(index, 1);
        if (changes.length === 0) {
          this.appliedChanges.delete(experimentName);
        } else {
          this.appliedChanges.set(experimentName, changes);
        }
        logDebug('Removed specific applied change', {
          experimentName,
          selector,
          changeType,
        });
      }
    }
  }

  addPendingChange(experimentName: string, change: DOMChange): void {
    const pending: PendingChange = {
      experimentName,
      change,
      retryCount: 0,
    };

    const changes = this.pendingChanges.get(experimentName) || [];
    changes.push(pending);
    this.pendingChanges.set(experimentName, changes);

    logDebug('Added pending change (element not found)', {
      experimentName,
      selector: change.selector,
      changeType: change.type,
      totalPending: changes.length,
    });
  }

  getPendingChanges(experimentName?: string): PendingChange[] {
    if (experimentName) {
      return this.pendingChanges.get(experimentName) || [];
    }

    const allChanges: PendingChange[] = [];
    this.pendingChanges.forEach(changes => {
      allChanges.push(...changes);
    });
    return allChanges;
  }

  removePendingChange(experimentName: string, change: DOMChange): void {
    const changes = this.pendingChanges.get(experimentName);
    if (changes) {
      const index = changes.findIndex(
        p => p.change.selector === change.selector && p.change.type === change.type
      );
      if (index !== -1) {
        changes.splice(index, 1);
        if (changes.length === 0) {
          this.pendingChanges.delete(experimentName);
        }
      }
    }
  }

  incrementRetryCount(experimentName: string, change: DOMChange): void {
    const changes = this.pendingChanges.get(experimentName);
    if (changes) {
      const pending = changes.find(
        p => p.change.selector === change.selector && p.change.type === change.type
      );
      if (pending) {
        pending.retryCount++;
      }
    }
  }

  addCreatedElement(id: string, element: Element): void {
    this.createdElements.set(id, element);
  }

  getCreatedElement(id: string): Element | undefined {
    return this.createdElements.get(id);
  }

  removeCreatedElement(id: string): void {
    const element = this.createdElements.get(id);
    if (element) {
      element.remove();
      this.createdElements.delete(id);
    }
  }

  clearAll(): void {
    const stats = {
      appliedChanges: this.getAppliedChanges().length,
      pendingChanges: this.getPendingChanges().length,
      originalStates: this.originalStates.size,
      createdElements: this.createdElements.size,
    };

    this.appliedChanges.clear();
    this.pendingChanges.clear();
    this.originalStates.clear();
    this.createdElements.forEach(element => element.remove());
    this.createdElements.clear();

    logDebug('Cleared all state', stats);
  }

  hasChanges(experimentName: string): boolean {
    return this.appliedChanges.has(experimentName);
  }

  getAllExperimentNames(): string[] {
    return Array.from(this.appliedChanges.keys());
  }
}
