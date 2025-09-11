# Extension UI Guide: Implementing StyleRules Support

This guide explains how to add UI support for the `styleRules` change type in your ABSmartly extension, allowing users to easily create and manage hover states and other CSS pseudo-class styles.

## Overview

The `styleRules` change type enables applying CSS rules with pseudo-states (hover, active, focus) that persist through React re-renders and maintain proper specificity. This guide shows how to build UI components that let users create these changes visually.

## UI Components Needed

### 1. Change Type Selector

Add "Style Rules" as an option when users create a new DOM change:

```javascript
const CHANGE_TYPES = [
  { value: 'text', label: 'Text Content', icon: 'text' },
  { value: 'style', label: 'Inline Styles', icon: 'palette' },
  { value: 'styleRules', label: 'Style Rules (with states)', icon: 'css' },
  { value: 'class', label: 'CSS Classes', icon: 'tag' },
  { value: 'attribute', label: 'Attributes', icon: 'code' },
  { value: 'html', label: 'HTML Content', icon: 'html' },
  { value: 'create', label: 'Create Element', icon: 'plus' },
  { value: 'move', label: 'Move Element', icon: 'move' },
  { value: 'javascript', label: 'JavaScript', icon: 'script' }
];
```

### 2. StyleRules Editor Component

Create a dedicated editor for styleRules with tabs for each state:

```jsx
function StyleRulesEditor({ change, onChange }) {
  const [activeTab, setActiveTab] = useState('normal');
  
  // Initialize states if not present
  const states = change.states || {
    normal: {},
    hover: {},
    active: {},
    focus: {}
  };

  const handleStyleChange = (state, property, value) => {
    const updatedStates = {
      ...states,
      [state]: {
        ...states[state],
        [property]: value
      }
    };
    
    // Remove empty properties
    if (!value) {
      delete updatedStates[state][property];
    }
    
    onChange({
      ...change,
      states: updatedStates
    });
  };

  const handleImportantToggle = (checked) => {
    onChange({
      ...change,
      important: checked
    });
  };

  return (
    <div className="style-rules-editor">
      {/* State Tabs */}
      <div className="state-tabs">
        <button 
          className={activeTab === 'normal' ? 'active' : ''}
          onClick={() => setActiveTab('normal')}
        >
          Normal
        </button>
        <button 
          className={activeTab === 'hover' ? 'active' : ''}
          onClick={() => setActiveTab('hover')}
        >
          Hover
        </button>
        <button 
          className={activeTab === 'active' ? 'active' : ''}
          onClick={() => setActiveTab('active')}
        >
          Active
        </button>
        <button 
          className={activeTab === 'focus' ? 'active' : ''}
          onClick={() => setActiveTab('focus')}
        >
          Focus
        </button>
      </div>

      {/* Style Properties Editor */}
      <div className="properties-editor">
        <h4>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} State</h4>
        <StylePropertiesEditor
          styles={states[activeTab]}
          onChange={(property, value) => 
            handleStyleChange(activeTab, property, value)
          }
        />
      </div>

      {/* Important Flag */}
      <div className="important-toggle">
        <label>
          <input
            type="checkbox"
            checked={change.important !== false}
            onChange={(e) => handleImportantToggle(e.target.checked)}
          />
          Use !important flag
        </label>
        <span className="help-text">
          Ensures styles override existing CSS
        </span>
      </div>
    </div>
  );
}
```

### 3. Style Properties Editor

Component for editing CSS properties with common presets:

```jsx
function StylePropertiesEditor({ styles, onChange }) {
  const [customProperty, setCustomProperty] = useState('');
  
  // Common CSS properties grouped by category
  const PROPERTY_GROUPS = {
    'Colors': [
      { name: 'backgroundColor', label: 'Background Color', type: 'color' },
      { name: 'color', label: 'Text Color', type: 'color' },
      { name: 'borderColor', label: 'Border Color', type: 'color' }
    ],
    'Spacing': [
      { name: 'padding', label: 'Padding', type: 'text', placeholder: '10px' },
      { name: 'margin', label: 'Margin', type: 'text', placeholder: '10px' },
      { name: 'gap', label: 'Gap', type: 'text', placeholder: '10px' }
    ],
    'Typography': [
      { name: 'fontSize', label: 'Font Size', type: 'text', placeholder: '16px' },
      { name: 'fontWeight', label: 'Font Weight', type: 'select', 
        options: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'] },
      { name: 'textDecoration', label: 'Text Decoration', type: 'select',
        options: ['none', 'underline', 'overline', 'line-through'] }
    ],
    'Effects': [
      { name: 'transform', label: 'Transform', type: 'text', placeholder: 'translateY(-2px)' },
      { name: 'transition', label: 'Transition', type: 'text', placeholder: 'all 0.2s ease' },
      { name: 'boxShadow', label: 'Box Shadow', type: 'text', placeholder: '0 4px 8px rgba(0,0,0,0.2)' },
      { name: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.1 }
    ],
    'Layout': [
      { name: 'display', label: 'Display', type: 'select',
        options: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'] },
      { name: 'position', label: 'Position', type: 'select',
        options: ['static', 'relative', 'absolute', 'fixed', 'sticky'] },
      { name: 'zIndex', label: 'Z-Index', type: 'number' }
    ]
  };

  return (
    <div className="style-properties">
      {Object.entries(PROPERTY_GROUPS).map(([group, properties]) => (
        <div key={group} className="property-group">
          <h5>{group}</h5>
          {properties.map(prop => (
            <div key={prop.name} className="property-row">
              <label>{prop.label}:</label>
              {prop.type === 'select' ? (
                <select
                  value={styles[prop.name] || ''}
                  onChange={(e) => onChange(prop.name, e.target.value)}
                >
                  <option value="">None</option>
                  {prop.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : prop.type === 'color' ? (
                <div className="color-input">
                  <input
                    type="color"
                    value={styles[prop.name] || '#000000'}
                    onChange={(e) => onChange(prop.name, e.target.value)}
                  />
                  <input
                    type="text"
                    value={styles[prop.name] || ''}
                    onChange={(e) => onChange(prop.name, e.target.value)}
                    placeholder="#000000"
                  />
                </div>
              ) : prop.type === 'range' ? (
                <div className="range-input">
                  <input
                    type="range"
                    min={prop.min}
                    max={prop.max}
                    step={prop.step}
                    value={styles[prop.name] || prop.max}
                    onChange={(e) => onChange(prop.name, e.target.value)}
                  />
                  <span>{styles[prop.name] || prop.max}</span>
                </div>
              ) : (
                <input
                  type={prop.type}
                  value={styles[prop.name] || ''}
                  onChange={(e) => onChange(prop.name, e.target.value)}
                  placeholder={prop.placeholder}
                />
              )}
              {styles[prop.name] && (
                <button
                  className="remove-btn"
                  onClick={() => onChange(prop.name, '')}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      
      {/* Custom Property */}
      <div className="custom-property">
        <h5>Custom Property</h5>
        <div className="custom-row">
          <input
            type="text"
            placeholder="Property name (e.g., borderRadius)"
            value={customProperty}
            onChange={(e) => setCustomProperty(e.target.value)}
          />
          <input
            type="text"
            placeholder="Value"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customProperty) {
                onChange(customProperty, e.target.value);
                setCustomProperty('');
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>

      {/* Active Properties Display */}
      {Object.keys(styles).length > 0 && (
        <div className="active-properties">
          <h5>Active Properties</h5>
          <div className="properties-list">
            {Object.entries(styles).map(([prop, value]) => (
              <div key={prop} className="property-chip">
                <span>{prop}: {value}</span>
                <button onClick={() => onChange(prop, '')}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4. Visual Preview Component

Show a live preview of how the styles will look:

```jsx
function StyleRulesPreview({ change }) {
  const [previewState, setPreviewState] = useState('normal');
  
  const getPreviewStyles = () => {
    const states = change.states || {};
    return states[previewState] || {};
  };

  const generateCSS = () => {
    const states = change.states || {};
    const rules = [];
    
    if (states.normal && Object.keys(states.normal).length > 0) {
      rules.push(`${change.selector} {
  ${formatCSSProperties(states.normal, change.important !== false)}
}`);
    }
    
    if (states.hover && Object.keys(states.hover).length > 0) {
      rules.push(`${change.selector}:hover {
  ${formatCSSProperties(states.hover, change.important !== false)}
}`);
    }
    
    if (states.active && Object.keys(states.active).length > 0) {
      rules.push(`${change.selector}:active {
  ${formatCSSProperties(states.active, change.important !== false)}
}`);
    }
    
    if (states.focus && Object.keys(states.focus).length > 0) {
      rules.push(`${change.selector}:focus {
  ${formatCSSProperties(states.focus, change.important !== false)}
}`);
    }
    
    return rules.join('\n\n');
  };

  const formatCSSProperties = (props, important) => {
    return Object.entries(props)
      .map(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        const importantFlag = important ? ' !important' : '';
        return `  ${cssKey}: ${value}${importantFlag};`;
      })
      .join('\n');
  };

  return (
    <div className="style-rules-preview">
      <div className="preview-header">
        <h4>Preview</h4>
        <div className="state-selector">
          <button 
            className={previewState === 'normal' ? 'active' : ''}
            onClick={() => setPreviewState('normal')}
          >
            Normal
          </button>
          <button 
            className={previewState === 'hover' ? 'active' : ''}
            onClick={() => setPreviewState('hover')}
          >
            Hover
          </button>
          <button 
            className={previewState === 'active' ? 'active' : ''}
            onClick={() => setPreviewState('active')}
          >
            Active
          </button>
          <button 
            className={previewState === 'focus' ? 'active' : ''}
            onClick={() => setPreviewState('focus')}
          >
            Focus
          </button>
        </div>
      </div>
      
      <div className="preview-element">
        <button style={getPreviewStyles()}>
          Sample Button
        </button>
      </div>
      
      <div className="css-output">
        <h5>Generated CSS</h5>
        <pre><code>{generateCSS()}</code></pre>
      </div>
    </div>
  );
}
```

### 5. Quick Templates

Provide pre-built style templates for common use cases:

```jsx
function StyleRulesTemplates({ onApply }) {
  const templates = [
    {
      name: 'Primary Button',
      description: 'Blue button with hover effects',
      change: {
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
      }
    },
    {
      name: 'Danger Button',
      description: 'Red button for destructive actions',
      change: {
        states: {
          normal: {
            backgroundColor: '#dc3545',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          },
          hover: {
            backgroundColor: '#c82333',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 8px rgba(220,53,69,0.3)'
          },
          active: {
            backgroundColor: '#bd2130',
            transform: 'translateY(0)'
          }
        }
      }
    },
    {
      name: 'Ghost Button',
      description: 'Transparent button with border',
      change: {
        states: {
          normal: {
            backgroundColor: 'transparent',
            color: '#007bff',
            padding: '10px 20px',
            borderRadius: '4px',
            border: '2px solid #007bff',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          },
          hover: {
            backgroundColor: '#007bff',
            color: 'white',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 8px rgba(0,123,255,0.3)'
          },
          active: {
            transform: 'translateY(0)'
          }
        }
      }
    },
    {
      name: 'Card Hover',
      description: 'Elevate card on hover',
      change: {
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
      }
    },
    {
      name: 'Link Underline',
      description: 'Animated underline on hover',
      change: {
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
    }
  ];

  return (
    <div className="style-templates">
      <h4>Quick Templates</h4>
      <div className="template-grid">
        {templates.map(template => (
          <div key={template.name} className="template-card">
            <h5>{template.name}</h5>
            <p>{template.description}</p>
            <button onClick={() => onApply(template.change)}>
              Use Template
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Integration with Main Change Editor

Update your main change editor to handle the styleRules type:

```jsx
function DOMChangeEditor({ change, onChange, onSave, onCancel }) {
  const renderEditor = () => {
    switch (change.type) {
      case 'styleRules':
        return (
          <>
            <StyleRulesEditor 
              change={change} 
              onChange={onChange} 
            />
            <StyleRulesPreview change={change} />
            <StyleRulesTemplates 
              onApply={(templateChange) => {
                onChange({
                  ...change,
                  ...templateChange
                });
              }}
            />
          </>
        );
      
      case 'style':
        return <InlineStyleEditor change={change} onChange={onChange} />;
      
      case 'text':
        return <TextEditor change={change} onChange={onChange} />;
      
      // ... other change types
      
      default:
        return <div>Unsupported change type</div>;
    }
  };

  return (
    <div className="dom-change-editor">
      <div className="editor-header">
        <input
          type="text"
          placeholder="CSS Selector (e.g., .button, #header)"
          value={change.selector || ''}
          onChange={(e) => onChange({ ...change, selector: e.target.value })}
        />
        
        <select 
          value={change.type || 'text'}
          onChange={(e) => onChange({ ...change, type: e.target.value })}
        >
          {CHANGE_TYPES.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      
      <div className="editor-body">
        {renderEditor()}
      </div>
      
      <div className="editor-footer">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onSave} className="primary">
          Save Change
        </button>
      </div>
    </div>
  );
}
```

## Applying the Change

When the user saves the change, apply it using the plugin:

```javascript
function applyStyleRulesChange(change, experimentName) {
  // Validate the change
  if (!change.selector) {
    showError('Selector is required');
    return false;
  }
  
  if (!change.states || Object.keys(change.states).length === 0) {
    showError('At least one state must have styles');
    return false;
  }
  
  // Apply the change
  const success = plugin.applyChange(change, experimentName);
  
  if (success) {
    // Store in your extension's state
    saveChangeToVariant(experimentName, change);
    
    // Update UI
    updateChangesList();
    showSuccess('Style rules applied successfully');
  } else {
    showError('Failed to apply style rules');
  }
  
  return success;
}
```

## Visual Editor Integration

For visual editing mode, you can create hover state changes on the fly:

```javascript
// When user selects an element and wants to edit hover state
function createHoverStateChange(element) {
  const selector = generateSelector(element);
  
  // Get current computed styles
  const computedStyles = window.getComputedStyle(element);
  const currentBg = computedStyles.backgroundColor;
  
  // Create initial change with current state
  const change = {
    selector: selector,
    type: 'styleRules',
    states: {
      normal: {
        backgroundColor: currentBg
      },
      hover: {
        // Suggest a darker shade for hover
        backgroundColor: darkenColor(currentBg, 20)
      }
    }
  };
  
  // Open the editor with this change
  openStyleRulesEditor(change);
}

// Helper to darken a color
function darkenColor(color, percent) {
  // Convert to RGB, reduce values, convert back
  // Implementation details omitted for brevity
}
```

## Best Practices for UI

1. **Selector Validation**: Validate CSS selectors before applying
2. **Live Preview**: Show changes in real-time if possible
3. **State Indicators**: Clearly show which states have styles defined
4. **Copy/Paste Support**: Allow copying styles between states
5. **Keyboard Shortcuts**: Support Tab to move between fields, Enter to save
6. **Responsive Design**: Ensure the editor works on different screen sizes
7. **Error Handling**: Show clear error messages for invalid values
8. **Undo/Redo**: Integrate with your extension's undo system

## Example: Complete Flow

```javascript
// User flow for creating a button hover effect
async function createButtonHoverEffect() {
  // 1. User selects button element
  const button = await selectElement();
  
  // 2. Generate selector
  const selector = generateSelector(button);
  
  // 3. Create initial change
  const change = {
    selector: selector,
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
      }
    },
    important: true
  };
  
  // 4. Open editor
  const editedChange = await openChangeEditor(change);
  
  // 5. Apply the change
  if (editedChange) {
    plugin.applyChange(editedChange, currentExperiment);
    
    // 6. Save to variant
    saveToVariant(currentExperiment, editedChange);
    
    // 7. Update UI
    refreshChangesList();
  }
}
```

## Testing Your Implementation

Test these scenarios:

1. **Basic Hover**: Create a simple hover color change
2. **Complex Selectors**: Test with `.parent:hover .child`
3. **Multiple States**: Define all four states (normal, hover, active, focus)
4. **Empty States**: Ensure empty states don't break anything
5. **Removal**: Test removing style rules changes
6. **Persistence**: Verify styles persist through React re-renders
7. **Important Flag**: Test with and without !important
8. **Invalid CSS**: Handle invalid property values gracefully

## Troubleshooting

Common issues and solutions:

- **Styles not applying**: Check selector specificity and !important flag
- **Hover not working**: Ensure the selector is valid for hover state
- **Preview not matching**: Remember preview won't show pseudo-states
- **Performance**: For many rules, consider batching updates

This implementation provides a complete, user-friendly interface for creating and managing styleRules changes in your ABSmartly extension.