# Bug Report: Preview Changes Not Being Removed

## Issue Description
When calling `removePreview(experimentName)`, the preview changes are not being removed from the DOM. The changes remain applied even after the preview mode is ended.

## Root Cause
The issue is in how the StateManager handles preview changes:

1. When `startPreview()` is called, it sets `isPreviewMode = true`
2. When changes are applied in preview mode via `addAppliedChange()`:
   - If `isPreviewMode` is true, changes are ONLY stored in the `previewChanges` array
   - They are NOT stored in the `appliedChanges` map under the experiment name
3. When `removePreview(experimentName)` is called:
   - It calls `domManipulator.removeChanges(experimentName)`
   - This looks for changes in `stateManager.getAppliedChanges(experimentName)`
   - But since preview changes were only stored in `previewChanges` array, nothing is found
   - Therefore, no changes are removed from the DOM

## Code Analysis

### StateManager.ts (lines 64-90)
```typescript
addAppliedChange(experimentName: string, change: DOMChange, elements: Element[]): void {
  // ...
  if (this.isPreviewMode) {
    this.previewChanges.push(appliedChange);  // Only stored here in preview mode
  } else {
    const changes = this.appliedChanges.get(experimentName) || [];
    changes.push(appliedChange);
    this.appliedChanges.set(experimentName, changes);  // Only stored here in normal mode
  }
}
```

### DOMChangesPlugin.ts (lines 309-331)
```typescript
removePreview(experimentName?: string): void {
  // ...
  const previewExperimentName = experimentName || '__preview__';
  const removedChanges = this.domManipulator.removeChanges(previewExperimentName);
  // This will find nothing because preview changes aren't in appliedChanges map
}
```

## Suggested Fix

### Option 1: Store preview changes in both places
```typescript
addAppliedChange(experimentName: string, change: DOMChange, elements: Element[]): void {
  // ...
  // Always store in appliedChanges map
  const changes = this.appliedChanges.get(experimentName) || [];
  changes.push(appliedChange);
  this.appliedChanges.set(experimentName, changes);
  
  // Additionally track in previewChanges if in preview mode
  if (this.isPreviewMode) {
    this.previewChanges.push(appliedChange);
  }
}
```

### Option 2: Make removePreview() handle preview changes specially
```typescript
removePreview(experimentName?: string): void {
  // ...
  // Get preview changes and remove them
  const previewChanges = this.stateManager.getPreviewChanges();
  for (const change of previewChanges) {
    // Remove each change from DOM
    this.domManipulator.revertChange(change);
  }
  this.stateManager.endPreview();
}
```

## Workaround
Until this is fixed, the extension can work around this by:
1. Not using `previewChanges()` and `removePreview()` methods
2. Instead, using `applyChanges(experimentName)` and `removeChanges(experimentName)` directly
3. This bypasses the preview mode tracking entirely

## Impact
- Preview mode doesn't properly clean up DOM changes
- Users see changes persist even after disabling preview
- This affects the browser extension's visual editor functionality

## Reproduction Steps
1. Initialize plugin with preview mode
2. Call `plugin.previewChanges(changes, 'experiment-name')`
3. Call `plugin.removePreview('experiment-name')`
4. Observe that DOM changes are not removed

## Expected Behavior
When `removePreview(experimentName)` is called, all preview changes for that experiment should be removed from the DOM.

## Actual Behavior
Preview changes remain in the DOM after calling `removePreview(experimentName)`.