# ABSmartly DOM Changes Plugin - API Guide for Extension Developers

This guide focuses solely on how to use the DOM Changes Plugin APIs from your extension. The plugin is a pure DOM manipulation library with no knowledge of experiments, variants, or preview modes.

## Plugin Initialization

```javascript
// Initialize the plugin
const plugin = new DOMChangesPlugin({
  debug: true,  // Enable console logging
  context: absmartlyContext  // Your ABSmartly context
});

await plugin.initialize();
```

## Core API Methods

### 1. Apply a DOM Change

```javascript
// Apply a single change
const success = plugin.applyChange(change, experimentName);

// Example changes:
const textChange = {
  selector: '.header h1',
  type: 'text',
  value: 'New Header Text'
};

const styleChange = {
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red',
    fontSize: '16px'
  }
};

const classChange = {
  selector: '.card',
  type: 'class',
  add: ['highlight', 'featured'],
  remove: ['hidden']
};

// Apply them
plugin.applyChange(textChange, 'variant-1-preview');
plugin.applyChange(styleChange, 'variant-1-preview');
plugin.applyChange(classChange, 'variant-1-preview');
```

### 2. Remove Changes

```javascript
// Remove all changes for an experiment/variant
plugin.removeChanges('variant-1-preview');

// Remove a specific change
plugin.removeSpecificChange('variant-1-preview', '.button', 'style');
```

### 3. Query Applied Changes

```javascript
// Get all applied changes for an experiment/variant
const changes = plugin.getAppliedChanges('variant-1-preview');

// Check if experiment has any changes
const hasChanges = plugin.hasChanges('variant-1-preview');
```

## Change Types Reference

### Text Change
```javascript
{
  selector: string,
  type: 'text',
  value: string
}
```

### Style Change
```javascript
{
  selector: string,
  type: 'style',
  value: {
    [cssProperty]: string  // e.g., backgroundColor: 'red'
  }
}
```

### Class Change
```javascript
{
  selector: string,
  type: 'class',
  add?: string[],    // Classes to add
  remove?: string[]  // Classes to remove
}
```

### Attribute Change
```javascript
{
  selector: string,
  type: 'attribute',
  value: {
    [attributeName]: string  // e.g., disabled: 'true'
  }
}
```

### HTML Change
```javascript
{
  selector: string,
  type: 'html',
  value: string  // HTML content
}
```

### Move Element
```javascript
{
  selector: string,
  type: 'move',
  targetSelector: string,
  position: 'before' | 'after' | 'firstChild' | 'lastChild'
}
```

### Create Element
```javascript
{
  selector: string,  // Unique identifier for the created element
  type: 'create',
  element: string,   // HTML content
  targetSelector: string,
  position: 'before' | 'after' | 'firstChild' | 'lastChild'
}
```

### JavaScript Execution
```javascript
{
  selector: string,
  type: 'javascript',
  value: string  // JavaScript code (element available as 'element' variable)
}
```

## Common Extension Patterns

### Preview Mode Pattern

When implementing preview mode in your extension:

```javascript
// Apply changes when entering preview
function enterPreview(variantId, changes) {
  const experimentName = `${variantId}-preview`;
  
  // Apply only enabled changes
  changes
    .filter(change => change.enabled !== false)
    .forEach(change => {
      plugin.applyChange(change, experimentName);
    });
}

// Remove changes when exiting preview
function exitPreview(variantId) {
  const experimentName = `${variantId}-preview`;
  plugin.removeChanges(experimentName);
}

// Toggle individual change
function toggleChange(variantId, change) {
  const experimentName = `${variantId}-preview`;
  
  if (change.enabled) {
    plugin.applyChange(change, experimentName);
  } else {
    plugin.removeSpecificChange(experimentName, change.selector, change.type);
  }
}
```

### Visual Editor Pattern

When creating changes from visual editor interactions:

```javascript
// User edits text inline
function handleTextEdit(element, newText) {
  const change = {
    selector: generateSelector(element),
    type: 'text',
    value: newText
  };
  
  // Apply immediately for preview
  plugin.applyChange(change, 'visual-editor-session');
  
  // Store for saving later
  storeChangeInVariant(change);
}

// User drags element to new position
function handleElementMove(element, targetElement, position) {
  const change = {
    selector: generateSelector(element),
    type: 'move',
    targetSelector: generateSelector(targetElement),
    position: position
  };
  
  plugin.applyChange(change, 'visual-editor-session');
  storeChangeInVariant(change);
}
```

