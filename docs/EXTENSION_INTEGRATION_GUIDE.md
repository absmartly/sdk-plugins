# ABSmartly DOM Changes Plugin - Extension Integration Guide

Complete guide for integrating the DOM Changes Plugin into your Chrome extension, including preview mode, visual editing, styleRules, exposure tracking, and advanced state management.

## Table of Contents
1. [Plugin Initialization](#plugin-initialization)
2. [Core API Methods](#core-api-methods)
3. [Change Types Reference](#change-types-reference)
4. [Exposure Tracking](#exposure-tracking)
5. [Managing Multiple Changes](#managing-multiple-changes)
6. [Common Implementation Patterns](#common-implementation-patterns)
7. [Automatic SDK Integration](#automatic-sdk-integration)
8. [Best Practices](#best-practices)

## Plugin Initialization

### Basic Setup
```javascript
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,     // Required: ABSmartly context
  debug: true,                   // Enable console logging
  autoApply: true,               // Auto-apply changes from SDK payload
  spa: true,                     // Handle single-page applications
  visibilityTracking: true,      // Track element visibility (deprecated, use trigger_on_view)
  dataFieldName: '__dom_changes' // Field name in variant variables
});

await plugin.initialize();
```

### Configuration Options
- `context` (required): ABSmartly context instance
- `debug`: Enable detailed console logging
- `autoApply`: Automatically apply changes from SDK when initialized
- `spa`: Enable SPA mode with dynamic element tracking
- `dataFieldName`: Variable name containing DOM changes in variants (default: `__dom_changes`)

## Core API Methods

### Apply a DOM Change
```javascript
// Returns boolean indicating success
const success = plugin.applyChange(change, experimentName);
```

### Remove Changes
```javascript
// Remove all changes for an experiment
plugin.removeChanges(experimentName);

// Remove a specific change (removes the first matching one)
plugin.removeSpecificChange(experimentName, selector, changeType);

// Revert a specific applied change
plugin.revertChange(appliedChange);
```

### Query Applied Changes
```javascript
// Get all applied changes
const changes = plugin.getAppliedChanges(experimentName);

// Check if any changes exist
const hasChanges = plugin.hasChanges(experimentName);

// Get all tracked experiments
const experiments = plugin.getExperiments();
```

## Change Types Reference

### 1. Text Change
```javascript
{
  selector: '.header h1',
  type: 'text',
  value: 'New Text Content',
  trigger_on_view: false  // Optional: control exposure timing
}
```

### 2. HTML Change
```javascript
{
  selector: '.content',
  type: 'html',
  value: '<p>New <strong>HTML</strong> content</p>',
  trigger_on_view: true
}
```

### 3. Style Change (Inline)
```javascript
{
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red',    // Use camelCase for CSS properties
    fontSize: '16px',
    padding: '10px 20px'
  },
  trigger_on_view: false
}
```

### 4. Style Rules (With Pseudo-States) ⭐ NEW
```javascript
{
  selector: '.button',
  type: 'styleRules',
  states: {
    normal: {
      backgroundColor: '#007bff',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '4px',
      transition: 'all 0.2s ease'
    },
    hover: {
      backgroundColor: '#0056b3',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    },
    active: {
      backgroundColor: '#004085',
      transform: 'translateY(0)'
    },
    focus: {
      outline: '2px solid #007bff',
      outlineOffset: '2px'
    }
  },
  important: true,  // default is true
  trigger_on_view: true
}
```

**Benefits of styleRules:**
- Handles CSS pseudo-states properly (hover, active, focus)
- Survives React re-renders through stylesheet injection
- More performant than inline styles for complex interactions
- Automatically handles vendor prefixes

### 5. Class Change
```javascript
{
  selector: '.card',
  type: 'class',
  add: ['highlight', 'featured'],    // Classes to add
  remove: ['hidden', 'disabled'],    // Classes to remove
  trigger_on_view: false
}
```

### 6. Attribute Change
```javascript
{
  selector: 'input',
  type: 'attribute',
  value: {
    disabled: 'true',
    'data-tracked': 'yes',
    placeholder: 'Enter email',
    'aria-label': 'Email input'
  },
  trigger_on_view: false
}
```

### 7. Move Element
```javascript
{
  selector: '.sidebar',
  type: 'move',
  targetSelector: '.main-content',
  position: 'before',  // 'before' | 'after' | 'firstChild' | 'lastChild'
  trigger_on_view: true  // Always use true for moves to avoid bias
}
```

### 8. Create Element
```javascript
{
  selector: 'unique-id-for-created-element',
  type: 'create',
  element: '<div class="new-banner">Special Offer!</div>',
  targetSelector: '.header',
  position: 'lastChild',
  trigger_on_view: false
}
```

### 9. JavaScript Execution
```javascript
{
  selector: '.dynamic-element',
  type: 'javascript',
  value: `
    element.addEventListener('click', () => {
      console.log('Clicked!', element);
    });
    element.setAttribute('data-initialized', 'true');
  `,
  trigger_on_view: false
}
```

### 10. Pending Changes (Elements Not Yet in DOM) ⭐ NEW
```javascript
{
  selector: '.lazy-loaded-button',
  type: 'style',
  value: {
    backgroundColor: 'red',
    color: 'white'
  },
  waitForElement: true,  // Wait for element to appear
  observerRoot: '.main-content',  // Optional: specific container to watch
  trigger_on_view: true
}
```

**How it works:**
1. Check if element exists when applying
2. If not found and `waitForElement: true`, add to pending queue
3. Use MutationObserver to watch for element appearance
4. Apply change immediately when element is added to DOM
5. Clean up observer when no pending changes remain

**Perfect for:**
- Lazy-loaded content
- React components that mount/unmount
- Modal dialogs
- API-loaded content
- Infinite scroll items

## Exposure Tracking ⭐ NEW

### Understanding trigger_on_view

The `trigger_on_view` property controls when an A/B test exposure event is recorded:

```javascript
{
  selector: '.element',
  type: 'style',
  value: { color: 'red' },
  trigger_on_view: true  // Wait for element visibility
}
```

- **`false` or undefined** (default): Exposure triggers immediately when change is applied
- **`true`**: Exposure triggers only when element enters viewport

### Why This Matters - Preventing Sample Ratio Mismatch

Consider this scenario:
```javascript
// Experiment A: Changes hero (visible immediately)
// Experiment B: Changes footer (requires scrolling)

// Without proper tracking:
// - Experiment A: 10,000 exposures
// - Experiment B: 3,000 exposures
// Result: Biased, unusable data
```

### Cross-Variant Tracking

The plugin tracks elements from **ALL variants**, not just the active one:

```javascript
// Variant 0: Button stays in header
// Variant 1: Button moves to sidebar
// Variant 2: Button moves to footer

// ALL variants track: .header, .sidebar, AND .footer
// Exposure triggers when ANY container becomes visible
// Result: Equal exposure opportunity for all variants
```

### Move Changes - Special Handling

For move changes, the plugin tracks **parent containers**:

```javascript
{
  selector: '.cta-button',
  type: 'move',
  targetSelector: '.footer',
  position: 'firstChild',
  trigger_on_view: true
}

// Tracks both:
// - Original parent container (.header)
// - Target parent container (.footer)
// Ensures unbiased exposure across variants
```

## Managing Multiple Changes

### The Challenge
Multiple changes of the same type for the same selector need careful management:

```javascript
const variant = {
  id: 'variant-1',
  changes: [
    {
      id: 'change-001',
      selector: '.button',
      type: 'style',
      value: { backgroundColor: 'red' },
      enabled: true
    },
    {
      id: 'change-002',  // Same selector & type
      selector: '.button',
      type: 'style',
      value: { fontSize: '20px' },
      enabled: true
    }
  ]
};
```

### Solution: Remove All & Reapply Pattern

```javascript
class VariantManager {
  refreshPreview() {
    const experimentName = `${this.variant.id}-preview`;
    
    // Step 1: Remove ALL changes
    this.plugin.removeChanges(experimentName);
    
    // Step 2: Reapply ONLY enabled changes
    this.variant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, experimentName);
      });
  }
}
```

## Common Implementation Patterns

### Preview Mode with Exposure Control

```javascript
class PreviewManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  startPreview(variant) {
    const experimentName = `${variant.id}-preview`;
    
    variant.changes.forEach(change => {
      // For preview, typically don't trigger exposures
      const previewChange = {
        ...change,
        trigger_on_view: false  // Override for preview
      };
      this.plugin.applyChange(previewChange, experimentName);
    });
  }
}
```

### Visual Editor with Undo/Redo

```javascript
class VisualEditor {
  constructor(plugin) {
    this.plugin = plugin;
    this.history = [];
    this.currentIndex = -1;
  }

  applyChange(change) {
    // Apply with immediate trigger for instant feedback
    const editorChange = {
      ...change,
      trigger_on_view: false,
      waitForElement: false  // Apply immediately in editor
    };
    
    this.plugin.applyChange(editorChange, 'visual-editor');
    
    // Add to history
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(editorChange);
    this.currentIndex++;
  }

  undo() {
    if (this.currentIndex < 0) return;
    
    this.currentIndex--;
    this.reapplyHistory();
  }

  redo() {
    if (this.currentIndex >= this.history.length - 1) return;
    
    this.currentIndex++;
    this.reapplyHistory();
  }

  reapplyHistory() {
    this.plugin.removeChanges('visual-editor');
    
    for (let i = 0; i <= this.currentIndex; i++) {
      this.plugin.applyChange(this.history[i], 'visual-editor');
    }
  }
}
```

### SPA Support with Dynamic Content

```javascript
class SPAHandler {
  constructor(plugin) {
    this.plugin = plugin;
    this.watchRouteChanges();
  }

  watchRouteChanges() {
    // Listen for route changes
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
    this.currentVariant.changes.forEach(change => {
      // Ensure changes wait for elements on route change
      const spaChange = {
        ...change,
        waitForElement: true
      };
      this.plugin.applyChange(spaChange, `${this.currentVariant.id}-spa`);
    });
  }
}
```

## Automatic SDK Integration

### How autoApply Works

When `autoApply: true`, the plugin automatically:

1. **Reads experiments** from `context.data()`
2. **Gets current variant** using `context.peek(experimentName)`
3. **Extracts changes** from `__dom_changes` variable
4. **Applies changes** for current variant only
5. **Tracks all positions** across all variants for exposure
6. **Triggers exposures** based on `trigger_on_view` settings

### SDK Payload Structure

Configure your A/B testing platform:

```json
{
  "experiment_name": "homepage_optimization",
  "variants": [
    {
      "name": "control",
      "variables": {
        "__dom_changes": []
      }
    },
    {
      "name": "treatment_a",
      "variables": {
        "__dom_changes": [
          {
            "selector": ".hero-title",
            "type": "text",
            "value": "Revolutionary Product",
            "trigger_on_view": false
          },
          {
            "selector": ".cta-button",
            "type": "styleRules",
            "states": {
              "normal": {
                "backgroundColor": "#28a745",
                "padding": "15px 30px"
              },
              "hover": {
                "backgroundColor": "#218838",
                "transform": "scale(1.05)"
              }
            },
            "trigger_on_view": false
          }
        ]
      }
    },
    {
      "name": "treatment_b",
      "variables": {
        "__dom_changes": [
          {
            "selector": ".hero-title",
            "type": "text",
            "value": "Game-Changing Solution",
            "trigger_on_view": false
          },
          {
            "selector": ".cta-button",
            "type": "move",
            "targetSelector": ".hero-section",
            "position": "lastChild",
            "trigger_on_view": true
          },
          {
            "selector": ".testimonials",
            "type": "style",
            "value": {
              "backgroundColor": "#f8f9fa",
              "padding": "40px"
            },
            "waitForElement": true,
            "trigger_on_view": true
          }
        ]
      }
    }
  ]
}
```

### Exposure Flow

```javascript
// Automatic exposure handling
if (hasOnlyImmediateChanges) {
  context.treatment(experimentName);  // Trigger immediately
} else if (hasViewportChanges) {
  // Wait for ANY tracked element to become visible
  // Tracks elements from ALL variants to prevent SRMs
}
```

## Complete Extension Development Guide

### Preview Mode Implementation

Implementing preview mode in your extension requires managing state and DOM changes:

```javascript
class PreviewManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.isPreviewMode = false;
    this.currentVariant = null;
  }

  startPreview(variant) {
    this.currentVariant = variant;
    this.isPreviewMode = true;
    
    // Apply all enabled changes
    variant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, `${variant.id}-preview`);
      });
  }

  stopPreview() {
    if (this.currentVariant) {
      this.plugin.removeChanges(`${this.currentVariant.id}-preview`);
      this.currentVariant = null;
    }
    this.isPreviewMode = false;
  }

  toggleChange(changeId, enabled) {
    if (!this.currentVariant) return;
    
    const change = this.currentVariant.changes.find(c => c.id === changeId);
    if (!change) return;
    
    change.enabled = enabled;
    
    // Refresh entire preview (safest approach)
    this.stopPreview();
    this.startPreview(this.currentVariant);
  }
}
```

### Visual Editor Integration

For creating changes through visual interaction:

```javascript
class VisualEditor {
  constructor(plugin) {
    this.plugin = plugin;
    this.active = false;
  }

  activate() {
    this.active = true;
    this.setupElementHighlighting();
    this.addEventListeners();
  }

  handleElementClick(element) {
    const selector = this.generateSelector(element);
    
    // Show edit options
    this.showEditMenu(element, {
      'Edit Text': () => this.editText(element, selector),
      'Edit Styles': () => this.editStyles(element, selector),
      'Move Element': () => this.startMoveMode(element, selector)
    });
  }

  editText(element, selector) {
    const newText = prompt('Enter new text:', element.textContent);
    if (newText) {
      const change = {
        selector,
        type: 'text',
        value: newText
      };
      this.plugin.applyChange(change, 'visual-editor');
      this.onChangeCreated(change);
    }
  }

  generateSelector(element) {
    // Generate unique CSS selector for element
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    
    // Fallback to path-based selector
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      const index = Array.from(current.parentNode.children).indexOf(current);
      path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index + 1})`);
      current = current.parentNode;
    }
    return path.join(' > ');
  }
}
```

### Handling Multiple Changes of Same Type

When you have multiple changes for the same selector/type combination:

```javascript
class MultiChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  applyVariantChanges(variant) {
    const experimentName = `${variant.id}-preview`;
    
    // Remove all existing changes
    this.plugin.removeChanges(experimentName);
    
    // Apply all enabled changes in order
    variant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, experimentName);
      });
  }

  toggleSingleChange(variant, changeId, enabled) {
    const change = variant.changes.find(c => c.id === changeId);
    if (!change) return;
    
    change.enabled = enabled;
    
    // For multiple same-type changes, refresh all is safest
    this.applyVariantChanges(variant);
  }
}
```

### Style Rules UI Components

For implementing UI to create styleRules changes:

```javascript
class StyleRulesEditor {
  constructor(onChange) {
    this.onChange = onChange;
    this.currentStates = {
      normal: {},
      hover: {},
      active: {},
      focus: {}
    };
  }

