# ABSmartly DOM Changes Plugin - Complete Extension Integration Guide

This guide covers everything you need to integrate the DOM Changes Plugin into your Chrome extension.

## Table of Contents
1. [Plugin Initialization](#plugin-initialization)
2. [Core API Methods](#core-api-methods)
3. [Change Types Reference](#change-types-reference)
4. [Managing Multiple Changes](#managing-multiple-changes)
5. [Common Implementation Patterns](#common-implementation-patterns)
6. [Best Practices](#best-practices)

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

### Apply a DOM Change
```javascript
// Returns boolean indicating success
const success = plugin.applyChange(change, experimentName);
```

### Remove Changes
```javascript
// Remove all changes for an experiment/variant
plugin.removeChanges(experimentName);

// Remove a specific change (removes the first matching one)
plugin.removeSpecificChange(experimentName, selector, changeType);
```

### Query Applied Changes
```javascript
// Get all applied changes
const changes = plugin.getAppliedChanges(experimentName);

// Check if any changes exist
const hasChanges = plugin.hasChanges(experimentName);
```

## Change Types Reference

### Text Change
```javascript
{
  selector: '.header h1',
  type: 'text',
  value: 'New Text Content'
}
```

### Style Change
```javascript
{
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red',    // Use camelCase for CSS properties
    fontSize: '16px',
    padding: '10px 20px'
  }
}
```

### Class Change
```javascript
{
  selector: '.card',
  type: 'class',
  add: ['highlight', 'featured'],    // Classes to add
  remove: ['hidden', 'disabled']     // Classes to remove
}
```

### Attribute Change
```javascript
{
  selector: 'input',
  type: 'attribute',
  value: {
    disabled: 'true',
    'data-tracked': 'yes',
    placeholder: 'Enter email'
  }
}
```

### HTML Change
```javascript
{
  selector: '.content',
  type: 'html',
  value: '<p>New <strong>HTML</strong> content</p>'
}
```

### Style Rules (with hover states)
```javascript
{
  selector: '.button',
  type: 'styleRules',
  states: {
    normal: {
      backgroundColor: '#007bff',
      color: 'white',
      padding: '10px 20px',
      transition: 'all 0.2s ease'
    },
    hover: {
      backgroundColor: '#0056b3',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    },
    active: {
      backgroundColor: '#004085'
    },
    focus: {
      outline: '2px solid #007bff',
      outlineOffset: '2px'
    }
  },
  important: true  // default is true
}
```

### Pending Changes (for elements not yet in DOM)
```javascript
{
  selector: '.lazy-loaded-button',
  type: 'style',
  value: {
    backgroundColor: 'red',
    color: 'white'
  },
  waitForElement: true,  // Wait for element to appear
  observerRoot: '.main-content'  // Optional: specific container to watch
}
```

The plugin will automatically:
1. Check if the element exists when applying the change
2. If not found and `waitForElement: true`, add to pending changes
3. Use MutationObserver to watch for the element to appear
4. Apply the change immediately when the element is added to DOM
5. Clean up observer when no pending changes remain

This is perfect for:
- Lazy-loaded content
- React components that mount/unmount
- Modal dialogs that appear later
- Dynamic content from API calls

### Move Element
```javascript
{
  selector: '.sidebar',
  type: 'move',
  targetSelector: '.main-content',
  position: 'before'  // 'before' | 'after' | 'firstChild' | 'lastChild'
}
```

### Create Element
```javascript
{
  selector: 'unique-id-for-created-element',
  type: 'create',
  element: '<div class="new-banner">Special Offer!</div>',
  targetSelector: '.header',
  position: 'lastChild'
}
```

### JavaScript Execution
```javascript
{
  selector: '.dynamic-element',
  type: 'javascript',
  value: 'element.addEventListener("click", () => console.log("Clicked!"))'
}
```

## Managing Multiple Changes

### The Challenge
When you have multiple changes of the same type for the same selector (e.g., multiple style changes for `.button`), you need to manage them carefully.

### Solution: Track with Unique IDs

```javascript
// Your variant structure in the extension
const variant = {
  id: 'variant-1',
  changes: [
    {
      id: 'change-001',  // Unique ID
      selector: '.button',
      type: 'style',
      value: { backgroundColor: 'red' },
      enabled: true
    },
    {
      id: 'change-002',  // Same selector & type, different ID
      selector: '.button',
      type: 'style',
      value: { fontSize: '20px' },
      enabled: true
    },
    {
      id: 'change-003',
      selector: '.button',
      type: 'style',
      value: { padding: '15px 30px' },
      enabled: false  // This one is disabled
    }
  ]
};
```

### Implementation Pattern

**Important:** When toggling individual changes, always use the "remove all and reapply" pattern:

```javascript
class VariantPreviewManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.currentVariant = null;
  }

  // Start preview for a variant
  startPreview(variant) {
    this.currentVariant = variant;
    this.refreshPreview();
  }

  // Toggle individual change
  onChangeToggled(changeId, isChecked) {
    if (!this.currentVariant) return;
    
    // Update the change's enabled state
    const change = this.currentVariant.changes.find(c => c.id === changeId);
    if (change) {
      change.enabled = isChecked;
      this.refreshPreview();
    }
  }

  // Refresh all changes (safest approach for multiple same-type changes)
  refreshPreview() {
    if (!this.currentVariant) return;
    
    const experimentName = `${this.currentVariant.id}-preview`;
    
    // Step 1: Remove ALL changes
    this.plugin.removeChanges(experimentName);
    
    // Step 2: Reapply ONLY enabled changes
    this.currentVariant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, experimentName);
      });
  }

  // Stop preview
  stopPreview() {
    if (!this.currentVariant) return;
    
    const experimentName = `${this.currentVariant.id}-preview`;
    this.plugin.removeChanges(experimentName);
    this.currentVariant = null;
  }
}
```

## Common Implementation Patterns

### Preview Mode Pattern

```javascript
// Switching between variants
function switchVariant(oldVariantId, newVariantId, newVariantChanges) {
  // Remove old variant changes
  if (oldVariantId) {
    plugin.removeChanges(`${oldVariantId}-preview`);
  }
  
  // Apply new variant changes
  newVariantChanges
    .filter(change => change.enabled !== false)
    .forEach(change => {
      plugin.applyChange(change, `${newVariantId}-preview`);
    });
}
```

### Visual Editor Pattern

```javascript
// Track changes made in visual editor
const visualEditorSession = {
  sessionId: Date.now(),
  changes: []
};

// User edits text inline
function handleTextEdit(element, newText) {
  const change = {
    selector: generateSelector(element),
    type: 'text',
    value: newText
  };
  
  // Apply immediately
  plugin.applyChange(change, `visual-editor-${visualEditorSession.sessionId}`);
  
  // Store for saving
  visualEditorSession.changes.push(change);
}

// Clean up when exiting visual editor
function exitVisualEditor() {
  plugin.removeChanges(`visual-editor-${visualEditorSession.sessionId}`);
  // Save changes to variant if user confirms
}
```

### Undo/Redo Pattern

```javascript
class UndoManager {
  constructor(plugin, experimentName) {
    this.plugin = plugin;
    this.experimentName = experimentName;
    this.history = [];
    this.currentIndex = -1;
  }
  
  applyChange(change) {
    // Apply the change
    this.plugin.applyChange(change, this.experimentName);
    
    // Add to history
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(change);
    this.currentIndex++;
  }
  
  undo() {
    if (this.currentIndex < 0) return;
    
    // For undo, we need to refresh all changes
    // because removeSpecificChange only removes the first match
    this.currentIndex--;
    this.reapplyUpToIndex();
  }
  
  redo() {
    if (this.currentIndex >= this.history.length - 1) return;
    
    this.currentIndex++;
    const change = this.history[this.currentIndex];
    this.plugin.applyChange(change, this.experimentName);
  }
  
  reapplyUpToIndex() {
    // Remove all and reapply up to current index
    this.plugin.removeChanges(this.experimentName);
    
    for (let i = 0; i <= this.currentIndex; i++) {
      this.plugin.applyChange(this.history[i], this.experimentName);
    }
  }
}
```

## Best Practices

### 1. Experiment Naming Convention

Use clear, consistent naming:

```javascript
`${variantId}-preview`           // For preview mode
`${variantId}-saved`              // For saved changes
`visual-editor-${sessionId}`      // For visual editor session
`undo-history-${timestamp}`       // For undo/redo tracking
```

### 2. Change Validation

Always validate before applying:

```javascript
function validateChange(change) {
  // Check required fields
  if (!change.selector || !change.type) {
    console.error('Missing required fields');
    return false;
  }
  
  // Check selector exists (except for create type)
  if (change.type !== 'create') {
    const elements = document.querySelectorAll(change.selector);
    if (elements.length === 0) {
      console.warn(`No elements found for selector: ${change.selector}`);
      return false;
    }
  }
  
  // Type-specific validation
  switch (change.type) {
    case 'style':
      return change.value && typeof change.value === 'object';
    case 'text':
    case 'html':
      return change.value !== undefined;
    case 'class':
      return Boolean(change.add || change.remove);
    case 'move':
      return Boolean(change.targetSelector && change.position);
    case 'create':
      return Boolean(change.element && change.targetSelector);
    default:
      return true;
  }
}

// Use it
if (validateChange(change)) {
  plugin.applyChange(change, experimentName);
}
```

### 3. Performance Optimization

For many changes, batch operations:

```javascript
function applyManyChanges(changes, experimentName) {
  // Remove once
  plugin.removeChanges(experimentName);
  
  // Apply all in sequence
  const results = [];
  changes.forEach(change => {
    if (change.enabled !== false) {
      const success = plugin.applyChange(change, experimentName);
      results.push({ change, success });
    }
  });
  
  return results;
}
```

### 4. Clean Up

Always clean up when done:

```javascript
// When user navigates away or closes extension
function cleanup() {
  // Remove all preview changes
  plugin.removeChanges('variant-preview');
  
  // Remove visual editor changes
  plugin.removeChanges('visual-editor-session');
  
  // Clear any temporary changes
  plugin.removeChanges('temp-changes');
}

window.addEventListener('beforeunload', cleanup);
```

### 5. Error Handling

Handle failures gracefully:

```javascript
function safeApplyChange(change, experimentName) {
  try {
    const success = plugin.applyChange(change, experimentName);
    
    if (!success) {
      console.error('Failed to apply change:', change);
      // Show user notification
      showNotification('Failed to apply change', 'error');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error applying change:', error);
    // Log to error tracking service
    logError(error, { change, experimentName });
    return false;
  }
}
```

## Important Notes

1. **Plugin is stateless about experiments** - It only knows the experiment names you provide
2. **Changes are not persistent** - Lost on page reload
3. **Sequential application** - Multiple changes of same type are applied in order
4. **Original state** - Stored once per selector+type combination
5. **Order matters** - Changes build on each other
6. **Pending changes** - Automatically handled for elements not yet in DOM
7. **Observer efficiency** - MutationObservers are batched and cleaned up automatically

## Debugging

Enable debug mode for detailed logs:

```javascript
const plugin = new DOMChangesPlugin({
  debug: true  // Logs all operations to console
});
```

## Handling Dynamic Content

### Wait for Elements Pattern

```javascript
// For content that loads after initial page load
function applyDynamicChanges(variant) {
  // Modal button that doesn't exist yet
  plugin.applyChange({
    selector: '.modal-button',
    type: 'style',
    value: { backgroundColor: 'green' },
    waitForElement: true  // Will wait for element to appear
  }, `${variant.id}-preview`);
  
  // React component that mounts later
  plugin.applyChange({
    selector: '.user-profile-card',
    type: 'text',
    value: 'Updated Profile',
    waitForElement: true,
    observerRoot: '.app-container'  // Watch specific container for better performance
  }, `${variant.id}-preview`);
}
```

### Optimized Observer Roots

```javascript
// Performance optimization: specify where to watch for elements
const changes = [
  {
    selector: '.sidebar-widget',
    type: 'style',
    value: { display: 'none' },
    waitForElement: true,
    observerRoot: '.sidebar'  // Only watch sidebar for this element
  },
  {
    selector: '.main-cta',
    type: 'text',
    value: 'Buy Now',
    waitForElement: true,
    observerRoot: '.main-content'  // Only watch main content area
  }
];

changes.forEach(change => {
  plugin.applyChange(change, experimentName);
});
```

### Handling SPA Navigation

```javascript
// For single-page applications where content changes dynamically
class SPAHandler {
  constructor(plugin) {
    this.plugin = plugin;
    this.watchRouteChanges();
  }
  
  watchRouteChanges() {
    // Listen for route changes
    window.addEventListener('popstate', () => this.reapplyChanges());
    
    // For frameworks like React Router
    const observer = new MutationObserver(() => {
      if (window.location.pathname !== this.lastPath) {
        this.lastPath = window.location.pathname;
        this.reapplyChanges();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  reapplyChanges() {
    // Changes with waitForElement will automatically
    // apply when new route content appears
    this.currentVariant.changes.forEach(change => {
      this.plugin.applyChange({
        ...change,
        waitForElement: true  // Ensure it waits for elements
      }, `${this.currentVariant.id}-spa`);
    });
  }
}
```

## Complete Example

Here's a complete example of managing variants with preview and visual editor:

```javascript
class ExtensionController {
  constructor() {
    this.plugin = null;
    this.currentVariant = null;
    this.isPreviewActive = false;
    this.visualEditorSession = null;
  }

  async initialize() {
    // Initialize plugin
    this.plugin = new DOMChangesPlugin({
      debug: true,
      context: await this.getABSmartlyContext()
    });
    await this.plugin.initialize();
  }

  // Preview management
  startPreview(variant) {
    this.currentVariant = variant;
    this.isPreviewActive = true;
    this.applyVariantChanges();
  }

  stopPreview() {
    if (!this.currentVariant) return;
    
    this.plugin.removeChanges(`${this.currentVariant.id}-preview`);
    this.isPreviewActive = false;
    this.currentVariant = null;
  }

  // Toggle individual change
  toggleChange(changeId, enabled) {
    if (!this.currentVariant) return;
    
    const change = this.currentVariant.changes.find(c => c.id === changeId);
    if (!change) return;
    
    change.enabled = enabled;
    this.applyVariantChanges();
  }

  // Apply all variant changes (remove & reapply pattern)
  applyVariantChanges() {
    if (!this.currentVariant) return;
    
    const experimentName = `${this.currentVariant.id}-preview`;
    
    // Remove all
    this.plugin.removeChanges(experimentName);
    
    // Apply enabled only
    this.currentVariant.changes
      .filter(c => c.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, experimentName);
      });
  }

  // Visual editor
  startVisualEditor() {
    this.visualEditorSession = {
      id: Date.now(),
      changes: [],
      undoManager: new UndoManager(this.plugin, `visual-editor-${Date.now()}`)
    };
  }

  addVisualEditorChange(change) {
    if (!this.visualEditorSession) return;
    
    // Apply and track
    this.visualEditorSession.undoManager.applyChange(change);
    this.visualEditorSession.changes.push(change);
  }

  saveVisualEditorChanges() {
    if (!this.visualEditorSession || !this.currentVariant) return;
    
    // Add visual editor changes to variant
    this.visualEditorSession.changes.forEach(change => {
      this.currentVariant.changes.push({
        id: `change-${Date.now()}-${Math.random()}`,
        ...change,
        enabled: true
      });
    });
    
    // Clean up visual editor session
    this.plugin.removeChanges(`visual-editor-${this.visualEditorSession.id}`);
    this.visualEditorSession = null;
    
    // Reapply variant with new changes
    this.applyVariantChanges();
  }

  // Cleanup
  cleanup() {
    this.stopPreview();
    if (this.visualEditorSession) {
      this.plugin.removeChanges(`visual-editor-${this.visualEditorSession.id}`);
    }
  }
}

// Usage
const controller = new ExtensionController();
await controller.initialize();

// Start preview
controller.startPreview(variant);

// Toggle change
controller.toggleChange('change-001', false);

// Visual editor
controller.startVisualEditor();
controller.addVisualEditorChange({
  selector: '.header',
  type: 'text',
  value: 'New Header'
});
controller.saveVisualEditorChanges();
```

This single guide contains everything you need to integrate the DOM Changes Plugin into your extension.