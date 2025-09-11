# Bug Report: removeChange() and removeAllChanges() Implementation Issues

## Issue Summary
Both `removeChange()` and `removeAllChanges()` methods in `DOMManipulator.ts` have implementation issues:
1. `removeChange()` incorrectly accepts a `DOMChange` object when it should only need an experiment name
2. `removeAllChanges()` doesn't restore DOM state - only removes attributes (acknowledged in code comment: "This is a simplified restoration")

## Current Problematic Implementation

### Problem 1: removeChange() has wrong signature and logic
**Location:** `src/core/DOMManipulator.ts` lines 189-217

Currently the method signature is:
```typescript
removeChange(change: DOMChange, experimentName: string): void
```

But it's being called from `DOMChangesPlugin.ts` like this:
```typescript
removeChanges(experimentName?: string): void {
  if (experimentName) {
    const changes = this.stateManager.getAppliedChanges(experimentName);
    for (const applied of changes) {
      this.domManipulator.removeChange(applied.change, experimentName);
    }
    this.stateManager.removeAppliedChanges(experimentName);
  }
}
```

This is inefficient and problematic because `removeChange()` needs to be called multiple times, once for each change.

### Problem 2: removeAllChanges() doesn't restore state
**Location:** `src/core/DOMManipulator.ts` lines 273-290

```typescript
removeAllChanges(experimentName?: string): void {
  const selector = experimentName
    ? `[data-absmartly-experiment="${experimentName}"]`
    : '[data-absmartly-modified], [data-absmartly-created]';

  const elements = document.querySelectorAll(selector);

  elements.forEach(element => {
    if (element.hasAttribute('data-absmartly-created')) {
      element.remove();
    } else {
      // For modified elements, we need to restore them
      // This is a simplified restoration - in production, we'd need the full state
      element.removeAttribute('data-absmartly-modified');
      element.removeAttribute('data-absmartly-experiment');
      // BUG: Does NOT remove inline styles or restore original content!
    }
  });
}
```

**The Problem:** This method doesn't restore the DOM state at all. It only removes tracking attributes, leaving all the visual changes intact.

## Proposed Solution

The proper fix is to refactor how removal works:

### Solution 1: Replace removeChange with a proper removeChanges method

```typescript
// New removeChanges method that accepts experiment name and returns removed changes
removeChanges(experimentName: string): AppliedChange[] {
  const removedChanges: AppliedChange[] = [];
  
  try {
    // Get all applied changes for this experiment from state manager
    const appliedChanges = this.stateManager.getAppliedChanges(experimentName);
    
    // Store them for return value
    removedChanges.push(...appliedChanges);
    
    // Process each applied change
    for (const applied of appliedChanges) {
      const { change, elements } = applied;
      
      // For each element that was modified by this change
      elements.forEach(element => {
        if (element.hasAttribute('data-absmartly-created')) {
          // Remove created elements
          const changeId = element.getAttribute('data-absmartly-change-id');
          if (changeId) {
            this.stateManager.removeCreatedElement(changeId);
          }
          element.remove();
        } else {
          // Restore modified elements to their original state
          const originalState = this.stateManager.getOriginalState(change.selector, change.type);
          
          if (originalState) {
            this.restoreElement(element, originalState, change.type);
          }
          
          // Clean up tracking attributes
          element.removeAttribute('data-absmartly-modified');
          element.removeAttribute('data-absmartly-experiment');
        }
      });
    }
    
    // Clear the applied changes from state manager
    this.stateManager.removeAppliedChanges(experimentName);
    
  } catch (error) {
    if (this.debug) {
      console.error('[ABsmartly] Error removing changes for experiment:', error);
    }
  }
  
  // Return the changes that were removed for debugging or reapplication
  return removedChanges;
}
```

### Solution 2: Fix removeAllChanges to use the new removeChanges method

