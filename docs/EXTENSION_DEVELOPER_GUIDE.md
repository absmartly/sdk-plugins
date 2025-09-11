# Extension Developer Guide

## Table of Contents
1. [Overview](#overview)
2. [Basic Setup](#basic-setup)
3. [Preview Mode Management](#preview-mode-management)
4. [Individual Change Management](#individual-change-management)
5. [Undo/Redo Implementation](#undoredo-implementation)
6. [Advanced Scenarios](#advanced-scenarios)
7. [Best Practices](#best-practices)
8. [Complete Example](#complete-example)

## Overview

The ABSmartly DOM Changes Plugin is a pure DOM manipulation library that provides clean APIs for applying, tracking, and removing DOM changes. The plugin has no awareness of preview modes, extensions, or editing workflows - it simply manages DOM changes. This guide shows how to integrate it into your Chrome extension for visual editing.

## Basic Setup

### Installation in Extension

```javascript
// In your content script
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';

// Initialize the plugin
const plugin = new DOMChangesPlugin({
  debug: true, // Enable console logging
  context: absmartlyContext // Your ABSmartly context
});

await plugin.initialize();
```

### Core API Methods

```javascript
// Apply a change
plugin.applyChange(change, experimentName);

// Remove all changes for an experiment
plugin.removeChanges(experimentName);

// Remove a specific change
plugin.removeSpecificChange(experimentName, selector, changeType);

// Get all applied changes
const changes = plugin.getAppliedChanges(experimentName);

// Check if experiment has changes
const hasChanges = plugin.hasChanges(experimentName);
```

## Preview Mode Management

The extension manages preview mode state, not the plugin. Here's how to implement it:

### Preview Mode Controller

```javascript
class PreviewModeController {
  constructor(plugin) {
    this.plugin = plugin;
    this.isPreviewMode = false;
    this.previewExperimentName = 'visual-editor-preview';
    this.currentChanges = [];
  }

  // Enter preview mode
  async enterPreviewMode() {
    this.isPreviewMode = true;
    
    // Notify UI
    this.updateUI({ previewMode: true });
    
    // Apply any pending preview changes
    this.applyPreviewChanges();
  }

  // Exit preview mode
  async exitPreviewMode() {
    this.isPreviewMode = false;
    
    // Remove all preview changes
    this.plugin.removeChanges(this.previewExperimentName);
    
    // Clear tracked changes
    this.currentChanges = [];
    
    // Notify UI
    this.updateUI({ previewMode: false });
  }

  // Apply a change in preview mode
  applyPreviewChange(change) {
    if (!this.isPreviewMode) {
      console.warn('Not in preview mode');
      return false;
    }

    // Apply the change
    const success = this.plugin.applyChange(
      change, 
      this.previewExperimentName
    );

    if (success) {
      // Track the change
      this.currentChanges.push(change);
      
      // Notify UI of change
      this.notifyChangeApplied(change);
    }

    return success;
  }

  // Toggle preview mode
  togglePreviewMode() {
    if (this.isPreviewMode) {
      this.exitPreviewMode();
    } else {
      this.enterPreviewMode();
    }
  }

  // Apply multiple changes at once
  applyPreviewChanges(changes = this.currentChanges) {
    changes.forEach(change => {
      this.plugin.applyChange(change, this.previewExperimentName);
    });
  }

  updateUI(state) {
    // Send message to extension popup/UI
    chrome.runtime.sendMessage({
      type: 'PREVIEW_STATE_CHANGED',
      state
    });
  }

  notifyChangeApplied(change) {
    chrome.runtime.sendMessage({
      type: 'PREVIEW_CHANGE_APPLIED',
      change
    });
  }

}
```

### Usage Example

```javascript
// Initialize
const previewController = new PreviewModeController(plugin);

// User clicks "Preview Mode" button
previewController.enterPreviewMode();

// User makes a change in visual editor
const change = {
  selector: '.header',
  type: 'text',
  value: 'New Header Text'
};
previewController.applyPreviewChange(change);

// User clicks "Save Changes"
await previewController.savePreviewChanges('experiment-123');

// Or user clicks "Cancel"
previewController.exitPreviewMode();
```

## Individual Change Management

Managing individual changes when some are enabled/disabled:

### Change Manager

```javascript
class ChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.changeRegistry = new Map(); // Track all changes with their state
  }

  // Register a change with enabled/disabled state
  registerChange(id, change, experimentName, enabled = true) {
    this.changeRegistry.set(id, {
      id,
      change,
      experimentName,
      enabled,
      applied: false
    });

    if (enabled) {
      this.applyChange(id);
    }
  }

  // Apply a specific change
  applyChange(id) {
    const record = this.changeRegistry.get(id);
    if (!record || record.applied) return false;

    const success = this.plugin.applyChange(
      record.change,
      record.experimentName
    );

    if (success) {
      record.applied = true;
      record.enabled = true;
    }

    return success;
  }

  // Remove a specific change
  removeChange(id) {
    const record = this.changeRegistry.get(id);
    if (!record || !record.applied) return false;

    const success = this.plugin.removeSpecificChange(
      record.experimentName,
      record.change.selector,
      record.change.type
    );

    if (success) {
      record.applied = false;
      record.enabled = false;
    }

    return success;
  }

  // Toggle a change on/off
  toggleChange(id) {
    const record = this.changeRegistry.get(id);
    if (!record) return false;

    if (record.enabled) {
      return this.removeChange(id);
    } else {
      return this.applyChange(id);
    }
  }

  // Update multiple changes at once
  updateChanges(updates) {
    // updates = [{ id: 'change1', enabled: true }, { id: 'change2', enabled: false }]
    
    updates.forEach(({ id, enabled }) => {
      const record = this.changeRegistry.get(id);
      if (!record) return;

      if (enabled && !record.applied) {
        this.applyChange(id);
      } else if (!enabled && record.applied) {
        this.removeChange(id);
      }
    });
  }

  // Get current state of all changes
  getChangeStates() {
    const states = [];
    this.changeRegistry.forEach(record => {
      states.push({
        id: record.id,
        enabled: record.enabled,
        applied: record.applied,
        change: record.change
      });
    });
    return states;
  }

  // Remove all changes for an experiment
  removeAllChanges(experimentName) {
    this.plugin.removeChanges(experimentName);
    
    // Update registry
    this.changeRegistry.forEach(record => {
      if (record.experimentName === experimentName) {
        record.applied = false;
        record.enabled = false;
      }
    });
  }
}
```

### Usage Example

```javascript
const changeManager = new ChangeManager(plugin);

// Register multiple changes
changeManager.registerChange('header-text', {
  selector: '.header',
  type: 'text',
  value: 'New Header'
}, 'exp-123', true);

changeManager.registerChange('header-color', {
  selector: '.header',
  type: 'style',
  value: { color: 'blue' }
}, 'exp-123', true);

changeManager.registerChange('button-text', {
  selector: '.btn',
  type: 'text',
  value: 'Click Me!'
}, 'exp-123', false); // Initially disabled

// User toggles individual changes in UI
changeManager.toggleChange('header-color'); // Disable header color
changeManager.toggleChange('button-text');  // Enable button text

// Get current states for UI
const states = changeManager.getChangeStates();
// Update UI checkboxes based on states
```

## Undo/Redo Implementation

### History Manager

```javascript
class HistoryManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.undoStack = [];
    this.redoStack = [];
    this.experimentName = 'visual-editor';
    this.isExecutingCommand = false;
  }

  // Execute a change and add to history
  executeChange(change) {
    if (this.isExecutingCommand) return;

    // Apply the change
    const success = this.plugin.applyChange(change, this.experimentName);
    
    if (success) {
      // Add to undo stack
      this.undoStack.push({
        type: 'ADD',
        change,
        timestamp: Date.now()
      });
      
      // Clear redo stack (new action invalidates redo history)
      this.redoStack = [];
      
      this.updateUI();
    }
    
    return success;
  }

  // Undo last action
  undo() {
    if (this.undoStack.length === 0) return false;

    this.isExecutingCommand = true;
    const action = this.undoStack.pop();
    
    let success = false;
    
    switch (action.type) {
      case 'ADD':
        // Remove the change
        success = this.plugin.removeSpecificChange(
          this.experimentName,
          action.change.selector,
          action.change.type
        );
        break;
        
      case 'REMOVE':
        // Re-apply the change
        success = this.plugin.applyChange(
          action.change,
          this.experimentName
        );
        break;
        
      case 'BATCH':
        // Undo all changes in the batch
        action.changes.reverse().forEach(change => {
          this.plugin.removeSpecificChange(
            this.experimentName,
            change.selector,
            change.type
          );
        });
        success = true;
        break;
    }
    
    if (success) {
      // Add to redo stack
      this.redoStack.push(action);
      this.updateUI();
    }
    
    this.isExecutingCommand = false;
    return success;
  }

  // Redo previously undone action
  redo() {
    if (this.redoStack.length === 0) return false;

    this.isExecutingCommand = true;
    const action = this.redoStack.pop();
    
    let success = false;
    
    switch (action.type) {
      case 'ADD':
        // Re-apply the change
        success = this.plugin.applyChange(
          action.change,
          this.experimentName
        );
        break;
        
      case 'REMOVE':
        // Remove the change again
        success = this.plugin.removeSpecificChange(
          this.experimentName,
          action.change.selector,
          action.change.type
        );
        break;
        
      case 'BATCH':
        // Re-apply all changes in the batch
        action.changes.forEach(change => {
          this.plugin.applyChange(change, this.experimentName);
        });
        success = true;
        break;
    }
    
    if (success) {
      // Add back to undo stack
      this.undoStack.push(action);
      this.updateUI();
    }
    
    this.isExecutingCommand = false;
    return success;
  }

  // Group multiple changes into one undo action
  executeBatch(changes) {
    if (this.isExecutingCommand) return;

    const appliedChanges = [];
    
    changes.forEach(change => {
      if (this.plugin.applyChange(change, this.experimentName)) {
        appliedChanges.push(change);
      }
    });
    
    if (appliedChanges.length > 0) {
      this.undoStack.push({
        type: 'BATCH',
        changes: appliedChanges,
        timestamp: Date.now()
      });
      
      this.redoStack = [];
      this.updateUI();
    }
    
    return appliedChanges.length > 0;
  }

  // Remove a change and track in history
  removeChange(selector, type) {
    if (this.isExecutingCommand) return;

    // Get the current state before removing
    const currentChanges = this.plugin.getAppliedChanges(this.experimentName);
    const changeToRemove = currentChanges.find(
      c => c.change.selector === selector && c.change.type === type
    );
    
    if (!changeToRemove) return false;

    const success = this.plugin.removeSpecificChange(
      this.experimentName,
      selector,
      type
    );
    
    if (success) {
      this.undoStack.push({
        type: 'REMOVE',
        change: changeToRemove.change,
        timestamp: Date.now()
      });
      
      this.redoStack = [];
      this.updateUI();
    }
    
    return success;
  }

  // Clear all history
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.plugin.removeChanges(this.experimentName);
    this.updateUI();
  }

  // Get history state for UI
  getState() {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      currentChanges: this.plugin.getAppliedChanges(this.experimentName)
    };
  }

  updateUI() {
    chrome.runtime.sendMessage({
      type: 'HISTORY_STATE_CHANGED',
      state: this.getState()
    });
  }
}
```

### Keyboard Shortcuts

```javascript
// Add keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    historyManager.undo();
  }
  
  // Ctrl/Cmd + Shift + Z for redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
    e.preventDefault();
    historyManager.redo();
  }
});
```

## Advanced Scenarios

### 1. Conditional Changes Based on Viewport

```javascript
class ResponsiveChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.breakpoints = {
      mobile: 768,
      tablet: 1024,
      desktop: Infinity
    };
  }

  applyResponsiveChange(change, experimentName) {
    const viewport = this.getCurrentViewport();
    
    // Add viewport-specific selector
    const responsiveChange = {
      ...change,
      selector: `${change.selector}[data-viewport="${viewport}"]`
    };
    
    return this.plugin.applyChange(responsiveChange, experimentName);
  }

  getCurrentViewport() {
    const width = window.innerWidth;
    if (width <= this.breakpoints.mobile) return 'mobile';
    if (width <= this.breakpoints.tablet) return 'tablet';
    return 'desktop';
  }

  // Apply different changes based on viewport
  applyViewportChanges(viewportChanges, experimentName) {
    const viewport = this.getCurrentViewport();
    const changes = viewportChanges[viewport] || viewportChanges.default;
    
    changes.forEach(change => {
      this.plugin.applyChange(change, experimentName);
    });
  }
}
```

### 2. Change Persistence Across Page Loads

```javascript
class PersistentChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.storageKey = 'absmartly_visual_changes';
  }

  // Save changes to storage
  async saveChanges(experimentName) {
    const changes = this.plugin.getAppliedChanges(experimentName);
    const data = {
      experimentName,
      changes: changes.map(c => c.change),
      timestamp: Date.now(),
      url: window.location.href
    };
    
    await chrome.storage.local.set({
      [this.storageKey]: data
    });
  }

  // Load and apply saved changes
  async loadChanges() {
    const result = await chrome.storage.local.get(this.storageKey);
    const data = result[this.storageKey];
    
    if (!data || data.url !== window.location.href) {
      return false;
    }
    
    // Check if changes are still valid (not expired)
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - data.timestamp > oneHour) {
      await this.clearSavedChanges();
      return false;
    }
    
    // Apply saved changes
    data.changes.forEach(change => {
      this.plugin.applyChange(change, data.experimentName);
    });
    
    return true;
  }

  // Clear saved changes
  async clearSavedChanges() {
    await chrome.storage.local.remove(this.storageKey);
  }

  // Auto-save on changes
  setupAutoSave(experimentName, debounceMs = 1000) {
    let timeout;
    
    // Listen for DOM changes
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.saveChanges(experimentName);
      }, debounceMs);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
    
    return observer;
  }
}
```

### 3. Conflict Resolution

```javascript
class ConflictResolver {
  constructor(plugin) {
    this.plugin = plugin;
  }

  // Detect conflicts between changes
  detectConflicts(newChange, experimentName) {
    const existingChanges = this.plugin.getAppliedChanges(experimentName);
    const conflicts = [];
    
    existingChanges.forEach(existing => {
      // Same selector and type = direct conflict
      if (existing.change.selector === newChange.selector &&
          existing.change.type === newChange.type) {
        conflicts.push({
          type: 'OVERRIDE',
          existing: existing.change,
          new: newChange
        });
      }
      
      // Parent-child selector conflict
      if (this.isParentChild(existing.change.selector, newChange.selector)) {
        conflicts.push({
          type: 'HIERARCHY',
          existing: existing.change,
          new: newChange
        });
      }
    });
    
    return conflicts;
  }

  // Resolve conflicts with user choice
  async resolveConflicts(conflicts, userChoice = 'REPLACE') {
    for (const conflict of conflicts) {
      switch (userChoice) {
        case 'REPLACE':
          // Remove existing, apply new
          this.plugin.removeSpecificChange(
            conflict.existing.experimentName,
            conflict.existing.selector,
            conflict.existing.type
          );
          break;
          
        case 'MERGE':
          // Merge values (for style/attribute changes)
          if (conflict.existing.type === 'style') {
            conflict.new.value = {
              ...conflict.existing.value,
              ...conflict.new.value
            };
          }
          break;
          
        case 'SKIP':
          // Don't apply the new change
          return false;
      }
    }
    
    return true;
  }

  isParentChild(selector1, selector2) {
    try {
      const elem1 = document.querySelector(selector1);
      const elem2 = document.querySelector(selector2);
      return elem1?.contains(elem2) || elem2?.contains(elem1);
    } catch {
      return false;
    }
  }
}
```

### 4. Change Validation

```javascript
class ChangeValidator {
  constructor(plugin) {
    this.plugin = plugin;
  }

  // Validate change before applying
  validateChange(change) {
    const errors = [];
    
    // Check selector exists
    if (!change.selector) {
      errors.push('Selector is required');
    } else {
      const elements = document.querySelectorAll(change.selector);
      if (elements.length === 0 && change.type !== 'create') {
        errors.push(`No elements found for selector: ${change.selector}`);
      }
    }
    
    // Validate type
    const validTypes = ['text', 'html', 'style', 'class', 'attribute', 'move', 'create', 'remove', 'javascript'];
    if (!validTypes.includes(change.type)) {
      errors.push(`Invalid change type: ${change.type}`);
    }
    
    // Type-specific validation
    switch (change.type) {
      case 'style':
        if (!change.value || typeof change.value !== 'object') {
          errors.push('Style changes require an object value');
        }
        break;
        
      case 'class':
        if (!change.add && !change.remove) {
          errors.push('Class changes require add or remove arrays');
        }
        break;
        
      case 'move':
        if (!change.targetSelector) {
          errors.push('Move changes require a targetSelector');
        }
        break;
        
      case 'create':
        if (!change.element || !change.targetSelector) {
          errors.push('Create changes require element HTML and targetSelector');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Safe apply with validation
  safeApplyChange(change, experimentName) {
    const validation = this.validateChange(change);
    
    if (!validation.valid) {
      console.error('Change validation failed:', validation.errors);
      return {
        success: false,
        errors: validation.errors
      };
    }
    
    try {
      const success = this.plugin.applyChange(change, experimentName);
      return {
        success,
        errors: success ? [] : ['Failed to apply change']
      };
    } catch (error) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}
```

## Best Practices

### 1. Experiment Naming Convention

```javascript
const EXPERIMENT_NAMES = {
  PREVIEW: 'visual-editor-preview',
  TEMP: 'visual-editor-temp',
  production: (id) => `experiment-${id}`,
  feature: (name) => `feature-${name}`,
  test: (id) => `test-${id}`
};
```

### 2. Change Batching

```javascript
class ChangeBatcher {
  constructor(plugin, batchSize = 10, delayMs = 100) {
    this.plugin = plugin;
    this.batchSize = batchSize;
    this.delayMs = delayMs;
    this.pendingChanges = [];
    this.timeout = null;
  }

  addChange(change, experimentName) {
    this.pendingChanges.push({ change, experimentName });
    
    if (this.pendingChanges.length >= this.batchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  scheduleFlush() {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.flush(), this.delayMs);
  }

  flush() {
    clearTimeout(this.timeout);
    
    const batch = this.pendingChanges.splice(0, this.batchSize);
    
    batch.forEach(({ change, experimentName }) => {
      this.plugin.applyChange(change, experimentName);
    });
    
    if (this.pendingChanges.length > 0) {
      this.scheduleFlush();
    }
  }
}
```

### 3. Performance Monitoring

```javascript
class PerformanceMonitor {
  constructor(plugin) {
    this.plugin = plugin;
    this.metrics = [];
  }

  measureChange(change, experimentName) {
    const start = performance.now();
    const success = this.plugin.applyChange(change, experimentName);
    const duration = performance.now() - start;
    
    this.metrics.push({
      change,
      experimentName,
      success,
      duration,
      timestamp: Date.now()
    });
    
    // Warn if slow
    if (duration > 100) {
      console.warn(`Slow change application: ${duration}ms`, change);
    }
    
    return success;
  }

  getMetrics() {
    return {
      total: this.metrics.length,
      successful: this.metrics.filter(m => m.success).length,
      failed: this.metrics.filter(m => !m.success).length,
      avgDuration: this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length,
      slowChanges: this.metrics.filter(m => m.duration > 100)
    };
  }
}
```

## Complete Example

Here's a complete example integrating all concepts:

```javascript
// content-script.js
class VisualEditorExtension {
  constructor() {
    this.plugin = null;
    this.previewController = null;
    this.changeManager = null;
    this.historyManager = null;
    this.persistentManager = null;
  }

  async initialize() {
    // Initialize ABSmartly context
    const context = await this.createABSmartlyContext();
    
    // Initialize plugin
    this.plugin = new DOMChangesPlugin({
      debug: true,
      context
    });
    await this.plugin.initialize();
    
    // Initialize managers
    this.previewController = new PreviewModeController(this.plugin);
    this.changeManager = new ChangeManager(this.plugin);
    this.historyManager = new HistoryManager(this.plugin);
    this.persistentManager = new PersistentChangeManager(this.plugin);
    
    // Load saved changes
    await this.persistentManager.loadChanges();
    
    // Setup listeners
    this.setupMessageListeners();
    this.setupKeyboardShortcuts();
    
    // Setup auto-save
    this.persistentManager.setupAutoSave('visual-editor');
    
    console.log('Visual Editor Extension initialized');
  }

  setupMessageListeners() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.type) {
        case 'ENTER_PREVIEW_MODE':
          this.previewController.enterPreviewMode();
          break;
          
        case 'EXIT_PREVIEW_MODE':
          this.previewController.exitPreviewMode();
          break;
          
        case 'APPLY_CHANGE':
          this.handleApplyChange(request.change);
          break;
          
        case 'TOGGLE_CHANGE':
          this.changeManager.toggleChange(request.changeId);
          break;
          
        case 'UNDO':
          this.historyManager.undo();
          break;
          
        case 'REDO':
          this.historyManager.redo();
          break;
          
        case 'SAVE_CHANGES':
          this.saveChanges(request.experimentName);
          break;
          
        case 'GET_STATE':
          sendResponse(this.getState());
          return true;
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.historyManager.undo();
      }
      
      // Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.historyManager.redo();
      }
      
      // Ctrl/Cmd + P for preview toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        this.previewController.togglePreviewMode();
      }
    });
  }

  handleApplyChange(change) {
    // Validate change
    const validator = new ChangeValidator(this.plugin);
    const validation = validator.validateChange(change);
    
    if (!validation.valid) {
      this.notifyError('Invalid change', validation.errors);
      return;
    }
    
    // Check for conflicts
    const resolver = new ConflictResolver(this.plugin);
    const conflicts = resolver.detectConflicts(change, 'visual-editor');
    
    if (conflicts.length > 0) {
      // Ask user how to resolve
      this.promptConflictResolution(conflicts).then(resolution => {
        if (resolver.resolveConflicts(conflicts, resolution)) {
          this.applyChangeWithHistory(change);
        }
      });
    } else {
      this.applyChangeWithHistory(change);
    }
  }

  applyChangeWithHistory(change) {
    if (this.previewController.isPreviewMode) {
      // Apply in preview mode
      this.previewController.applyPreviewChange(change);
    } else {
      // Apply with history tracking
      this.historyManager.executeChange(change);
      
      // Register in change manager
      const changeId = `change-${Date.now()}`;
      this.changeManager.registerChange(
        changeId,
        change,
        'visual-editor',
        true
      );
    }
    
    // Auto-save
    this.persistentManager.saveChanges('visual-editor');
  }

  async saveChanges(experimentName) {
    if (this.previewController.isPreviewMode) {
      // Save preview changes as permanent
      await this.previewController.savePreviewChanges(experimentName);
    } else {
      // Save current changes to backend
      const changes = this.plugin.getAppliedChanges('visual-editor');
      await this.saveToBackend(experimentName, changes);
    }
  }

  async saveToBackend(experimentName, changes) {
    try {
      const response = await fetch('/api/experiments/changes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          experimentName,
          changes: changes.map(c => c.change),
          url: window.location.href
        })
      });
      
      if (response.ok) {
        this.notifySuccess('Changes saved successfully');
      } else {
        throw new Error('Failed to save changes');
      }
    } catch (error) {
      this.notifyError('Failed to save changes', error.message);
    }
  }

  getState() {
    return {
      preview: {
        active: this.previewController.isPreviewMode,
        changes: this.previewController.currentChanges
      },
      history: this.historyManager.getState(),
      changes: this.changeManager.getChangeStates(),
      applied: this.plugin.getAppliedChanges('visual-editor')
    };
  }

  async createABSmartlyContext() {
    // Implementation depends on your ABSmartly setup
    // This is a placeholder
    return {
      experimentName: () => 'visual-editor',
      treatment: () => 0,
      data: () => ({}),
      variableValue: () => null
    };
  }

  promptConflictResolution(conflicts) {
    // Send message to popup for user input
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'CONFLICT_DETECTED',
        conflicts
      }, (response) => {
        resolve(response.resolution || 'REPLACE');
      });
    });
  }

  notifySuccess(message) {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      level: 'success',
      message
    });
  }

  notifyError(message, details) {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      level: 'error',
      message,
      details
    });
  }
}

// Initialize extension when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function initialize() {
  const extension = new VisualEditorExtension();
  await extension.initialize();
  
  // Make available globally for debugging
  window.visualEditorExtension = extension;
}
```

## Summary

This guide provides comprehensive examples for:

1. **Preview Mode**: Complete isolation of preview changes from production changes
2. **Individual Change Management**: Toggle specific changes on/off independently
3. **Undo/Redo**: Full history management with keyboard shortcuts
4. **Persistence**: Save and restore changes across page loads
5. **Conflict Resolution**: Handle overlapping or conflicting changes
6. **Performance**: Batch changes and monitor performance
7. **Validation**: Ensure changes are valid before applying

The key principle is that the plugin is a pure DOM manipulation library - all workflow logic (preview, undo/redo, persistence) is handled by the extension. This clean separation makes both components more maintainable and testable.