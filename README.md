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

## Exposure Tracking ⭐ NEW

### Understanding trigger_on_view

The `trigger_on_view` property controls when an A/B test exposure event is recorded:

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

### Core Methods

#### Apply Changes
```javascript
// Apply all experiment changes from SDK (autoApply mode)
await plugin.applyChanges();

// Apply changes for specific experiment
await plugin.applyChanges('experiment-name');

// Apply single change manually
const success = plugin.applyChange(change, experimentName);
```

#### Remove Changes
```javascript
// Remove all changes
plugin.removeChanges();

// Remove changes for specific experiment
plugin.removeChanges('experiment-name');

// Remove a specific change (removes the first matching one)
plugin.removeSpecificChange(experimentName, selector, changeType);

// Revert a specific applied change
plugin.revertChange(appliedChange);
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
const applied = plugin.getAppliedChanges(experimentName);

// Get pending changes (for SPA)
const pending = plugin.getPendingChanges();

// Check if experiment has changes
const hasChanges = plugin.hasChanges('experiment-name');

// Get all tracked experiments
const experiments = plugin.getExperiments();

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