```typescript
removeAllChanges(experimentName?: string): AppliedChange[] {
  const allRemovedChanges: AppliedChange[] = [];
  
  if (experimentName) {
    // Remove changes for specific experiment
    const removed = this.removeChanges(experimentName);
    allRemovedChanges.push(...removed);
  } else {
    // Remove ALL changes across all experiments
    const allExperiments = this.stateManager.getAllExperimentNames();
    for (const exp of allExperiments) {
      const removed = this.removeChanges(exp);
      allRemovedChanges.push(...removed);
    }
  }
  
  return allRemovedChanges;
}
```

### Solution 3: Update DOMChangesPlugin to use the fixed methods

```typescript
// In DOMChangesPlugin.ts
removeChanges(experimentName?: string): AppliedChange[] {
  let removedChanges: AppliedChange[] = [];
  
  if (experimentName) {
    // Call the fixed method that handles all changes for an experiment
    removedChanges = this.domManipulator.removeChanges(experimentName);
  } else {
    // Remove all changes
    removedChanges = this.domManipulator.removeAllChanges();
  }
  
  // Log removed changes for debugging
  if (this.debug) {
    console.log(`[ABsmartly] Removed ${removedChanges.length} changes`, removedChanges);
  }
  
  this.emit('changes-removed', { experimentName, removedChanges });
  this.messageBridge?.notifyChangesRemoved(experimentName);
  
  return removedChanges;
}
```

### Alternative: If StateManager doesn't track elements properly

If the StateManager doesn't currently store references to the actual DOM elements that were modified, we need to enhance it:

```typescript
// In StateManager's addAppliedChange method:
addAppliedChange(experimentName: string, change: DOMChange, elements: Element[]): void {
  if (!this.appliedChanges.has(experimentName)) {
    this.appliedChanges.set(experimentName, []);
  }
  
  this.appliedChanges.get(experimentName)!.push({
    change,
    elements, // Store actual element references
    timestamp: Date.now()
  });
}
```

Then the removal can work directly with these stored element references instead of querying the DOM again.

## Testing Requirements

After implementing the fix, ensure these test cases pass:

1. **Basic Restoration Test**
   - Apply style changes to an element using `plugin.applyChanges()`
   - Call `plugin.removeChanges(experimentName)`
   - Verify element has NO inline styles and original styles are restored

2. **Multiple Change Types Test**
   - Apply text, HTML, style, and class changes using the plugin
   - Call `plugin.removeChanges(experimentName)`
   - Verify ALL changes are reverted to their original state

3. **Multiple Selectors Test**
   - Apply changes to multiple different selectors in the same experiment
   - Call `plugin.removeChanges(experimentName)`
   - Verify ALL elements are properly restored, not just some

4. **Selective Removal Test**
   - Apply changes from multiple experiments
   - Call `plugin.removeChanges(experimentName)` for one experiment
   - Verify only that experiment's changes are removed

5. **Created Elements Test**
   - Create new elements via changes
   - Call `plugin.removeChanges(experimentName)`
   - Verify created elements are completely removed

## Impact
This bug affects:
- Chrome Extension integration (preview/remove preview functionality)
- Any implementation using the plugin's removeChanges() API
- User experience when toggling experiments on/off

## Priority
**HIGH** - Core functionality of the plugin is broken. The removeChange method has a logic error that prevents proper restoration when multiple selectors are involved.

## Summary

The main issues are:
1. **`removeChange()` has the wrong signature and name** - it accepts a `DOMChange` object when it should be `removeChanges()` that only needs an experiment name to remove all changes for that experiment
2. **`removeAllChanges()` is not properly implemented** - it only removes attributes without restoring DOM state (as noted in the code comment)
3. **The current flow is inefficient** - calling `removeChange()` multiple times for each change instead of handling all changes at once
4. **No return value for debugging** - the methods don't return what was removed, making debugging and reapplication impossible

The solution is straightforward:
- Replace `removeChange()` with `removeChanges()` that accepts only an experiment name
- Have it remove ALL changes for that experiment using the stored state
- Return the removed changes for debugging and potential reapplication
- Make `removeAllChanges()` properly use the new `removeChanges()` method
- Ensure the StateManager stores element references along with the changes for efficient removal