  render() {
    return `
      <div class="style-rules-editor">
        <div class="state-tabs">
          <button onclick="this.switchState('normal')">Normal</button>
          <button onclick="this.switchState('hover')">Hover</button>
          <button onclick="this.switchState('active')">Active</button>
          <button onclick="this.switchState('focus')">Focus</button>
        </div>
        
        <div class="properties-editor">
          <div class="property-row">
            <label>Background Color:</label>
            <input type="color" onchange="this.updateProperty('backgroundColor', this.value)">
          </div>
          <div class="property-row">
            <label>Text Color:</label>
            <input type="color" onchange="this.updateProperty('color', this.value)">
          </div>
          <div class="property-row">
            <label>Transform:</label>
            <input type="text" placeholder="e.g., translateY(-2px)" onchange="this.updateProperty('transform', this.value)">
          </div>
        </div>
        
        <button onclick="this.generateChange()">Apply Style Rules</button>
      </div>
    `;
  }

  updateProperty(property, value) {
    this.currentStates[this.activeState][property] = value;
    this.onChange({
      type: 'styleRules',
      states: this.currentStates
    });
  }
}
```

### Best Practices

#### 1. Exposure Timing Strategy

```javascript
// Above-fold, critical changes
{
  selector: '.hero-banner',
  type: 'text',
  value: 'New Headline',
  trigger_on_view: false  // Immediate exposure
}

