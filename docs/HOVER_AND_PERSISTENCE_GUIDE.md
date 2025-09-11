# Handling Hover Effects and React Overwrites

## The Problems

1. **Hover State Conflicts**: When you apply a style change (e.g., red background), the CSS hover state still uses the original colors
2. **React Overwrites**: React re-renders can overwrite your DOM changes when state updates occur
3. **Elements Not Yet in DOM**: Elements that load later (lazy-loaded, modals, API responses) miss the initial DOM changes

## Solutions

### 1. CSS-Based Hover State Override

The most reliable approach is to inject CSS that overrides hover states:

```javascript
// Instead of just changing the button color
const styleChange = {
  selector: '.button',
  type: 'style',
  value: {
    backgroundColor: 'red'
  }
};

// Also inject CSS for hover state
const hoverCssChange = {
  selector: 'absmartly-hover-styles', // Unique ID for the style element
  type: 'create',
  element: `
    <style id="absmartly-hover-styles">
      .button {
        background-color: red !important;
      }
      .button:hover {
        background-color: darkred !important;
      }
      /* Handle any transition states */
      .button:active,
      .button:focus {
        background-color: darkred !important;
      }
    </style>
  `,
  targetSelector: 'head',
  position: 'lastChild'
};

// Apply both changes
plugin.applyChange(styleChange, 'experiment-1');
plugin.applyChange(hoverCssChange, 'experiment-1');
```

### 2. Using JavaScript Change with Event Listeners

For more complex hover behaviors:

```javascript
const hoverBehaviorChange = {
  selector: '.button',
  type: 'javascript',
  value: `
    // Store original colors
    const originalBg = element.style.backgroundColor || '';
    const targetBg = 'red';
    const hoverBg = 'darkred';
    
    // Set initial color
    element.style.backgroundColor = targetBg;
    
    // Override hover behavior
    element.addEventListener('mouseenter', function(e) {
      e.target.style.backgroundColor = hoverBg;
    });
    
    element.addEventListener('mouseleave', function(e) {
      e.target.style.backgroundColor = targetBg;
    });
    
    // Mark element to prevent React overwrites
    element.setAttribute('data-absmartly-styled', 'true');
  `
};

plugin.applyChange(hoverBehaviorChange, 'experiment-1');
```

### 3. MutationObserver for React Overwrite Protection

Implement a watcher that reapplies changes when React overwrites them:

```javascript
class PersistentChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.watchedChanges = new Map();
    this.observer = null;
  }

  applyPersistentChange(change, experimentName) {
    // Apply the change
    this.plugin.applyChange(change, experimentName);
    
    // Store for reapplication
    const key = `${change.selector}-${change.type}`;
    this.watchedChanges.set(key, { change, experimentName });
    
    // Start watching if not already
    if (!this.observer) {
      this.startWatching();
    }
  }

  startWatching() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // Check if any of our targeted elements were modified
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const element = mutation.target;
          
          // Check if this element matches any of our selectors
          this.watchedChanges.forEach(({ change, experimentName }) => {
            if (element.matches(change.selector)) {
              // Check if our change was overwritten
              if (!this.isChangeIntact(element, change)) {
                // Reapply the change
                this.reapplyChange(element, change);
              }
            }
          });
        }
      });
    });

    // Start observing
    this.observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: true,
      attributeOldValue: true
    });
  }

  isChangeIntact(element, change) {
    if (change.type === 'style') {
      // Check if our styles are still applied
      for (const [prop, value] of Object.entries(change.value)) {
        const currentValue = element.style[prop];
        if (currentValue !== value) {
          return false;
        }
      }
    }
    return true;
  }

  reapplyChange(element, change) {
    // Reapply just the style properties
    if (change.type === 'style') {
      Object.entries(change.value).forEach(([prop, value]) => {
        element.style[prop] = value;
      });
    }
  }

  stopWatching() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.watchedChanges.clear();
  }
}
```

### 4. Combined Solution with CSS Variables

This approach uses CSS variables for better control:

```javascript
// Step 1: Inject CSS that uses variables
const cssVariableChange = {
  selector: 'absmartly-dynamic-styles',
  type: 'create',
  element: `
    <style id="absmartly-dynamic-styles">
      :root {
        --absmartly-button-bg: red;
        --absmartly-button-hover-bg: darkred;
        --absmartly-button-active-bg: #aa0000;
      }
      
      .button[data-absmartly-modified="true"] {
        background-color: var(--absmartly-button-bg) !important;
        transition: background-color 0.2s ease;
      }
      
      .button[data-absmartly-modified="true"]:hover {
        background-color: var(--absmartly-button-hover-bg) !important;
      }
      
      .button[data-absmartly-modified="true"]:active {
        background-color: var(--absmartly-button-active-bg) !important;
      }
    </style>
  `,
  targetSelector: 'head',
  position: 'lastChild'
};

// Step 2: Mark the button
const markButtonChange = {
  selector: '.button',
  type: 'attribute',
  value: {
    'data-absmartly-modified': 'true'
  }
};

// Apply both
plugin.applyChange(cssVariableChange, 'experiment-1');
plugin.applyChange(markButtonChange, 'experiment-1');
```

### 5. React-Specific Solution with RAF

Use requestAnimationFrame to ensure changes persist through React updates:

