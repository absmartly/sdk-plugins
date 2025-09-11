# Exposure Tracking Guide

## Overview

The DOM Changes Plugin includes sophisticated exposure tracking to ensure unbiased A/B test data. This guide explains how exposure tracking works and how to use it effectively.

## The Problem: Sample Ratio Mismatch

When running A/B tests with DOM changes, you can encounter sample ratio mismatch (SRM) if exposures aren't tracked correctly:

### Example Scenario
```javascript
// Experiment A: Changes hero banner (visible immediately)
// Experiment B: Changes footer (requires scrolling)

// Without proper tracking:
// - Experiment A: 10,000 exposures (element visible immediately)
// - Experiment B: 3,000 exposures (users must scroll to see it)
// Result: Biased, unusable data
```

## The Solution: Smart Exposure Tracking

The plugin solves this by tracking **all possible element positions across all variants** and triggering exposures consistently.

## Key Concepts

### 1. trigger_on_view Property

Controls when an exposure event is sent to the A/B testing platform:

```javascript
{
  selector: '.element',
  type: 'style',
  value: { color: 'red' },
  trigger_on_view: true  // Wait for element to be visible
}
```

- **`false` or `undefined`** (default): Exposure triggers immediately when change is applied
- **`true`**: Exposure triggers only when element enters viewport

### 2. Cross-Variant Tracking

The plugin tracks elements from ALL variants, not just the active one:

```javascript
// Variant A: Button in position 1
// Variant B: Button in position 2
// Variant C: Button in position 3

// Plugin tracks positions 1, 2, AND 3 for all variants
// Exposure triggers when ANY position becomes visible
```

### 3. Move Changes - Special Handling

For move changes, we track **parent containers** instead of the moved element:

```javascript
{
  selector: '.cta-button',
  type: 'move',
  targetSelector: '.footer',  // Moving from header to footer
  trigger_on_view: true
}

// Tracks BOTH:
// - Original parent (.header)
// - Target parent (.footer)
// Exposure triggers when either container is visible
```

## Implementation Examples

### Basic Viewport Tracking

```javascript
// Changes that should wait for visibility
const changes = [
  {
    selector: '.below-fold-section',
    type: 'style',
    value: { backgroundColor: 'blue' },
    trigger_on_view: true  // Only trigger when user scrolls to this section
  },
  {
    selector: '.footer-cta',
    type: 'text',
    value: 'New CTA Text',
    trigger_on_view: true  // Only trigger when footer is visible
  }
];
```

### Mixed Trigger Types

```javascript
const changes = [
  {
    selector: '.critical-banner',
    type: 'text',
    value: 'Important Update',
    trigger_on_view: false  // Trigger immediately (above-fold, always visible)
  },
  {
    selector: '.testimonials',
    type: 'html',
    value: '<div>New testimonials</div>',
    trigger_on_view: true  // Wait for visibility (below-fold content)
  }
];

// Result: Exposure triggers immediately due to the critical banner
```

### Move Change with Proper Tracking

```javascript
// Control (Variant 0): Button stays in header
const variant0Changes = [
  {
    selector: '.buy-button',
    type: 'style',
    value: { backgroundColor: 'green' }
    // No move, button stays in original position
  }
];

// Treatment (Variant 1): Button moves to footer
const variant1Changes = [
  {
    selector: '.buy-button',
    type: 'move',
    targetSelector: '.footer',
    position: 'firstChild',
    trigger_on_view: true
  }
];

// Plugin behavior:
// 1. Identifies that .buy-button can be in .header OR .footer
// 2. Tracks visibility of BOTH .header AND .footer containers
// 3. Triggers exposure when either container becomes visible
// 4. Both variants have equal chance of exposure
```

## SDK Integration

When using `autoApply: true`, the plugin automatically handles exposure tracking:

### Configuration

```javascript
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  autoApply: true,  // Automatically apply changes from SDK
  debug: true
});
```

### SDK Payload Structure

