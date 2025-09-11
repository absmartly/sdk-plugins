# ABsmartly DOM Changes SDK Plugin

A powerful plugin for the ABsmartly JavaScript SDK that enables DOM manipulation, visual editing, and seamless integration with the ABsmartly Browser Extension.

## Features

- **Complete DOM Manipulation**: All change types including styleRules with pseudo-states (hover, active, focus)
- **Smart Exposure Tracking**: Cross-variant tracking prevents sample ratio mismatch with `trigger_on_view` control
- **Dynamic Content Support**: Pending changes with `waitForElement` for lazy-loaded content and SPAs
- **React/Vue Compatibility**: StyleRules survive re-renders through stylesheet injection
- **Browser Extension Integration**: Two-way communication with the ABsmartly Browser Extension for visual editing
- **Automatic SDK Integration**: Auto-apply changes from ABsmartly SDK with `autoApply` mode
- **Performance Optimized**: Efficient MutationObservers with automatic cleanup and scoped watching
- **Preview Mode**: Test DOM changes before creating experiments with exposure control
- **Cookie-Based Overrides**: Server-compatible experiment overrides via cookies
- **Code Injection**: Support for custom code injection at various page locations
- **Flexible Data Sources**: Support for both variables and custom fields

## Installation

```bash
npm install @absmartly/dom-changes-plugin
```

## Quick Start

```javascript
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';
import absmartly from '@absmartly/javascript-sdk';

// Initialize ABsmartly SDK
const sdk = new absmartly.SDK({
  endpoint: 'https://your-endpoint.absmartly.io/v1',
  apiKey: 'YOUR_API_KEY',
  environment: 'production',
  application: 'your-app'
});

// Create context
const context = sdk.createContext(request);

// Initialize the DOM Changes Plugin
const plugin = new DOMChangesPlugin({
  context: context,
  autoApply: true,              // Automatically apply changes on init
  spa: true,                     // Enable SPA support
  visibilityTracking: true,     // Track when changes become visible
  extensionBridge: true,         // Enable browser extension communication
  dataSource: 'variable',        // Use variables (or 'customField')
  dataFieldName: '__dom_changes', // Variable/field name for DOM changes
  debug: true                    // Enable debug logging
});

// Initialize the plugin
await plugin.initialize();
```

## DOM Change Types

The plugin supports comprehensive DOM manipulation with advanced features:

### Core Change Types

### Text Change
```javascript
{
  selector: '.headline',
  type: 'text',
  value: 'New Headline Text'
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

### Style Change (Inline)
```javascript
{
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red',    // Use camelCase for CSS properties
    color: '#ffffff',
    fontSize: '18px'
  },
  trigger_on_view: false  // Control exposure timing
}
```

### Style Rules (With Pseudo-States) ⭐ NEW
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

### Class Change
```javascript
{
  selector: '.card',
  type: 'class',
  add: ['highlighted', 'featured'],
  remove: ['default']
}
```

### Attribute Change
```javascript
{
  selector: 'input[name="email"]',
  type: 'attribute',
  value: {
    'placeholder': 'Enter your email',
    'required': 'true'
  }
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

### Element Move
```javascript
{
  selector: '.sidebar',
  type: 'move',
  targetSelector: '.main-content',
  position: 'before' // 'before', 'after', 'firstChild', 'lastChild'
}
```

### Element Creation
```javascript
{
  selector: '.new-banner', // For identification
  type: 'create',
  element: '<div class="banner">Special Offer!</div>',
  targetSelector: 'body',
  position: 'firstChild',
  trigger_on_view: false
}
```

### Pending Changes (Elements Not Yet in DOM) ⭐ NEW
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

**Perfect for:**
- Lazy-loaded content
- React components that mount/unmount
- Modal dialogs
- API-loaded content
- Infinite scroll items

## Key Features

### Exposure Tracking with trigger_on_view

The `trigger_on_view` property prevents sample ratio mismatch by controlling when A/B test exposures are recorded:

```javascript
{
  selector: '.below-fold-element',
  type: 'style',
  value: { backgroundColor: 'blue' },
  trigger_on_view: true  // Only trigger when element becomes visible
}
```

- **`false` (default)**: Exposure triggers immediately
- **`true`**: Exposure triggers when element enters viewport
- **Cross-variant tracking**: Tracks elements from ALL variants for unbiased exposure

### Core API Methods

```javascript
// Apply changes from ABsmartly context
await plugin.applyChanges('experiment-name');

// Apply individual change
const success = plugin.applyChange(change, 'experiment-name');

// Remove changes
plugin.removeChanges('experiment-name');

// Get applied changes
const changes = plugin.getAppliedChanges('experiment-name');

// Clean up resources
plugin.destroy();
```

## Browser Extension Integration

The plugin communicates with the ABsmartly Browser Extension for visual editing:

- **Automatic Detection**: Detects and connects to the extension
- **Message Protocol**: Two-way communication for preview mode and visual editing
- **Preview Support**: Test changes before creating experiments

## Documentation

For detailed documentation:

- **[Extension Integration Guide](docs/EXTENSION_INTEGRATION_GUIDE.md)** - Complete guide for browser extension integration, visual editing, preview mode, and advanced features
- **[Exposure Tracking Guide](docs/EXPOSURE_TRACKING_GUIDE.md)** - Understanding trigger_on_view and preventing sample ratio mismatch

## Configuration Options

```javascript
new DOMChangesPlugin({
  context: absmartlyContext,     // Required: ABsmartly context
  autoApply: true,               // Auto-apply changes from SDK
  spa: true,                     // Enable SPA support
  extensionBridge: true,         // Enable browser extension communication
  dataSource: 'variable',        // 'variable' or 'customField'
  dataFieldName: '__dom_changes', // Variable/field name for changes
  debug: false                   // Enable debug logging
})
```

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Internet Explorer 11+ (with polyfills)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT