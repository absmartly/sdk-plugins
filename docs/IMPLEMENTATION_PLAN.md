# ABsmartly DOM Changes SDK Plugin - Implementation Plan

## Project Overview
A plugin for the ABsmartly JavaScript SDK that enables DOM manipulation, browser extension integration, and visual editor support. The plugin will replace the current sdk-bridge functionality in the browser extension.

## 1. Project Structure

```
absmartly-dom-changes-sdk-plugin/
├── src/
│   ├── index.ts                    # Main plugin export
│   ├── core/
│   │   ├── DOMChangesPlugin.ts     # Main plugin class
│   │   ├── DOMManipulator.ts       # DOM manipulation logic
│   │   ├── StateManager.ts         # State & change tracking
│   │   └── MessageBridge.ts        # Browser extension communication
│   ├── observers/
│   │   ├── MutationHandler.ts      # SPA support
│   │   └── ViewportObserver.ts     # Visibility tracking
│   ├── parsers/
│   │   ├── ChangeParser.ts         # Parse experiment changes
│   │   └── VariantExtractor.ts     # Extract DOM changes from experiments
│   ├── injection/
│   │   └── CodeInjector.ts         # Handle custom code injection
│   └── types/
│       └── index.ts                 # TypeScript definitions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── examples/
│   ├── basic-usage.html
│   ├── spa-app/
│   └── with-extension/
├── dist/                            # Built files
├── docs/
│   ├── API.md
│   ├── INTEGRATION.md
│   └── VISUAL_EDITOR.md
└── package.json
```

## 2. Core Features

### 2.1 DOM Manipulation
- **Change Types**: 
  - text: Update text content
  - html: Update HTML content
  - style: Apply CSS styles
  - class: Add/remove CSS classes
  - attribute: Set/remove attributes
  - javascript: Execute JavaScript code
  - move: Move existing element
  - **create**: Create new element and insert at target
- **State Preservation**: Store original DOM state for reverting
- **Error Handling**: Graceful failure when elements not found
- **Validation**: Ensure selectors are valid and elements exist

### 2.2 Custom Code Injection
- **Injection Points**: Support for head start/end, body start/end
- **Script Management**: Track and manage injected scripts
- **Extension Communication**: Extension sends injection code to plugin
- **Cleanup**: Remove injected code when needed

### 2.3 Extension Communication
- **Cookie-Based Overrides**: Store overrides in cookies for server-side compatibility
- **Message Bridge**: Two-way communication with browser extension
- **Preview Mode**: Apply/remove changes without experiments for testing
- **Code Injection Requests**: Plugin requests injection code from extension

### 2.4 SDK Integration
- **Context Integration**: Work with ABsmartly Context
- **Experiment Traversal**: Loop through all experiments in `context.data()`
- **Flexible Data Source**: 
  - Variables: Look for `__dom_changes` or custom variable name in experiment variants
  - Custom Fields: Use `context.customFieldValue(experimentName, fieldName)`
- **Delayed Exposure**: Use `peek()` until changes visible, then `treatment()`

### 2.5 SPA Support
- **MutationObserver**: Watch for new elements
- **Pending Changes**: Queue changes for elements not yet in DOM
- **Retry Logic**: Attempt to apply changes when elements appear
- **Dynamic Content**: Handle route changes and lazy loading

### 2.6 Performance Optimization
- **Viewport Tracking**: Only trigger exposure when changes visible
- **Batch Operations**: Apply multiple changes efficiently
- **Debouncing**: Optimize mutation observer callbacks
- **Memory Management**: Clean up observers and listeners

## 3. API Design

### 3.1 Plugin Initialization
```typescript
import { DOMChangesPlugin } from '@absmartly/dom-changes-plugin';

// Initialize with ABsmartly context
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,           // Required: ABsmartly context
  autoApply: true,                     // Auto-apply changes on init
  spa: true,                           // Enable SPA support
  visibilityTracking: true,            // Delay treatment until visible
  extensionBridge: true,                // Enable extension communication
  
  // Data source configuration
  dataSource: 'variable',              // 'variable' or 'customField'
  dataFieldName: '__dom_changes',      // Name of variable/field (__ prefix for variables)
  
  // Cookie configuration for overrides
  overrideCookieName: 'absmartly_overrides',  // Cookie name for overrides
  
  debug: false                          // Debug logging
});
```

### 3.2 Core Methods
```typescript
// Initialization
await plugin.initialize();

// Preview Methods (for extension/visual editor)
plugin.previewChanges(changes: DOMChange[]);  // Apply changes without experiment
plugin.removePreview();                        // Remove preview changes
plugin.isPreviewActive(): boolean;             // Check preview status

// Experiment Methods
plugin.applyChanges(experimentName?: string);  // Apply experiment changes
plugin.removeChanges(experimentName?: string); // Remove experiment changes
plugin.refreshChanges();                       // Re-fetch and apply changes

// Override Management (via cookies)
plugin.getOverridesFromCookie(): Overrides;    // Read overrides from cookie
plugin.applyOverridesToContext();              // Apply cookie overrides to context

// Code Injection
plugin.requestInjectionCode();                 // Request code from extension
plugin.injectCode(injectionData: InjectionData); // Inject custom code

// State Inspection
plugin.getAppliedChanges(): AppliedChange[];
plugin.getPendingChanges(): PendingChange[];
plugin.hasChanges(experimentName: string): boolean;
plugin.getOriginalState(selector: string): ElementState;

// Cleanup
plugin.destroy();                              // Clean up all listeners and observers
```

