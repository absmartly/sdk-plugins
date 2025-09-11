# Extension Integration Plan

## Current State
The ABSmartly Browser Extension has been updated to work around the preview bug by using production methods instead of preview methods.

## How the Extension Now Works

### For Preview Apply
Instead of calling `plugin.previewChanges(changes, experimentName)`, the extension now:
1. Calls `plugin.removeChanges(experimentName)` to clear any existing changes
2. Loops through changes and calls `plugin.domManipulator.applyChange(change, experimentName)` for each

### For Preview Remove
Instead of calling `plugin.removePreview(experimentName)`, the extension now:
- Simply calls `plugin.removeChanges(experimentName)`

## Why This Works
- `domManipulator.applyChange()` properly stores changes in the `appliedChanges` map under the experiment name
- `removeChanges()` can then find and remove these changes
- This bypasses the broken preview system entirely

## What Plugin Should Support

### Required (Working Now)
These are already working and the extension relies on them:
- `plugin.domManipulator.applyChange(change, experimentName)` - Apply individual changes
- `plugin.removeChanges(experimentName)` - Remove all changes for an experiment
- `plugin.domManipulator` must be publicly accessible

### Nice to Have (Future)
To properly support preview mode, the plugin should:

1. **Fix the preview bug** (see BUG_REPORT.md)
2. **Support incremental change management** for toggling individual changes:
   ```javascript
   // Add method to remove a specific change
   plugin.removeSpecificChange(experimentName, changeSelector, changeType)
   
   // Or support change IDs
   plugin.applyChangeWithId(change, experimentName, changeId)
   plugin.removeChangeById(experimentName, changeId)
   ```

3. **Better preview API**:
   ```javascript
   // Start a preview session
   plugin.startPreviewSession(experimentName)
   
   // Apply individual changes to preview
   plugin.addPreviewChange(change)
   
   // Remove individual preview changes
   plugin.removePreviewChange(changeSelector, changeType)
   
   // End preview session and clean up
   plugin.endPreviewSession()
   ```

## Current Workaround Impact

### Pros
- Preview removal now works correctly
- Uses battle-tested production code paths
- No manual tracking needed
- Changes are properly managed by StateManager

### Cons
- Can't use the intended preview methods
- Requires direct access to `domManipulator`
- Preview changes are treated as production changes internally

## Recommendations for Plugin

### Short Term
1. Fix the preview bug so `removePreview()` works
2. Ensure `domManipulator` remains publicly accessible
3. Document that extensions can use `domManipulator.applyChange()` directly

### Long Term
1. Implement proper preview session management
2. Support incremental change operations
3. Add change IDs for precise control
4. Provide events for change lifecycle (applied, removed, failed)

## Testing the Integration

To test that the extension works with your plugin:

1. **Test Preview Apply**:
   - Open browser extension
   - Toggle preview ON for an experiment
   - Verify DOM changes are applied
   - Check that `plugin.stateManager.getAppliedChanges(experimentName)` returns the changes

2. **Test Preview Remove**:
   - Toggle preview OFF
   - Verify DOM changes are removed
   - Check that `plugin.stateManager.getAppliedChanges(experimentName)` returns empty array

3. **Test Individual Change Toggle**:
   - Enable preview with multiple changes
   - Disable individual changes in the extension
   - Verify only enabled changes remain applied

## Contact
If you need more information about how the extension uses the plugin, please refer to:
- `inject-sdk-plugin.js` in the browser extension repository
- The PREVIEW_CHANGES and REMOVE_PREVIEW message handlers