// Below-fold, non-critical changes
{
  selector: '.footer-cta',
  type: 'style',
  value: { backgroundColor: 'blue' },
  trigger_on_view: true  // Wait for visibility
}

// Move changes - always wait
{
  selector: '.element',
  type: 'move',
  targetSelector: '.new-location',
  trigger_on_view: true  // Prevent position bias
}
```

#### 2. Performance Optimization

```javascript
// Use observerRoot for better performance
{
  selector: '.modal-content',
  type: 'text',
  value: 'Updated content',
  waitForElement: true,
  observerRoot: '.modal-container'  // Watch specific area
}

// Batch changes
function applyBulkChanges(changes, experimentName) {
  // Remove once
  plugin.removeChanges(experimentName);
  
  // Apply all
  const results = changes.map(change => ({
    change,
    success: plugin.applyChange(change, experimentName)
  }));
  
  return results;
}
```

#### 3. Handling React/Vue Re-renders

For frameworks that re-render components:

```javascript
// Use styleRules for hover states (survives re-renders)
{
  selector: '.react-button',
  type: 'styleRules',
  states: {
    normal: { backgroundColor: 'blue' },
    hover: { backgroundColor: 'darkblue' }
  }
}

// Use waitForElement for dynamic components
{
  selector: '.lazy-component',
  type: 'style',
  value: { border: '2px solid red' },
  waitForElement: true
}
```

#### 4. Complete Extension Architecture

```javascript
class ABSmartlyExtension {
  constructor() {
    this.plugin = null;
    this.previewManager = null;
    this.visualEditor = null;
    this.experiments = new Map();
  }

  async initialize() {
    // Initialize plugin
    this.plugin = new DOMChangesPlugin({
      context: await this.getContext(),
      autoApply: true,
      spa: true,
      extensionBridge: true,
      debug: true
    });
    
    await this.plugin.initialize();
    
    // Initialize managers
    this.previewManager = new PreviewManager(this.plugin);
    this.visualEditor = new VisualEditor(this.plugin);
    
    // Load experiments
    await this.loadExperiments();
    
    // Setup message listeners
    this.setupMessageListeners();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'START_PREVIEW':
          this.previewManager.startPreview(request.variant);
          break;
        case 'STOP_PREVIEW':
          this.previewManager.stopPreview();
          break;
        case 'TOGGLE_CHANGE':
          this.previewManager.toggleChange(request.changeId, request.enabled);
          break;
        case 'ENTER_VISUAL_EDITOR':
          this.visualEditor.activate();
          break;
        case 'EXIT_VISUAL_EDITOR':
          this.visualEditor.deactivate();
          break;
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ABSmartlyExtension().initialize();
  });
} else {
  new ABSmartlyExtension().initialize();
}
```

### Common Issues and Solutions

1. **Changes not applying**: Check selector validity and ensure elements exist
2. **Hover states not working**: Use `styleRules` instead of inline `style` changes
3. **React re-render issues**: Use `styleRules` and `waitForElement` for dynamic content
4. **Sample ratio mismatch**: Track DOM changes from all variants, not just the current variant
5. **Performance issues**: Use `observerRoot` to narrow observation scope
6. **Extension not connecting**: Ensure `extensionBridge: true` in plugin config
7. **Preview not removing**: Use the complete refresh pattern instead of individual removes

### Debugging and Monitoring

```javascript
// Enable comprehensive logging
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  debug: true
});