```javascript
class ReactPersistenceManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.rafId = null;
    this.changes = new Map();
  }

  applyPersistentChange(change, experimentName) {
    const key = `${change.selector}-${experimentName}`;
    this.changes.set(key, { change, experimentName });
    
    // Initial application
    this.plugin.applyChange(change, experimentName);
    
    // Start RAF loop
    if (!this.rafId) {
      this.startRAFLoop();
    }
  }

  startRAFLoop() {
    const applyChanges = () => {
      this.changes.forEach(({ change, experimentName }) => {
        const elements = document.querySelectorAll(change.selector);
        elements.forEach(element => {
          // Quick check and reapply if needed
          if (change.type === 'style') {
            Object.entries(change.value).forEach(([prop, value]) => {
              if (element.style[prop] !== value) {
                element.style[prop] = value;
              }
            });
          }
        });
      });
      
      // Continue loop
      this.rafId = requestAnimationFrame(applyChanges);
    };
    
    this.rafId = requestAnimationFrame(applyChanges);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.changes.clear();
  }
}
```

## Recommended Approach - Using styleRules

The plugin now supports a `styleRules` change type that handles hover states elegantly:

```javascript
// Complete solution for your button using styleRules
const buttonChange = {
  selector: '.your-button-class',
  type: 'styleRules',
  states: {
    normal: {
      backgroundColor: '#e02424',
      color: 'white',
      transition: 'all 0.2s ease'
    },
    hover: {
      backgroundColor: '#c81e1e',
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    },
    active: {
      backgroundColor: '#991818'
    }
  },
  important: true // default is true
};

plugin.applyChange(buttonChange, 'button-experiment');

// For icon animation within the button
const iconChange = {
  selector: '.your-button-class:hover .icon',
  type: 'styleRules',
  states: {
    normal: {
      transform: 'translateX(5px)',
      transition: 'transform 0.2s ease'
    }
  }
};

plugin.applyChange(iconChange, 'button-experiment');
```

The `styleRules` type:
- Automatically generates CSS rules with proper specificity
- Handles hover, active, and focus states
- Manages `!important` flags appropriately
- Works with complex selectors including pseudo-classes
- Persists through React re-renders

## Best Practices

1. **Use CSS for hover states** - More performant and reliable than JavaScript
2. **Use `!important` sparingly** - Only when necessary to override inline styles
3. **Preserve animations** - Copy original transition/animation rules when overriding
4. **Mark modified elements** - Use data attributes to identify changed elements
5. **Clean up resources** - Remove observers and RAF loops when done

## Extension Implementation

In your extension, provide templates for common scenarios:

```javascript
// Extension helper for hover-aware changes
function applyHoverAwareStyleChange(selector, colors) {
  const styleId = `absmartly-hover-${Date.now()}`;
  
  const changes = [
    {
      selector: styleId,
      type: 'create',
      element: `
        <style id="${styleId}">
          ${selector} {
            background-color: ${colors.normal} !important;
          }
          ${selector}:hover {
            background-color: ${colors.hover} !important;
          }
          ${selector}:active {
            background-color: ${colors.active || colors.hover} !important;
          }
        </style>
      `,
      targetSelector: 'head',
      position: 'lastChild'
    }
  ];
  
  return changes;
}

// Usage
const buttonChanges = applyHoverAwareStyleChange('.button', {
  normal: 'red',
  hover: 'darkred',
  active: '#aa0000'
});

buttonChanges.forEach(change => {
  plugin.applyChange(change, 'experiment-1');
});
```

## Handling Elements Not Yet in DOM

For elements that appear after initial page load, use the `waitForElement` option:

### Basic Usage

```javascript
const change = {
  selector: '.lazy-button',
  type: 'style',
  value: { backgroundColor: 'red' },
  waitForElement: true  // Plugin will wait for element to appear
};

plugin.applyChange(change, 'experiment-1');
```

### With Specific Observer Root

For better performance, specify where to watch for the element:

```javascript
const change = {
  selector: '.modal-button',
  type: 'style',
  value: { backgroundColor: 'blue' },
  waitForElement: true,
  observerRoot: '.modal-container'  // Only watch inside modal container
};

plugin.applyChange(change, 'experiment-1');
```

### Combined with Style Rules

For dynamic elements that also need hover states:

```javascript
// First, set up the CSS rules (these apply globally)
const styleRulesChange = {
  selector: '.dynamic-button',
  type: 'styleRules',
  states: {
    normal: {
      backgroundColor: '#e02424',
      color: 'white'
    },
    hover: {
      backgroundColor: '#c81e1e'
    }
  },
  waitForElement: false  // CSS rules don't need elements to exist
};

plugin.applyChange(styleRulesChange, 'experiment-1');

// Then apply any additional changes when element appears
const attributeChange = {
  selector: '.dynamic-button',
  type: 'attribute',
  value: {
    'data-tracking': 'enabled'
  },
  waitForElement: true  // Wait for element to add attributes
};

plugin.applyChange(attributeChange, 'experiment-1');
```

### Performance Considerations

1. **Use specific observer roots** when possible to reduce observation scope
2. **Changes are batched** - Multiple elements appearing simultaneously are processed together
3. **Observers auto-cleanup** - Disconnected when no pending changes remain
4. **No polling** - Uses efficient MutationObserver API

### Common Use Cases

```javascript
// Lazy-loaded content
{
  selector: '.lazy-section',
  type: 'style',
  value: { padding: '20px' },
  waitForElement: true
}

// Modal dialogs
{
  selector: '.modal-close-btn',
  type: 'text',
  value: 'Cancel',
  waitForElement: true,
  observerRoot: '.modal'
}

// React components that mount later
{
  selector: '.user-dashboard',
  type: 'class',
  add: ['modified'],
  waitForElement: true,
  observerRoot: '.app'
}

// API-loaded content
{
  selector: '.product-card',
  type: 'styleRules',
  states: {
    normal: { border: '2px solid blue' },
    hover: { border: '2px solid darkblue' }
  },
  waitForElement: true,
  observerRoot: '.products-grid'
}
```

This approach ensures your changes persist through hover states, React re-renders, and dynamic content loading.