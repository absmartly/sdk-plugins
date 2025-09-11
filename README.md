# ABsmartly DOM Changes SDK Plugin

A powerful plugin for the ABsmartly JavaScript SDK that enables DOM manipulation, visual editing, and seamless integration with the ABsmartly Browser Extension.

## Features

- **DOM Manipulation**: Apply various types of DOM changes (text, HTML, styles, classes, attributes, JavaScript execution, element moves, and element creation)
- **Browser Extension Integration**: Two-way communication with the ABsmartly Browser Extension for visual editing
- **SPA Support**: Automatic handling of dynamically loaded content with MutationObserver
- **Preview Mode**: Test DOM changes before creating experiments
- **Cookie-Based Overrides**: Server-compatible experiment overrides via cookies
- **Code Injection**: Support for custom code injection at various page locations
- **Viewport Tracking**: Delayed experiment exposure until changes are visible
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

The plugin supports the following DOM change types:

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

### Style Change
```javascript
{
  selector: '.button',
  type: 'style',
  value: {
    'background-color': '#ff0000',
    'color': '#ffffff',
    'font-size': '18px'
  }
}
```

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
  position: 'firstChild'
}
```

## API Reference

### Initialization

```javascript
new DOMChangesPlugin(config: PluginConfig)
```

**Config Options:**
- `context` (required): ABsmartly context instance
- `autoApply`: Automatically apply changes on initialization (default: true)
- `spa`: Enable SPA support with MutationObserver (default: true)
- `visibilityTracking`: Track element visibility before triggering experiments (default: true)
- `extensionBridge`: Enable browser extension communication (default: true)
- `dataSource`: Source for DOM changes - 'variable' or 'customField' (default: 'variable')
- `dataFieldName`: Name of the variable/field containing DOM changes (default: '__dom_changes')
- `overrideCookieName`: Cookie name for experiment overrides (default: 'absmartly_overrides')
- `debug`: Enable debug logging (default: false)

### Core Methods

#### Apply Changes
```javascript
// Apply all experiment changes
await plugin.applyChanges();

// Apply changes for specific experiment
await plugin.applyChanges('experiment-name');
```

#### Remove Changes
```javascript
// Remove all changes
plugin.removeChanges();

// Remove changes for specific experiment
plugin.removeChanges('experiment-name');
```

#### Preview Mode
```javascript
// Preview changes without creating an experiment
plugin.previewChanges([
  { selector: '.title', type: 'text', value: 'Preview Text' }
]);

// Remove preview
plugin.removePreview();

// Check if preview is active
const isActive = plugin.isPreviewActive();
```

#### State Inspection
```javascript
// Get all applied changes
const applied = plugin.getAppliedChanges();

// Get pending changes (for SPA)
const pending = plugin.getPendingChanges();

// Check if experiment has changes
const hasChanges = plugin.hasChanges('experiment-name');

// Get original state of an element
const original = plugin.getOriginalState('.my-element');
```

#### Cookie-Based Overrides
```javascript
// Get current overrides from cookie
const overrides = plugin.getOverridesFromCookie();

// Apply overrides to context
plugin.applyOverridesToContext();
```

#### Code Injection
```javascript
// Request injection code from extension
plugin.requestInjectionCode();

// Manually inject code
plugin.injectCode({
  headStart: '<script>console.log("Head Start")</script>',
  headEnd: '<style>.custom { color: red; }</style>',
  bodyStart: '<div id="notification">Welcome!</div>',
  bodyEnd: '<script>console.log("Body End")</script>'
});
```

### Events

```javascript
// Listen to plugin events
plugin.on('changes-applied', (data) => {
  console.log(`Applied ${data.count} changes`);
});

plugin.on('preview-started', (data) => {
  console.log(`Preview started with ${data.changeCount} changes`);
});

plugin.on('experiment-triggered', (data) => {
  console.log(`Experiment ${data.experimentName} triggered`);
});

plugin.on('error', (error) => {
  console.error('Plugin error:', error);
});
```

**Available Events:**
- `initialized`: Plugin successfully initialized
- `changes-applied`: DOM changes were applied
- `changes-removed`: DOM changes were removed
- `preview-started`: Preview mode started
- `preview-ended`: Preview mode ended
- `experiment-triggered`: Experiment exposure was triggered
- `code-injected`: Custom code was injected
- `error`: An error occurred

## Browser Extension Integration

The plugin automatically communicates with the ABsmartly Browser Extension when `extensionBridge` is enabled.

### Message Protocol

The plugin listens for these messages from the extension:
- `PREVIEW_CHANGES`: Apply preview changes
- `REMOVE_PREVIEW`: Remove preview changes
- `APPLY_CHANGES`: Apply experiment changes
- `REMOVE_CHANGES`: Remove experiment changes
- `INJECTION_CODE`: Provide code for injection
- `UPDATE_OVERRIDES`: Update experiment overrides

The plugin sends these messages to the extension:
- `PLUGIN_READY`: Plugin initialization complete
- `CHANGES_APPLIED`: Changes successfully applied
- `PREVIEW_STARTED`: Preview mode activated
- `EXPERIMENT_TRIGGERED`: Experiment exposure logged

## SPA Support

When `spa` is enabled, the plugin automatically handles dynamically loaded content:

1. Changes for missing elements are queued as "pending"
2. MutationObserver watches for new elements
3. Pending changes are applied when matching elements appear
4. Retry logic handles temporary DOM states

## Experiment Data Format

The plugin expects DOM changes in your ABsmartly experiments as either variables or custom fields:

### Using Variables
```json
{
  "experiments": [{
    "name": "homepage-test",
    "variants": [{
      "variables": {
        "__dom_changes": [
          {
            "selector": ".hero-title",
            "type": "text",
            "value": "Welcome to Our Store!",
            "enabled": true
          }
        ]
      }
    }]
  }]
}
```

### Using Custom Fields
```javascript
// Configure plugin for custom fields
const plugin = new DOMChangesPlugin({
  context: context,
  dataSource: 'customField',
  dataFieldName: 'dom_changes'
});
```

## Advanced Usage

### Server-Side Rendering (SSR)

The cookie-based override system works with server-side rendering:

```javascript
// Server-side: Read override cookie
const overrides = req.cookies.absmartly_overrides;
if (overrides) {
  const parsed = JSON.parse(overrides);
  // Apply overrides to server-side context
  Object.entries(parsed).forEach(([exp, variant]) => {
    context.override(exp, variant);
  });
  // Or even better, just call context.overrides(parsed);
}
```

### Custom Event Handlers

```javascript
// Track when changes become visible
plugin.on('experiment-triggered', ({ experimentName }) => {
  analytics.track('Experiment Viewed', {
    experiment: experimentName,
    variant: context.treatment(experimentName)
  });
});

// Monitor errors
plugin.on('error', (error) => {
  errorReporting.log(error);
});
```

### Cleanup

```javascript
// Destroy plugin and clean up resources
plugin.destroy();
```

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/absmartly/dom-changes-plugin.git
cd dom-changes-plugin

# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test

# Development mode with watch
npm run dev
```

### Project Structure

```
src/
├── core/
│   ├── DOMChangesPlugin.ts     # Main plugin class
│   ├── DOMManipulator.ts       # DOM manipulation logic
│   ├── StateManager.ts         # State management
│   └── MessageBridge.ts        # Extension communication
├── observers/
│   ├── MutationHandler.ts      # SPA support
│   └── ViewportObserver.ts     # Visibility tracking
├── parsers/
│   └── VariantExtractor.ts     # Extract changes from experiments
├── injection/
│   └── CodeInjector.ts         # Code injection handling
└── types/
    └── index.ts                 # TypeScript definitions
```

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Internet Explorer 11+ (with polyfills)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [https://github.com/absmartly/dom-changes-plugin/issues](https://github.com/absmartly/dom-changes-plugin/issues)
- Documentation: [https://docs.absmartly.com](https://docs.absmartly.com)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.