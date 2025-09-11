# Undo/Redo Architecture for Visual Editor

## Recommendation: Extension-Managed History

The undo/redo functionality should be implemented in the **extension**, not the plugin. This maintains clean separation of concerns where the plugin focuses on DOM manipulation and the extension manages editing workflows.

## Architecture Overview

```
┌─────────────────────────┐
│    Chrome Extension     │
├─────────────────────────┤
│  Visual Editor UI       │
│  - Undo/Redo buttons    │
│  - History management   │
├─────────────────────────┤
│  History Stack          │
│  - Undo stack           │
│  - Redo stack           │
│  - Current changes      │
├─────────────────────────┤
│  Plugin Interface       │
│  - Orchestrates calls   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  DOM Changes Plugin     │
├─────────────────────────┤
│  Pure DOM Manipulation  │
│  - applyChange()        │
│  - removeChanges()      │
│  - getAppliedChanges()  │
└─────────────────────────┘
```

## Extension Implementation Example

```typescript
interface HistoryState {
  changes: DOMChange[];
  timestamp: number;
}

class VisualEditorHistory {
  private undoStack: HistoryState[] = [];
  private redoStack: HistoryState[] = [];
  private currentState: HistoryState = { changes: [], timestamp: Date.now() };
  
  constructor(private plugin: DOMChangesPlugin) {}
  
  // Apply a new change
  applyChange(change: DOMChange): void {
    // Save current state to undo stack
    this.undoStack.push({ ...this.currentState });
    
    // Clear redo stack (new changes invalidate redo history)
    this.redoStack = [];
    
    // Update current state
    this.currentState.changes.push(change);
    this.currentState.timestamp = Date.now();
    
    // Apply change via plugin
    this.plugin.applyChange(change, 'visual-editor');
  }
  
  // Undo last change or group of changes
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    
    // Save current state for redo
    this.redoStack.push({ ...this.currentState });
    
    // Get previous state
    const previousState = this.undoStack.pop()!;
    
    // Remove all current changes
    this.plugin.removeChanges('visual-editor');
    
    // Apply previous state
    previousState.changes.forEach(change => {
      this.plugin.applyChange(change, 'visual-editor');
    });
    
    this.currentState = previousState;
    return true;
  }
  
  // Redo previously undone change
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    
    // Save current state for undo
    this.undoStack.push({ ...this.currentState });
    
    // Get next state
    const nextState = this.redoStack.pop()!;
    
    // Remove all current changes
    this.plugin.removeChanges('visual-editor');
    
    // Apply next state
    nextState.changes.forEach(change => {
      this.plugin.applyChange(change, 'visual-editor');
    });
    
    this.currentState = nextState;
    return true;
  }
  
  // Group multiple changes into single undo operation
  beginGroup(): void {
    // Mark beginning of grouped operation
    this.currentState.timestamp = Date.now();
  }
  
  endGroup(): void {
    // Changes between beginGroup and endGroup are treated as one undo operation
  }
  
  // Clear all history
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentState = { changes: [], timestamp: Date.now() };
    this.plugin.removeChanges('visual-editor');
  }
  
  // Get history information
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  
  getHistorySize(): { undo: number; redo: number } {
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length
    };
  }
}
```

## Advanced Features

### 1. Grouped Operations
Group related changes (e.g., changing text and style together):

```typescript
history.beginGroup();
history.applyChange({ selector: '.btn', type: 'text', value: 'Click' });
history.applyChange({ selector: '.btn', type: 'style', value: { color: 'blue' } });
history.endGroup();
// Both changes will be undone/redone together
```

### 2. Change Descriptions
Add descriptions for better UX:

```typescript
interface HistoryState {
  changes: DOMChange[];
  timestamp: number;
  description?: string; // "Changed button text", "Applied theme", etc.
}
```

### 3. Selective Undo
Remove specific changes without affecting others:

```typescript
removeSpecificChange(change: DOMChange): void {
  // Remove from current state
  const index = this.currentState.changes.findIndex(c => 
    c.selector === change.selector && c.type === change.type
  );
  
  if (index !== -1) {
    this.currentState.changes.splice(index, 1);
    this.plugin.removeSpecificChange('visual-editor', change.selector, change.type);
  }
}
```

### 4. History Persistence
Save history to chrome.storage for session recovery:

```typescript
async saveHistory(): Promise<void> {
  await chrome.storage.local.set({
    visualEditorHistory: {
      undoStack: this.undoStack,
      redoStack: this.redoStack,
      currentState: this.currentState
    }
  });
}

async loadHistory(): Promise<void> {
  const data = await chrome.storage.local.get('visualEditorHistory');
  if (data.visualEditorHistory) {
    this.undoStack = data.visualEditorHistory.undoStack;
    this.redoStack = data.visualEditorHistory.redoStack;
    this.currentState = data.visualEditorHistory.currentState;
    
    // Reapply current state
    this.currentState.changes.forEach(change => {
      this.plugin.applyChange(change, 'visual-editor');
    });
  }
}
```

## Benefits of Extension-Managed History

1. **Clean Architecture**: Plugin remains focused on DOM manipulation
2. **Flexibility**: Extension can implement different undo strategies
3. **UI Integration**: Natural place for undo/redo UI controls
4. **Session Management**: Extension can persist history across sessions
5. **Debugging**: Easier to debug when history logic is separate
6. **Performance**: Can optimize history storage (e.g., limit stack size)

## Plugin Requirements

The plugin already provides all necessary APIs:

- ✅ `applyChange()` - Apply individual changes
- ✅ `removeChanges()` - Clear all changes
- ✅ `removeSpecificChange()` - Remove individual changes
- ✅ `getAppliedChanges()` - Query current state

No modifications to the plugin are needed for undo/redo support.

## Usage Example

```typescript
// In extension's content script or popup
const plugin = new DOMChangesPlugin();
const history = new VisualEditorHistory(plugin);

// User makes a change in visual editor
history.applyChange({
  selector: '.header',
  type: 'text',
  value: 'New Header Text'
});

// User clicks undo
if (history.canUndo()) {
  history.undo();
}

// User clicks redo
if (history.canRedo()) {
  history.redo();
}

// Clear everything when closing editor
history.clear();
```

## Conclusion

By keeping undo/redo in the extension:
- The plugin stays clean and focused
- The extension has full control over editing workflows
- Both components remain loosely coupled
- The architecture scales well for future features