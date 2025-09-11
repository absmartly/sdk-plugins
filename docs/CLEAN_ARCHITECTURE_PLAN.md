# Clean Architecture Plan for DOM Changes Plugin

## Current Problem
The plugin currently has "preview mode" concepts baked into its core, creating unnecessary coupling with the browser extension's use case. The plugin should be a pure DOM manipulation library that doesn't know or care about preview modes, extensions, or any specific use cases.

## Core Principle
**The plugin should only do two things:**
1. Apply DOM changes to elements
2. Remove DOM changes from elements

Everything else (preview mode, experiment management, etc.) is the responsibility of the consumer (browser extension).

## Proposed Clean Architecture

### 1. Plugin API (What stays)
```javascript
// Core functionality - pure DOM manipulation
plugin.applyChange(change, identifier)      // Apply a single change
plugin.removeChanges(identifier)            // Remove all changes for an identifier
plugin.removeSpecificChange(identifier, selector, changeType) // Remove specific change
plugin.getAppliedChanges(identifier?)       // Get currently applied changes

// Context integration (for ABSmartly SDK)
plugin.applyChanges(experimentName?)        // Apply changes from context data
plugin.hasChanges(identifier)               // Check if changes exist
```

### 2. What Gets Removed
- ❌ `previewChanges()` method
- ❌ `removePreview()` method
- ❌ `startPreviewSession()` method
- ❌ `endPreviewSession()` method
- ❌ `addPreviewChange()` method
- ❌ `removePreviewChange()` method
- ❌ `isPreviewActive()` method
- ❌ Preview mode state in StateManager
- ❌ Preview-specific events

### 3. How the Extension Should Work

```javascript
// Extension's responsibility - manage its own preview state
class ExtensionController {
  constructor(plugin) {
    this.plugin = plugin;
    this.previewStates = new Map(); // Extension tracks what's previewed
  }

  enablePreview(experimentName, changes) {
    // Remove any existing preview for this experiment
    if (this.previewStates.has(experimentName)) {
      this.plugin.removeChanges(experimentName);
    }
    
    // Apply changes
    changes.forEach(change => {
      this.plugin.applyChange(change, experimentName);
    });
    
    // Track that this experiment is in preview
    this.previewStates.set(experimentName, changes);
  }

  disablePreview(experimentName) {
    // Remove the changes
    this.plugin.removeChanges(experimentName);
    
    // Update tracking
    this.previewStates.delete(experimentName);
  }

  toggleChange(experimentName, selector, changeType, enabled) {
    if (enabled) {
      const change = this.findChange(experimentName, selector, changeType);
      this.plugin.applyChange(change, experimentName);
    } else {
      this.plugin.removeSpecificChange(experimentName, selector, changeType);
    }
  }
}
```

## Benefits of This Approach

1. **Separation of Concerns**
   - Plugin: Pure DOM manipulation
   - Extension: Preview management, UI state, user interactions

2. **Simplicity**
   - Plugin code becomes much simpler
   - No preview-specific state management
   - No confusing dual-purpose methods

3. **Flexibility**
   - Extension can implement any preview logic it wants
   - Other consumers can use the plugin without preview concepts
   - Plugin remains focused on its core purpose

4. **Testability**
   - Plugin tests focus on DOM manipulation
   - Extension tests focus on preview logic
   - Clear boundaries between components

## Migration Path for Extension

### Before (Current Implementation)
```javascript
// Complex, preview-aware plugin usage
plugin.previewChanges(changes, experimentName);
plugin.removePreview(experimentName);
```

### After (Clean Implementation)
```javascript
// Simple, direct DOM manipulation
changes.forEach(change => plugin.applyChange(change, experimentName));
plugin.removeChanges(experimentName);
```

## Implementation Steps

1. **Remove Preview Methods from Plugin**
   - Delete all preview-specific methods
   - Remove preview state from StateManager
   - Remove preview-related events

2. **Simplify StateManager**
   - Remove `isPreviewMode` flag
   - Remove `previewChanges` array
   - Remove `startPreview()` and `endPreview()` methods
   - Keep only `appliedChanges` map

3. **Update Tests**
   - Remove preview-specific tests
   - Focus on core DOM manipulation tests
   - Ensure all basic operations work correctly

4. **Documentation**
   - Update README with simplified API
   - Provide examples of basic usage
   - Let extension handle its own preview logic

## Key Insight
The plugin doesn't need to know about "preview mode" - it just needs to apply and remove DOM changes. Whether those changes are for a preview, a test, or production is irrelevant to the plugin. The extension can use the same simple API to implement whatever preview logic it needs.

## Example: How Extension Implements Preview Toggle

```javascript
// Extension code (not plugin code)
function onPreviewToggle(experimentName, enabled) {
  if (enabled) {
    // Get changes from wherever (API, storage, etc.)
    const changes = getExperimentChanges(experimentName);
    
    // Apply them using the plugin's simple API
    changes.forEach(change => {
      plugin.domManipulator.applyChange(change, experimentName);
    });
  } else {
    // Remove them using the plugin's simple API
    plugin.removeChanges(experimentName);
  }
}
```

## Summary
By removing preview concepts from the plugin, we create a cleaner, more focused library that does one thing well: manipulate the DOM. The extension becomes responsible for its own preview logic, which is where that logic belongs.