Configure your A/B testing platform with DOM changes in variant variables:

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
      "name": "treatment",
      "variables": {
        "__dom_changes": [
          {
            "selector": ".hero-title",
            "type": "text",
            "value": "New Compelling Headline",
            "trigger_on_view": false
          },
          {
            "selector": ".testimonials",
            "type": "styleRules",
            "states": {
              "normal": {
                "backgroundColor": "#f0f0f0",
                "padding": "20px"
              }
            },
            "trigger_on_view": true
          }
        ]
      }
    }
  ]
}
```

### How Automatic Exposure Works

1. **Plugin initializes** and reads experiment data from context
2. **For each experiment:**
   - Determines current variant: `context.peek(experimentName)`
   - Extracts changes for ALL variants (for tracking)
   - Applies only current variant's changes
   - Sets up exposure tracking based on `trigger_on_view`
3. **Exposure triggers:**
   - Immediate changes: `context.treatment(experimentName)` called right away
   - Viewport changes: Waits for tracked elements to become visible
   - Mixed: Triggers immediately if any change has `trigger_on_view: false`

## Best Practices

### 1. Consistency Within Experiments

Keep trigger behavior consistent within an experiment:

```javascript
// GOOD: All changes use same trigger type
const goodChanges = [
  { selector: '.header', type: 'style', value: {...}, trigger_on_view: true },
  { selector: '.content', type: 'text', value: '...', trigger_on_view: true },
  { selector: '.footer', type: 'html', value: '...', trigger_on_view: true }
];

// AVOID: Mixed triggers can cause confusion
const avoidChanges = [
  { selector: '.header', type: 'style', value: {...}, trigger_on_view: false },
  { selector: '.content', type: 'text', value: '...', trigger_on_view: true },
];
```

### 2. Above vs Below Fold

Use appropriate triggers based on element position:

```javascript
// Above-fold elements (usually visible immediately)
{
  selector: '.hero-banner',
  type: 'text',
  value: 'New Headline',
  trigger_on_view: false  // or omit for default
}

// Below-fold elements (require scrolling)
{
  selector: '.page-footer',
  type: 'style',
  value: { backgroundColor: 'blue' },
  trigger_on_view: true  // Wait for visibility
}
```

### 3. Always Use trigger_on_view for Move Changes

Move changes should always wait for visibility to avoid bias:

```javascript
{
  selector: '.element',
  type: 'move',
  targetSelector: '.new-parent',
  trigger_on_view: true  // ALWAYS true for moves
}
```

### 4. Performance Considerations

- The plugin uses `IntersectionObserver` for efficient viewport tracking
- Observers are automatically cleaned up after exposure
- Multiple experiments can track the same elements efficiently

## Debugging

Enable debug mode to see exposure tracking in action:

```javascript
const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  debug: true  // Logs exposure tracking details
});

// Console will show:
// [ABSmartly] Registering experiment exp1 for exposure tracking
// [ABSmartly] Experiment exp1 will track selectors: [".header", ".footer"]
// [ABSmartly] Triggering exposure for exp1 via .header
// [ABSmartly] Exposure triggered for experiment: exp1
```

## Common Issues and Solutions

### Issue: Exposures Not Triggering

**Symptom**: Changes apply but exposures aren't recorded

**Solutions**:
1. Check that `context.treatment()` is available and working
2. Verify elements exist when `trigger_on_view: false`
3. Ensure tracked elements actually enter viewport for `trigger_on_view: true`

### Issue: Sample Ratio Mismatch

**Symptom**: Uneven distribution of users across variants

**Solutions**:
1. Use `trigger_on_view: true` for below-fold elements
2. Ensure move changes track parent containers
3. Verify all variants track the same set of elements

### Issue: Duplicate Exposures

**Symptom**: Same user triggers multiple exposures

**Solution**: The plugin prevents this automatically - each experiment triggers only once per page load

## Summary

Proper exposure tracking ensures:
- **Unbiased data**: All variants have equal exposure opportunity
- **Accurate metrics**: Sample ratios remain balanced
- **Flexibility**: Control exposure timing per change
- **Performance**: Efficient viewport tracking with automatic cleanup

By understanding and properly configuring exposure tracking, you can run reliable A/B tests with DOM changes without worrying about data quality issues.