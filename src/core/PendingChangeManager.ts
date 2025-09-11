import { DOMChange } from '../types';

export interface PendingChange {
  change: DOMChange;
  experimentName: string;
  observerRoot?: string;
}

export class PendingChangeManager {
  private pending = new Map<string, PendingChange[]>();
  private observers = new Map<string, MutationObserver>();
  private appliedSelectors = new Set<string>();
  private debug: boolean;
  private batchTimer: NodeJS.Timeout | null = null;
  private batchedWork = new Set<() => void>();

  constructor(
    private applyFn: (change: DOMChange, experimentName: string, element?: Element) => boolean,
    debug = false
  ) {
    this.debug = debug;
  }

  addPending(pendingChange: PendingChange): void {
    const { change, observerRoot } = pendingChange;

    // If observerRoot is specified but doesn't exist, treat as no observerRoot
    let effectiveRoot = observerRoot;
    if (observerRoot && !document.querySelector(observerRoot)) {
      if (this.debug) {
        console.log('[ABsmartly] Observer root not found, using document:', observerRoot);
      }
      effectiveRoot = undefined;
    }

    const key = `${change.selector}-${effectiveRoot || 'document'}`;

    if (this.debug) {
      console.log('[ABsmartly] Adding pending change for selector:', change.selector);
    }

    // Check if element already exists
    const root = this.getObserverRoot(effectiveRoot);
    const existing = root.querySelector(change.selector);
    if (existing) {
      // Apply immediately if element exists
      this.applyChange(existing, { ...pendingChange, observerRoot: effectiveRoot });
      return;
    }

    // Add to pending
    const list = this.pending.get(key) || [];
    list.push({ ...pendingChange, observerRoot: effectiveRoot });
    this.pending.set(key, list);

    // Ensure observer for this root
    this.ensureObserver(effectiveRoot);
  }

  removePending(selector: string, experimentName: string, observerRoot?: string): void {
    const key = `${selector}-${observerRoot || 'document'}`;
    const list = this.pending.get(key);

    if (list) {
      const filtered = list.filter(p => p.experimentName !== experimentName);
      if (filtered.length === 0) {
        this.pending.delete(key);
      } else {
        this.pending.set(key, filtered);
      }
    }

    // Check if we should disconnect observer
    this.checkObserverCleanup(observerRoot);
  }

  removeAllPending(experimentName: string): void {
    // Remove all pending changes for this experiment
    for (const [key, list] of this.pending.entries()) {
      const filtered = list.filter(p => p.experimentName !== experimentName);
      if (filtered.length === 0) {
        this.pending.delete(key);
      } else {
        this.pending.set(key, filtered);
      }
    }

    // Clean up observers if needed
    this.cleanupObservers();
  }

  private ensureObserver(observerRoot?: string): void {
    const rootKey = observerRoot || 'document';

    if (this.observers.has(rootKey)) {
      return;
    }

    const root = this.getObserverRoot(observerRoot);

    const observer = new MutationObserver(mutations => {
      this.handleMutations(mutations, observerRoot);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    this.observers.set(rootKey, observer);

    if (this.debug) {
      console.log('[ABsmartly] Started observer for root:', rootKey);
    }
  }

  private handleMutations(mutations: MutationRecord[], observerRoot?: string): void {
    const work: Array<() => void> = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        // Check all pending selectors for this root
        const rootKey = observerRoot || 'document';
        for (const [key, pendingList] of this.pending.entries()) {
          if (!key.endsWith(`-${rootKey}`)) continue;

          for (const pending of pendingList) {
            const { change } = pending;

            // Check if node matches selector
            if (node.matches(change.selector)) {
              work.push(() => this.applyChange(node, pending));
              continue;
            }

            // Check descendants
            const found = node.querySelectorAll(change.selector);
            found.forEach(el => {
              work.push(() => this.applyChange(el, pending));
            });
          }
        }
      }
    }

    // Batch the work
    if (work.length > 0) {
      this.batchWork(work);
    }
  }