### Undo/Redo Pattern

Track changes for undo/redo functionality:

```javascript
class UndoManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.history = [];
    this.currentIndex = -1;
  }
  
  applyChange(change, experimentName) {
    // Apply the change
    this.plugin.applyChange(change, experimentName);
    
    // Add to history
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push({ change, experimentName });
    this.currentIndex++;
  }
  
  undo() {
    if (this.currentIndex < 0) return;
    
    const { change, experimentName } = this.history[this.currentIndex];
    this.plugin.removeSpecificChange(experimentName, change.selector, change.type);
    this.currentIndex--;
  }
  
  redo() {
    if (this.currentIndex >= this.history.length - 1) return;
    
    this.currentIndex++;
    const { change, experimentName } = this.history[this.currentIndex];
    this.plugin.applyChange(change, experimentName);
  }
}
```

## Best Practices

### 1. Experiment Naming

Use consistent naming for experiment/variant identifiers:

```javascript
// Good - clear what each identifier represents
`${variantId}-preview`           // For preview mode
`${variantId}-saved`              // For saved changes
`visual-editor-${sessionId}`      // For visual editor session

// Avoid - ambiguous identifiers
'changes'
'temp'
'test'
```

### 2. Change Validation

Always validate changes before applying:

```javascript
function isValidChange(change) {
  // Check required fields
  if (!change.selector || !change.type) return false;
  
  // Check selector exists (except for create type)
  if (change.type !== 'create') {
    const elements = document.querySelectorAll(change.selector);
    if (elements.length === 0) return false;
  }
  
  // Type-specific validation
  switch (change.type) {
    case 'style':
      return change.value && typeof change.value === 'object';
    case 'text':
    case 'html':
      return change.value !== undefined;
    case 'class':
      return change.add || change.remove;
    case 'move':
      return change.targetSelector && change.position;
    // ... other types
  }
  
  return true;
}

// Use validation before applying
if (isValidChange(change)) {
  plugin.applyChange(change, experimentName);
}
```

### 3. Handling Multiple Changes

Apply multiple changes efficiently:

```javascript
// Good - apply all at once
function applyVariantChanges(variantId, changes) {
  const experimentName = `${variantId}-preview`;
  
  changes.forEach(change => {
    if (change.enabled !== false) {
      plugin.applyChange(change, experimentName);
    }
  });
}

// For toggling multiple changes
function updateChanges(variantId, changeUpdates) {
  const experimentName = `${variantId}-preview`;
  
  changeUpdates.forEach(({ change, enabled }) => {
    if (enabled) {
      plugin.applyChange(change, experimentName);
    } else {
      plugin.removeSpecificChange(experimentName, change.selector, change.type);
    }
  });
}
```

### 4. Clean Up

Always clean up when done:

```javascript
// When user closes extension or navigates away
function cleanup() {
  // Remove all preview changes
  plugin.removeChanges('variant-preview');
  
  // Remove visual editor changes
  plugin.removeChanges('visual-editor-session');
  
  // Clear any temporary changes
  plugin.removeChanges('temp-changes');
}

// Listen for page unload
window.addEventListener('beforeunload', cleanup);
```

## Important Notes

1. **The plugin doesn't know about experiments or variants** - It only tracks changes by the experiment name you provide
2. **Changes are not persistent** - They're only in memory and will be lost on page reload
3. **Multiple changes of same type** - The plugin supports multiple changes of the same type for the same selector (they're applied sequentially)
4. **Original state preservation** - The plugin automatically stores the original state of elements before applying changes

## Error Handling

The plugin methods return boolean values indicating success:

```javascript
const success = plugin.applyChange(change, experimentName);
if (!success) {
  console.error('Failed to apply change:', change);
  // Handle error - maybe show user notification
}
```

## Debugging

Enable debug mode to see detailed logs:

```javascript
const plugin = new DOMChangesPlugin({
  debug: true  // Enables console logging
});
```

This will log:
- Change applications
- Change removals  
- State management operations
- Errors and warnings