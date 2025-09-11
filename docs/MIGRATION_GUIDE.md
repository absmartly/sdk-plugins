# Migration Guide: Using the Simplified DOM Changes Plugin

## What Changed
The plugin has been simplified to be a pure DOM manipulation library. All preview-specific logic has been removed. The plugin now only knows how to:
1. Apply DOM changes to elements
2. Remove DOM changes from elements
3. Track what changes have been applied

## API Changes

### Removed Methods
The following methods have been completely removed:
- `previewChanges()` 
- `removePreview()`
- `isPreviewActive()`
- `startPreviewSession()`
- `addPreviewChange()`
- `removePreviewChange()` 
- `endPreviewSession()`

### Available Methods
The plugin now provides these clean, simple methods:

```javascript
// Apply a single DOM change
plugin.domManipulator.applyChange(change, identifier)

// Remove all changes for an identifier
plugin.removeChanges(identifier)

// Remove a specific change
plugin.removeSpecificChange(identifier, selector, changeType)

// Get currently applied changes
plugin.getAppliedChanges(identifier?)

// Check if changes exist for an identifier
plugin.hasChanges(identifier)

// Apply changes from ABSmartly context (for SDK integration)
plugin.applyChanges(experimentName?)
```

## How to Migrate Your Code

### Old Way (With Preview Methods)
```javascript
// Enable preview
plugin.previewChanges(changes, 'experiment-123');

// Check if preview is active
if (plugin.isPreviewActive()) {
  // Do something
}

// Disable preview
plugin.removePreview('experiment-123');
```

### New Way (Direct DOM Manipulation)
```javascript
// Apply changes (what used to be "enable preview")
changes.forEach(change => {
  plugin.domManipulator.applyChange(change, 'experiment-123');
});

// Check if changes are applied
if (plugin.hasChanges('experiment-123')) {
  // Do something
}

// Remove changes (what used to be "disable preview")
plugin.removeChanges('experiment-123');
```

## Managing Your Own State

Since the plugin no longer tracks preview state, you need to manage this yourself:

```javascript
class YourController {
  constructor(plugin) {
    this.plugin = plugin;
    this.activeStates = new Map(); // Track your own state
  }

  applyChanges(experimentName, changes) {
    // Remove existing changes if any
    if (this.activeStates.has(experimentName)) {
      this.plugin.removeChanges(experimentName);
    }
    
    // Apply new changes
    changes.forEach(change => {
      this.plugin.domManipulator.applyChange(change, experimentName);
    });
    
    // Track state
    this.activeStates.set(experimentName, changes);
  }

  removeChanges(experimentName) {
    // Remove DOM changes
    this.plugin.removeChanges(experimentName);
    
    // Update tracking
    this.activeStates.delete(experimentName);
  }

  toggleChange(experimentName, selector, changeType, enabled) {
    if (enabled) {
      const change = this.findChange(experimentName, selector, changeType);
      this.plugin.domManipulator.applyChange(change, experimentName);
    } else {
      this.plugin.removeSpecificChange(experimentName, selector, changeType);
    }
  }
}
```

## Benefits of the New Architecture

1. **Simplicity**: The plugin does one thing well - manipulate the DOM
2. **Flexibility**: You can implement any state management logic you need
3. **No Hidden State**: All state is managed explicitly by your code
4. **Better Testing**: Pure functions are easier to test
5. **Clear Separation**: Plugin handles DOM, you handle business logic

## Quick Reference

| Task | Old Method | New Approach |
|------|------------|--------------|
| Apply changes | `previewChanges(changes, id)` | `changes.forEach(c => applyChange(c, id))` |
| Remove changes | `removePreview(id)` | `removeChanges(id)` |
| Check if active | `isPreviewActive()` | Track in your own code |
| Start session | `startPreviewSession(id)` | Not needed |
| End session | `endPreviewSession()` | Not needed |

## Example: Complete Usage

```javascript
// Initialize plugin
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  debug: true
});

await plugin.initialize();

// Apply changes for an experiment
const changes = [
  { selector: '.button', type: 'text', value: 'New Text' },
  { selector: '.header', type: 'style', value: { color: 'blue' } }
];

// Apply each change
changes.forEach(change => {
  plugin.domManipulator.applyChange(change, 'exp-123');
});

// Later, remove all changes
plugin.removeChanges('exp-123');

// Or remove a specific change
plugin.removeSpecificChange('exp-123', '.button', 'text');
```

## Summary
The plugin is now a focused, simple DOM manipulation library. It doesn't know about previews, experiments, or any specific use case. It just applies and removes DOM changes. This makes it more flexible and easier to use in any context.