  private batchWork(work: Array<() => void>): void {
    // Add work to batch
    work.forEach(fn => this.batchedWork.add(fn));

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Set new timer (32ms for ~2 frames)
    this.batchTimer = setTimeout(() => {
      this.processBatchedWork();
    }, 32);
  }

  private processBatchedWork(): void {
    const work = Array.from(this.batchedWork);
    this.batchedWork.clear();
    this.batchTimer = null;

    if (this.debug && work.length > 0) {
      console.log('[ABsmartly] Processing batched work:', work.length, 'items');
    }

    // Apply all changes
    work.forEach(fn => fn());
  }

  private applyChange(element: Element, pendingChange: PendingChange): void {
    const { change, experimentName, observerRoot } = pendingChange;
    const key = `${change.selector}-${observerRoot || 'document'}-${experimentName}`;

    // Skip if already applied
    if (this.appliedSelectors.has(key)) {
      return;
    }

    if (this.debug) {
      console.log('[ABsmartly] Applying pending change to element:', change.selector);
    }

    // Apply the change
    const success = this.applyFn(change, experimentName, element as HTMLElement);

    if (success) {
      // Mark as applied
      this.appliedSelectors.add(key);

      // Remove from pending
      const pendingKey = `${change.selector}-${observerRoot || 'document'}`;
      const list = this.pending.get(pendingKey);
      if (list) {
        const filtered = list.filter(
          p => p.experimentName !== experimentName || p.change.selector !== change.selector
        );

        if (filtered.length === 0) {
          this.pending.delete(pendingKey);
        } else {
          this.pending.set(pendingKey, filtered);
        }
      }

      // Check if observer should be cleaned up
      this.checkObserverCleanup(observerRoot);
    }
  }

  private getObserverRoot(observerRoot?: string): Element {
    if (!observerRoot) {
      return document.documentElement;
    }

    const root = document.querySelector(observerRoot);
    if (!root) {
      // If observer root doesn't exist, fall back to document
      return document.documentElement;
    }

    return root;
  }

  private checkObserverCleanup(observerRoot?: string): void {
    const rootKey = observerRoot || 'document';

    // Check if there are any pending changes for this root
    let hasPending = false;
    for (const key of this.pending.keys()) {
      if (key.endsWith(`-${rootKey}`)) {
        hasPending = true;
        break;
      }
    }

    // Disconnect observer if no pending changes
    if (!hasPending) {
      const observer = this.observers.get(rootKey);
      if (observer) {
        observer.disconnect();
        this.observers.delete(rootKey);

        if (this.debug) {
          console.log('[ABsmartly] Disconnected observer for root:', rootKey);
        }
      }
    }
  }

  private cleanupObservers(): void {
    // Check each observer
    const rootsToClean: string[] = [];

    for (const rootKey of this.observers.keys()) {
      let hasPending = false;
      for (const key of this.pending.keys()) {
        if (key.endsWith(`-${rootKey}`)) {
          hasPending = true;
          break;
        }
      }

      if (!hasPending) {
        rootsToClean.push(rootKey);
      }
    }

    // Clean up observers with no pending changes
    rootsToClean.forEach(rootKey => {
      const observer = this.observers.get(rootKey);
      if (observer) {
        observer.disconnect();
        this.observers.delete(rootKey);

        if (this.debug) {
          console.log('[ABsmartly] Cleaned up observer for root:', rootKey);
        }
      }
    });
  }

  destroy(): void {
    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Disconnect all observers
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }

    this.observers.clear();
    this.pending.clear();
    this.appliedSelectors.clear();
    this.batchedWork.clear();

    if (this.debug) {
      console.log('[ABsmartly] PendingChangeManager destroyed');
    }
  }

  getPendingCount(): number {
    let count = 0;
    for (const list of this.pending.values()) {
      count += list.length;
    }
    return count;
  }

  getAppliedCount(): number {
    return this.appliedSelectors.size;
  }

  hasPendingForExperiment(experimentName: string): boolean {
    for (const list of this.pending.values()) {
      if (list.some(p => p.experimentName === experimentName)) {
        return true;
      }
    }
    return false;
  }
}