### 3.3 Event System
```typescript
// Listen to plugin events
plugin.on('changes-applied', (data) => {});
plugin.on('changes-removed', (data) => {});
plugin.on('preview-started', (data) => {});
plugin.on('preview-ended', (data) => {});
plugin.on('experiment-triggered', (data) => {});
plugin.on('code-injected', (data) => {});
plugin.on('error', (error) => {});
```

## 4. Experiment Data Extraction

### How to Extract DOM Changes:
```typescript
private extractDOMChanges(): Map<string, DOMChange[]> {
  const changesMap = new Map<string, DOMChange[]>();
  const contextData = this.context.data();
  
  if (!contextData || !contextData.experiments) {
    return changesMap;
  }
  
  // Loop through all experiments
  for (const experiment of contextData.experiments) {
    const experimentName = experiment.name;
    
    if (this.config.dataSource === 'variable') {
      // For variables, we need to look in the variant data
      const variant = this.getActiveVariant(experiment);
      if (variant && variant.variables) {
        // Look for __dom_changes or configured variable name
        const changes = variant.variables[this.config.dataFieldName];
        if (changes) {
          changesMap.set(experimentName, this.parseChanges(changes));
        }
      }
    } else {
      // For custom fields, use the SDK method
      const changes = this.context.customFieldValue(experimentName, this.config.dataFieldName);
      if (changes) {
        changesMap.set(experimentName, this.parseChanges(changes));
      }
    }
  }
  
  return changesMap;
}

private getActiveVariant(experiment: any) {
  // Use peek to get variant without triggering exposure
  const variantIndex = this.context.peek(experiment.name);
  return experiment.variants?.[variantIndex];
}
```

## 5. Message Protocol

### 5.1 Plugin → Extension (Requests)
```typescript
// Request injection code
{
  source: 'absmartly-sdk',
  type: 'REQUEST_INJECTION_CODE',
  payload: {}
}

// Plugin ready notification
{
  source: 'absmartly-sdk',
  type: 'PLUGIN_READY',
  payload: { version: string, capabilities: string[] }
}

// Request current overrides
{
  source: 'absmartly-sdk',
  type: 'REQUEST_OVERRIDES',
  payload: {}
}
```

### 5.2 Extension → Plugin (Commands)
```typescript
// Apply preview changes
{
  source: 'absmartly-extension',
  type: 'PREVIEW_CHANGES',
  payload: { changes: DOMChange[] }
}

// Remove preview
{
  source: 'absmartly-extension',
  type: 'REMOVE_PREVIEW',
  payload: {}
}

// Provide injection code
{
  source: 'absmartly-extension',
  type: 'INJECTION_CODE',
  payload: {
    headStart?: string,
    headEnd?: string,
    bodyStart?: string,
    bodyEnd?: string
  }
}

// Update overrides cookie
{
  source: 'absmartly-extension',
  type: 'UPDATE_OVERRIDES',
  payload: { overrides: Overrides }
}
```

## 6. Type Definitions

```typescript
interface DOMChange {
  selector: string;
  type: 'text' | 'html' | 'style' | 'class' | 'attribute' | 'javascript' | 'move' | 'create';
  value?: any;
  enabled?: boolean;
  
  // For class changes
  add?: string[];
  remove?: string[];
  
  // For move operations
  targetSelector?: string;
  position?: 'before' | 'after' | 'firstChild' | 'lastChild';
  
  // For create operations
  element?: string;  // HTML string for new element
  targetSelector?: string;
  position?: 'before' | 'after' | 'firstChild' | 'lastChild';
}

interface InjectionData {
  headStart?: string;
  headEnd?: string;
  bodyStart?: string;
  bodyEnd?: string;
}

interface ElementState {
  selector: string;
  type: string;
  originalState: {
    text?: string;
    html?: string;
    style?: string;
    classList?: string[];
    attributes?: Record<string, string>;
    parent?: Element;
    nextSibling?: Element;
  };
}

interface Overrides {
  [experimentName: string]: number;  // variant index
}

interface PluginConfig {
  context: any;  // ABsmartly Context
  autoApply?: boolean;
  spa?: boolean;
  visibilityTracking?: boolean;
  extensionBridge?: boolean;
  dataSource?: 'variable' | 'customField';
  dataFieldName?: string;
  overrideCookieName?: string;
  debug?: boolean;
}
```

## 7. Cookie-Based Override System

### How it works:
1. **Extension writes cookie**: When user selects variant overrides in extension
2. **Plugin reads cookie**: On initialization and periodically
3. **Apply to context**: Use `context.override(experimentName, variant)`
4. **Server compatibility**: Server-side SDK can also read the same cookie