// Monitor plugin events
plugin.on('changes-applied', (data) => {
  console.log('Changes applied:', data);
});

plugin.on('error', (error) => {
  console.error('Plugin error:', error);
  // Send to error tracking service
});

// Console output includes:
// - Change applications
// - Exposure triggers
// - Element tracking
// - Observer lifecycle
// - Error details
```



### StyleRules Templates for Common Use Cases

```javascript
const STYLE_TEMPLATES = {
  primaryButton: {
    states: {
      normal: {
        backgroundColor: '#007bff',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      },
      hover: {
        backgroundColor: '#0056b3',
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
      },
      active: {
        backgroundColor: '#004085',
        transform: 'translateY(0)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }
    }
  },
  
  cardHover: {
    states: {
      normal: {
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease'
      },
      hover: {
        transform: 'translateY(-4px)',
        boxShadow: '0 8px 16px rgba(0,0,0,0.15)'
      }
    }
  },
  
  linkUnderline: {
    states: {
      normal: {
        color: '#007bff',
        textDecoration: 'none',
        position: 'relative',
        transition: 'color 0.2s ease'
      },
      hover: {
        color: '#0056b3',
        textDecoration: 'underline'
      }
    }
  }
};

// Usage in extension
function applyButtonTemplate(selector) {
  return {
    selector,
    type: 'styleRules',
    ...STYLE_TEMPLATES.primaryButton
  };
}
```

### Undo/Redo System Implementation

```javascript
class UndoRedoManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
  }

  executeChange(change, experimentName) {
    // Apply the change
    const success = this.plugin.applyChange(change, experimentName);
    
    if (success) {
      // Add to undo stack
      this.undoStack.push({
        action: 'apply',
        change,
        experimentName,
        timestamp: Date.now()
      });
      
      // Clear redo stack
      this.redoStack = [];
      
      // Limit history size
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
    }
    
    return success;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    
    const lastAction = this.undoStack.pop();
    
    // Remove the change
    this.plugin.removeSpecificChange(
      lastAction.experimentName,
      lastAction.change.selector,
      lastAction.change.type
    );
    
    // Add to redo stack
    this.redoStack.push(lastAction);
    
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    
    const action = this.redoStack.pop();
    
    // Reapply the change
    const success = this.plugin.applyChange(
      action.change,
      action.experimentName
    );
    
    if (success) {
      this.undoStack.push(action);
    }
    
    return success;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
```

## Complete Implementation Example

```javascript
class ABSmartlyVisualExtension {
  constructor() {
    this.plugin = null;
    this.previewManager = null;
    this.visualEditor = null;
    this.undoManager = null;
    this.experiments = new Map();
    this.activeVariant = null;
  }

  async initialize() {
    // Initialize plugin
    this.plugin = new DOMChangesPlugin({
      context: await this.getABSmartlyContext(),
      autoApply: true,
      spa: true,
      extensionBridge: true,
      debug: true
    });
    
    await this.plugin.initialize();
    
    // Initialize managers
    this.previewManager = new PreviewManager(this.plugin);
    this.visualEditor = new VisualEditor(this.plugin);
    this.undoManager = new UndoRedoManager(this.plugin);
    
    // Load experiments from storage/API
    await this.loadExperiments();
    
    // Setup message listeners for popup communication
    this.setupMessageListeners();
    
    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'START_PREVIEW':
          this.startPreview(request.experimentId, request.variantId);
          sendResponse({ success: true });
          break;
          
        case 'STOP_PREVIEW':
          this.stopPreview();
          sendResponse({ success: true });
          break;
          
        case 'TOGGLE_CHANGE':
          this.toggleChange(request.changeId, request.enabled);
          sendResponse({ success: true });
          break;
          
        case 'ENTER_VISUAL_EDITOR':
          this.enterVisualEditor();
          sendResponse({ success: true });
          break;
          
        case 'EXIT_VISUAL_EDITOR':
          this.exitVisualEditor();
          sendResponse({ success: true });
          break;
          
        case 'GET_STATE':
          sendResponse(this.getExtensionState());
          break;
          
        case 'UNDO':
          const undoSuccess = this.undoManager.undo();
          sendResponse({ success: undoSuccess });
          break;
          
        case 'REDO':
          const redoSuccess = this.undoManager.redo();
          sendResponse({ success: redoSuccess });
          break;
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undoManager.undo();
        this.updateUI();
      }
      
      // Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.undoManager.redo();
        this.updateUI();
      }
    });
  }

  startPreview(experimentId, variantId) {
    const experiment = this.experiments.get(experimentId);
    const variant = experiment?.variants.find(v => v.id === variantId);
    
    if (!variant) {
      console.error('Variant not found');
      return false;
    }

    // Stop current preview
    if (this.activeVariant) {
      this.stopPreview();
    }

    this.activeVariant = variant;
    this.previewManager.startPreview(variant);
    
    this.updateUI();
    return true;
  }

  stopPreview() {
    if (this.activeVariant) {
      this.previewManager.stopPreview();
      this.activeVariant = null;
      this.updateUI();
    }
  }

  toggleChange(changeId, enabled) {
    if (this.activeVariant) {
      this.previewManager.toggleChange(changeId, enabled);
      this.updateUI();
    }
  }

  enterVisualEditor() {
    this.visualEditor.activate();
    this.updateUI();
  }

  exitVisualEditor() {
    this.visualEditor.deactivate();
    this.undoManager.clear(); // Clear undo history when exiting
    this.updateUI();
  }

  getExtensionState() {
    return {
      experiments: Array.from(this.experiments.values()),
      activeVariant: this.activeVariant,
      previewActive: this.previewManager?.isPreviewMode || false,
      visualEditorActive: this.visualEditor?.active || false,
      canUndo: this.undoManager?.undoStack.length > 0,
      canRedo: this.undoManager?.redoStack.length > 0
    };
  }

  updateUI() {
    // Send state update to popup
    chrome.runtime.sendMessage({
      type: 'STATE_UPDATE',
      state: this.getExtensionState()
    });
  }

  async loadExperiments() {
    try {
      // Load from your API or storage
      const experiments = await this.fetchExperiments();
      experiments.forEach(exp => {
        this.experiments.set(exp.id, exp);
      });
    } catch (error) {
      console.error('Failed to load experiments:', error);
    }
  }

  async getABSmartlyContext() {
    // Your ABSmartly context creation logic
    // This depends on your specific setup
    return yourContextCreationLogic();
  }

  cleanup() {
    this.stopPreview();
    this.exitVisualEditor();
    this.plugin?.destroy();
  }
}

