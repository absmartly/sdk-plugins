# ABSmartly DOM Changes Plugin - Complete Extension Integration Guide

This guide covers everything you need to integrate the DOM Changes Plugin into your Chrome extension, including all latest features.

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
  trigger_on_view: true  // ALWAYS use true for moves
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
  // Tracks elements from ALL variants to prevent bias
}
```

## Best Practices

### 1. Exposure Timing Strategy

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

### 2. Performance Optimization

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

### 3. Handling React/Vue Apps

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

### 4. Debugging

```javascript
// Enable comprehensive logging
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  debug: true
});

// Console output includes:
// - Change applications
// - Exposure triggers
// - Element tracking
// - Observer lifecycle
// - Error details
```

### 5. Clean Architecture

```javascript
class ExperimentManager {
  constructor() {
    this.experiments = new Map();
  }

  registerExperiment(name, changes) {
    this.experiments.set(name, {
      name,
      changes,
      applied: false
    });
  }

  applyExperiment(name) {
    const exp = this.experiments.get(name);
    if (!exp || exp.applied) return;

    exp.changes.forEach(change => {
      this.plugin.applyChange(change, name);
    });
    
    exp.applied = true;
  }

  cleanupExperiment(name) {
    this.plugin.removeChanges(name);
    this.experiments.delete(name);
  }

  cleanupAll() {
    for (const [name] of this.experiments) {
      this.cleanupExperiment(name);
    }
  }
}

// Use in extension
window.addEventListener('beforeunload', () => {
  experimentManager.cleanupAll();
});
```

## Common Issues & Solutions

### Issue: Changes Not Applying

```javascript
// Problem: Element doesn't exist yet
// Solution: Use waitForElement
{
  selector: '.dynamic-element',
  type: 'style',
  value: { color: 'red' },
  waitForElement: true
}
```

### Issue: Hover States Lost on React Re-render

```javascript
// Problem: Inline styles don't handle :hover
// Solution: Use styleRules
{
  selector: '.button',
  type: 'styleRules',
  states: {
    normal: { backgroundColor: 'blue' },
    hover: { backgroundColor: 'darkblue' }
  }
}
```

### Issue: Sample Ratio Mismatch

```javascript
// Problem: Different visibility across variants
// Solution: Use trigger_on_view for below-fold
{
  selector: '.below-fold',
  type: 'text',
  value: 'New text',
  trigger_on_view: true
}
```

### Issue: Performance with Many Elements

```javascript
// Problem: Watching entire document
// Solution: Use observerRoot
{
  selector: '.list-item',
  type: 'style',
  value: { border: '1px solid blue' },
  waitForElement: true,
  observerRoot: '.list-container'  // Narrow scope
}
```

## Complete Implementation Example

```javascript
class ABTestingExtension {
  constructor() {
    this.plugin = null;
    this.activeExperiments = new Map();
  }

  async initialize() {
    // Get ABSmartly context
    const context = await this.createABSmartlyContext();
    
    // Initialize plugin with all features
    this.plugin = new DOMChangesPlugin({
      context,
      debug: true,
      autoApply: true,  // Auto-apply from SDK
      spa: true,        // Handle SPAs
      dataFieldName: '__dom_changes'
    });
    
    await this.plugin.initialize();
    
    // Plugin automatically handles SDK changes
    // Additional manual control available:
    this.setupManualControls();
  }

  setupManualControls() {
    // Preview mode
    this.previewManager = new PreviewManager(this.plugin);
    
    // Visual editor
    this.visualEditor = new VisualEditor(this.plugin);
    
    // SPA handler
    this.spaHandler = new SPAHandler(this.plugin);
  }

  // Manual experiment application
  applyExperiment(experimentName, changes) {
    // Validate changes
    const validChanges = changes.filter(this.validateChange);
    
    // Apply with proper exposure tracking
    validChanges.forEach(change => {
      // Ensure proper exposure tracking
      const trackedChange = {
        ...change,
        trigger_on_view: this.shouldTriggerOnView(change)
      };
      
      this.plugin.applyChange(trackedChange, experimentName);
    });
    
    this.activeExperiments.set(experimentName, validChanges);
  }

  shouldTriggerOnView(change) {
    // Move changes always use viewport tracking
    if (change.type === 'move') return true;
    
    // Check if element is likely below fold
    const element = document.querySelector(change.selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      return rect.top > window.innerHeight;
    }
    
    // Default to immediate for unknown elements
    return false;
  }

  validateChange(change) {
    // Required fields
    if (!change.selector || !change.type) return false;
    
    // Type-specific validation
    switch (change.type) {
      case 'styleRules':
        return change.states && change.states.normal;
      case 'move':
        return Boolean(change.targetSelector);
      case 'create':
        return Boolean(change.element && change.targetSelector);
      default:
        return true;
    }
  }

  // Cleanup
  cleanup() {
    // Remove all active experiments
    for (const [name] of this.activeExperiments) {
      this.plugin.removeChanges(name);
    }
    
    // Destroy plugin
    this.plugin.destroy();
  }
}

// Initialize extension
const extension = new ABTestingExtension();
extension.initialize();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  extension.cleanup();
});
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

This guide contains everything needed to integrate the DOM Changes Plugin into your Chrome extension with all the latest features.