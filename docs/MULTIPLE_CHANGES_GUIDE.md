# Handling Multiple Changes of Same Type for Same Selector

## The Challenge

When you have multiple changes of the same type for the same selector in a variant, you need a way to identify and toggle each change individually.

## Solution: Use Unique Identifiers

The plugin applies changes sequentially and tracks them, but to toggle specific changes, you need to manage them with unique IDs in your extension.

## Implementation Patterns

### 1. Track Changes with IDs in Extension

```javascript
// Your variant's changes structure in the extension
const variant = {
  id: 'variant-1',
  changes: [
    {
      id: 'change-001',  // Unique ID for this change
      selector: '.button',
      type: 'style',
      value: { backgroundColor: 'red' },
      enabled: true
    },
    {
      id: 'change-002',  // Different ID, same selector and type
      selector: '.button',
      type: 'style', 
      value: { fontSize: '20px' },
      enabled: true
    },
    {
      id: 'change-003',  // Another style change for same element
      selector: '.button',
      type: 'style',
      value: { padding: '15px 30px' },
      enabled: false  // This one is disabled
    }
  ]
};
```

### 2. Apply Changes with Tracking

Since the plugin's `removeSpecificChange()` removes the FIRST matching change, you need to track what's applied:

```javascript
class ChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.appliedChanges = new Map(); // Track what's actually applied
  }

  // Apply all enabled changes for a variant
  applyVariantChanges(variant) {
    // First, remove all existing changes for this variant
    this.plugin.removeChanges(`${variant.id}-preview`);
    this.appliedChanges.clear();
    
    // Then apply enabled changes in order
    variant.changes
      .filter(change => change.enabled)
      .forEach(change => {
        const success = this.plugin.applyChange(change, `${variant.id}-preview`);
        if (success) {
          this.appliedChanges.set(change.id, change);
        }
      });
  }

  // Toggle a specific change
  toggleChange(variant, changeId, enabled) {
    const change = variant.changes.find(c => c.id === changeId);
    if (!change) return;
    
    // Update the enabled state
    change.enabled = enabled;
    
    // Reapply all changes (safest approach)
    this.applyVariantChanges(variant);
  }
}
```

### 3. Alternative: Use Composite Changes

Instead of multiple separate style changes, combine them when applying:

```javascript
class SmartChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  applyVariantChanges(variant) {
    const experimentName = `${variant.id}-preview`;
    
    // Group changes by selector and type
    const groupedChanges = this.groupChangesBySelectorAndType(variant.changes);
    
    // Remove all previous changes
    this.plugin.removeChanges(experimentName);
    
    // Apply grouped changes
    groupedChanges.forEach(group => {
      if (group.type === 'style') {
        // Merge all style changes for the same selector
        const mergedStyles = {};
        group.changes
          .filter(c => c.enabled)
          .forEach(change => {
            Object.assign(mergedStyles, change.value);
          });
        
        if (Object.keys(mergedStyles).length > 0) {
          this.plugin.applyChange({
            selector: group.selector,
            type: 'style',
            value: mergedStyles
          }, experimentName);
        }
      } else {
        // For other types, apply sequentially
        group.changes
          .filter(c => c.enabled)
          .forEach(change => {
            this.plugin.applyChange(change, experimentName);
          });
      }
    });
  }

  groupChangesBySelectorAndType(changes) {
    const groups = new Map();
    
    changes.forEach(change => {
      const key = `${change.selector}-${change.type}`;
      if (!groups.has(key)) {
        groups.set(key, {
          selector: change.selector,
          type: change.type,
          changes: []
        });
      }
      groups.get(key).changes.push(change);
    });
    
    return Array.from(groups.values());
  }

  toggleChange(variant, changeId, enabled) {
    const change = variant.changes.find(c => c.id === changeId);
    if (!change) return;
    
    change.enabled = enabled;
    this.applyVariantChanges(variant);
  }
}
```

### 4. Incremental Toggle Pattern

For better performance with many changes:

```javascript
class IncrementalChangeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.stateMap = new Map(); // Track state by variant
  }

  initializeVariant(variant) {
    const experimentName = `${variant.id}-preview`;
    
    // Store the state
    this.stateMap.set(variant.id, {
      changes: variant.changes,
      experimentName
    });
    
    // Apply all enabled changes
    this.applyAllEnabledChanges(variant);
  }

  applyAllEnabledChanges(variant) {
    const experimentName = `${variant.id}-preview`;
    
    // Clear and reapply (safest for multiple same-type changes)
    this.plugin.removeChanges(experimentName);
    
    variant.changes
      .filter(c => c.enabled)
      .forEach(change => {
        this.plugin.applyChange(change, experimentName);
      });
  }

  toggleSingleChange(variantId, changeId, enabled) {
    const state = this.stateMap.get(variantId);
    if (!state) return;
    
    const change = state.changes.find(c => c.id === changeId);
    if (!change) return;
    
    // Update the enabled state
    const wasEnabled = change.enabled;
    change.enabled = enabled;
    
    // For multiple same-type changes on same selector,
    // safest approach is to reapply all
    if (this.hasMultipleSameTypeChanges(state.changes, change)) {
      this.applyAllEnabledChanges({ 
        id: variantId, 
        changes: state.changes 
      });
    } else {
      // Single change - can toggle directly
      if (enabled && !wasEnabled) {
        this.plugin.applyChange(change, state.experimentName);
      } else if (!enabled && wasEnabled) {
        this.plugin.removeSpecificChange(
          state.experimentName,
          change.selector,
          change.type
        );
      }
    }
  }

  hasMultipleSameTypeChanges(changes, targetChange) {
    return changes.filter(c => 
      c.selector === targetChange.selector && 
      c.type === targetChange.type
    ).length > 1;
  }
}
```

## Real-World Example

Here's how this works in practice with your UI:

```javascript
// Extension code managing the variant
class VariantPreviewManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.currentVariant = null;
  }

  // Called when preview is turned on for a variant
  startPreview(variant) {
    this.currentVariant = variant;
    this.refreshPreview();
  }

  // Called when a checkbox is toggled in the UI
  onChangeToggled(changeId, isChecked) {
    if (!this.currentVariant) return;
    
    // Find and update the change
    const change = this.currentVariant.changes.find(c => c.id === changeId);
    if (change) {
      change.enabled = isChecked;
      this.refreshPreview();
    }
  }

  // Refresh the entire preview (safest approach)
  refreshPreview() {
    if (!this.currentVariant) return;
    
    const experimentName = `${this.currentVariant.id}-preview`;
    
    // Remove all changes
    this.plugin.removeChanges(experimentName);
    
    // Reapply only enabled changes
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

// Usage in your UI event handlers
const manager = new VariantPreviewManager(plugin);

// When preview toggle is turned on
document.querySelector('#preview-toggle').addEventListener('change', (e) => {
  if (e.target.checked) {
    manager.startPreview(currentVariant);
  } else {
    manager.stopPreview();
  }
});

// When individual change checkbox is toggled
document.querySelectorAll('.change-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    const changeId = e.target.dataset.changeId;
    manager.onChangeToggled(changeId, e.target.checked);
  });
});
```

## Key Points

1. **Track Changes with Unique IDs**: Each change needs a unique identifier in your extension's data structure

2. **Reapply Pattern is Safest**: When toggling changes with multiple same-type for same selector, the safest approach is:
   - Remove all changes for the variant
   - Reapply only the enabled ones

3. **Order Matters**: Changes are applied sequentially, so the order in your array matters for the final result

4. **Performance Consideration**: If you have many changes, consider grouping operations rather than toggling individually

## Why This Approach?

The plugin applies changes sequentially and stores original state once per selector+type combination. When you have multiple style changes for `.button`:

1. First style change stores original state and applies
2. Second style change applies on top of the first
3. Third style change applies on top of the second

When removing, the plugin restores to the original state. This is why managing multiple same-type changes requires tracking them in your extension and reapplying as needed.

## Best Practice Recommendation

For the best user experience and reliability:

```javascript
// Always use the "refresh all" pattern for variants with multiple same-type changes
function updateVariantPreview(variant) {
  const experimentName = `${variant.id}-preview`;
  
  // Clear everything
  plugin.removeChanges(experimentName);
  
  // Apply enabled changes in order
  variant.changes
    .filter(c => c.enabled)
    .forEach(change => {
      plugin.applyChange(change, experimentName);
    });
}
```

This ensures:
- Changes are always applied in the correct order
- No stale changes remain
- The UI state matches the DOM state
- It works correctly regardless of how many same-type changes exist