// Initialize extension
const extension = new ABSmartlyVisualExtension();
extension.initialize().catch(console.error);

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  extension.cleanup();
});

// Make available for debugging
window.absmartlyExtension = extension;
```

## Summary

The DOM Changes Plugin provides:

1. **Complete DOM Manipulation**: All change types including styleRules for pseudo-states
2. **Smart Exposure Tracking**: Prevents sample ratio mismatch with cross-variant tracking
3. **Dynamic Content Support**: Handles lazy-loaded and SPA content
4. **React/Vue Compatibility**: Changes survive re-renders
5. **Performance Optimized**: Efficient observers with automatic cleanup
6. **Developer Friendly**: Comprehensive debugging and clean API

For additional details, see:
- [EXPOSURE_TRACKING_GUIDE.md](./EXPOSURE_TRACKING_GUIDE.md) - Deep dive into exposure tracking
- [EXTENSION_STYLERULES_UI_GUIDE.md](./EXTENSION_STYLERULES_UI_GUIDE.md) - Building UI for styleRules
- [HOVER_AND_PERSISTENCE_GUIDE.md](./HOVER_AND_PERSISTENCE_GUIDE.md) - Handling hover states and React

## Testing Your Extension

To ensure your extension works correctly:

1. **Preview Mode**: Test starting/stopping preview for different variants
2. **Individual Toggle**: Test enabling/disabling individual changes
3. **Visual Editor**: Test creating changes through element interaction
4. **Undo/Redo**: Test keyboard shortcuts and UI buttons
5. **SPA Support**: Test on single-page applications with dynamic content
6. **Error Handling**: Test with invalid selectors and network failures

## Debugging Tips

- Enable `debug: true` in plugin configuration
- Use browser DevTools to inspect applied changes
- Monitor console for plugin logs and errors
- Use `getExtensionState()` to inspect current state
- Test with React Developer Tools for SPA debugging

This guide provides complete implementation examples for integrating the DOM Changes Plugin into your Chrome extension with all advanced features including preview mode, visual editing, undo/redo, and comprehensive state management.