### Cookie Format:
```javascript
// Cookie name: absmartly_overrides
// Value: JSON string
{
  "experiment1": 1,  // variant index
  "experiment2": 0,
  "experiment3": 2
}
```

### Benefits:
- Works with both client and server-side SDK
- Persists across page reloads
- No need for complex state management
- Standard web technology

### Implementation:
```typescript
private applyOverridesToContext() {
  const cookie = this.getOverridesFromCookie();
  if (cookie) {
    const overrides = JSON.parse(cookie);
    for (const [experimentName, variantIndex] of Object.entries(overrides)) {
      this.context.override(experimentName, variantIndex);
    }
  }
}

private getOverridesFromCookie(): string | null {
  const name = this.config.overrideCookieName + '=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return null;
}
```

## 8. Code Injection System

### Flow:
1. Plugin initializes and requests injection code from extension
2. Extension responds with code for different injection points
3. Plugin injects code at appropriate locations
4. Plugin tracks injected elements for cleanup

### Injection Points:
- **Head Start**: After opening `<head>` tag
- **Head End**: Before closing `</head>` tag
- **Body Start**: After opening `<body>` tag
- **Body End**: Before closing `</body>` tag

### Implementation:
```typescript
class CodeInjector {
  private injectedElements: Map<string, HTMLElement[]> = new Map();
  
  inject(location: 'headStart' | 'headEnd' | 'bodyStart' | 'bodyEnd', code: string) {
    const container = document.createElement('div');
    container.innerHTML = code;
    
    const elements: HTMLElement[] = [];
    while (container.firstChild) {
      const element = container.firstChild as HTMLElement;
      elements.push(element);
      
      switch (location) {
        case 'headStart':
          document.head.insertBefore(element, document.head.firstChild);
          break;
        case 'headEnd':
          document.head.appendChild(element);
          break;
        case 'bodyStart':
          document.body.insertBefore(element, document.body.firstChild);
          break;
        case 'bodyEnd':
          document.body.appendChild(element);
          break;
      }
    }
    
    this.injectedElements.set(location, elements);
  }
  
  cleanup() {
    this.injectedElements.forEach(elements => {
      elements.forEach(el => el.remove());
    });
    this.injectedElements.clear();
  }
}
```

## 9. Create Element Change Type

### Implementation for creating new elements:
```typescript
case 'create':
  if (change.element && change.targetSelector) {
    const target = document.querySelector(change.targetSelector);
    if (target) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = change.element;
      const newElement = tempContainer.firstElementChild;
      
      if (newElement) {
        // Store for reverting
        this.createdElements.set(changeId, newElement);
        
        switch (change.position) {
          case 'before':
            target.parentElement?.insertBefore(newElement, target);
            break;
          case 'after':
            if (target.nextSibling) {
              target.parentElement?.insertBefore(newElement, target.nextSibling);
            } else {
              target.parentElement?.appendChild(newElement);
            }
            break;
          case 'firstChild':
            target.insertBefore(newElement, target.firstChild);
            break;
          case 'lastChild':
          default:
            target.appendChild(newElement);
            break;
        }
        
        newElement.setAttribute('data-absmartly-created', 'true');
      }
    }
  }
  break;
```

## 10. Implementation Phases

### Phase 1: Core Foundation (Days 1-2)
- [ ] Set up TypeScript project with build system
- [ ] Implement DOMManipulator with all change types including 'create'
- [ ] Create StateManager for tracking changes
- [ ] Basic plugin class with initialization

### Phase 2: SDK Integration (Days 3-4)
- [ ] Integrate with ABsmartly Context
- [ ] Implement experiment traversal and data extraction
- [ ] Cookie-based override system
- [ ] Handle peek() vs treatment() logic

### Phase 3: Extension Bridge (Days 5-6)
- [ ] Implement MessageBridge for communication
- [ ] Add preview functionality
- [ ] Code injection system
- [ ] Status updates to extension

### Phase 4: Advanced Features (Week 2)
- [ ] MutationObserver for SPA support
- [ ] Viewport visibility tracking
- [ ] Performance optimizations
- [ ] Error recovery mechanisms

### Phase 5: Testing & Documentation (Week 2-3)
- [ ] Unit tests for all modules
- [ ] Integration tests with SDK
- [ ] E2E tests with extension
- [ ] API documentation
- [ ] Usage examples

### Phase 6: Release Preparation (Week 3)
- [ ] Performance testing
- [ ] Security review
- [ ] CI/CD setup
- [ ] NPM publishing setup
- [ ] GitHub repository setup

## 11. Security Considerations

- Sanitize HTML content before injection
- Validate JavaScript execution in sandbox
- Secure cookie handling (HttpOnly where possible)
- XSS prevention
- CSP compliance
- Validate message origins

## Next Steps

1. Initialize project structure
2. Set up build system with TypeScript
3. Implement core DOMManipulator module
4. Add experiment data extraction logic
5. Implement cookie-based override system
6. Create message bridge for extension
7. Add code injection support
8. Create comprehensive tests
9. Write documentation