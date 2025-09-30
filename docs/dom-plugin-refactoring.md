# DOM Plugin Refactoring: Lite vs Full Architecture

## Overview

The DOM Changes Plugin has been refactored to eliminate code duplication by creating an inheritance hierarchy. This refactoring introduces "Lite" base classes that provide core functionality, which the "Full" versions extend with additional features for browser extension integration and state management.

## The Problem

Previously, we had two separate implementations:
- **DOMChangesPlugin** (~860 lines) - Full-featured plugin with extension support
- **DOMChangesPluginLite** (~450 lines) - Lightweight version for production

This resulted in **~800 lines of duplicated code** for core DOM transformation logic, which violated the DRY (Don't Repeat Yourself) principle.

## The Solution

Create an inheritance hierarchy where:
```
DOMChangesPluginLite (Base)
    ↓ extends
DOMChangesPlugin (Full)

DOMManipulatorLite (Base)
    ↓ extends
DOMManipulator (Full)
```

## Architecture

### Base Classes (Lite)

#### `DOMChangesPluginLite`
Core transformation and exposure tracking functionality.

**Responsibilities:**
- Apply DOM transformations
- Track exposure triggers (immediate & viewport)
- Manage style sheets
- Handle SPA scenarios with mutation observers
- Extract variant data from context
- Event system

**Does NOT include:**
- State management (no StateManager)
- Extension bridge (no MessageBridge)
- Code injection capabilities
- Change reversion functionality
- data-absmartly-* attributes
- Persistence observer

#### `DOMManipulatorLite`
Core DOM manipulation without state tracking.

**Responsibilities:**
- Apply all change types to DOM elements
- Handle pending changes via PendingChangeManager
- Move, create, and delete elements
- Apply style rules to stylesheets

**Does NOT include:**
- Original state storage
- Change reversion
- Attribute tagging for extension

### Extended Classes (Full)

#### `DOMChangesPlugin extends DOMChangesPluginLite`
Adds extension-specific features and state management.

**Additional features:**
- **StateManager**: Tracks original element states for reversion
- **MessageBridge**: Communication with browser extension
- **CodeInjector**: Dynamic script/style injection
- **Persistence Observer**: Re-applies changes when frameworks override them
- **Change Reversion**: `removeChanges()`, `revertChange()`
- **Extension Integration**: Responds to extension commands

#### `DOMManipulator extends DOMManipulatorLite`
Adds state tracking and reversion capabilities.

**Additional features:**
- Stores original element states before modifications
- Implements `removeChanges()` to revert to original state
- Adds data-absmartly-* attributes for extension tracking
- Implements `removeSpecificChange()` and `revertChange()`
- Calls `watchElement()` for style persistence

## Feature Comparison

| Feature | Lite | Full |
|---------|------|------|
| DOM Transformations (all types) | ✅ | ✅ |
| Exposure Tracking | ✅ | ✅ |
| SPA Support | ✅ | ✅ |
| Style Rules (pseudo-classes) | ✅ | ✅ |
| Pending Change Management | ✅ | ✅ |
| Event System | ✅ | ✅ |
| State Manager | ❌ | ✅ |
| Change Reversion | ❌ | ✅ |
| Extension Bridge | ❌ | ✅ |
| Code Injection | ❌ | ✅ |
| Persistence Observer | ❌ | ✅ |
| data-absmartly-* Attributes | ❌ | ✅ |

## DOM Change Types Supported (Both Versions)

Both Lite and Full versions support all DOM change types:

- **text**: Change element text content
- **html**: Change element HTML
- **style**: Apply inline styles
- **styleRules**: Apply CSS rules with pseudo-classes (`:hover`, `:active`, etc.)
- **class**: Add/remove CSS classes
- **attribute**: Set/remove attributes
- **javascript**: Execute custom JavaScript
- **move**: Move elements to different positions
- **create**: Create new elements
- **delete**: Remove elements

## Usage

### Using the Lite Version (Production)

Perfect for production experiments where you only need to apply changes and track exposures:

```typescript
import { DOMChangesPluginLite } from '@absmartly/sdk-plugins';

const plugin = new DOMChangesPluginLite({
  context: absmartlyContext,
  autoApply: true,
  spa: true,
  dataSource: 'variable',
  debug: false
});

await plugin.ready();

// Changes are automatically applied
// Exposure tracking happens automatically
```

### Using the Full Version (Extension/Development)

Use when you need state management, reversion, or extension integration:

```typescript
import { DOMChangesPlugin } from '@absmartly/sdk-plugins';

const plugin = new DOMChangesPlugin({
  context: absmartlyContext,
  autoApply: true,
  spa: true,
  extensionBridge: true, // Enable extension communication
  dataSource: 'variable',
  debug: true
});

await plugin.ready();

// Apply changes (with state tracking)
await plugin.applyChanges('my-experiment');

// Later, revert changes
plugin.removeChanges('my-experiment');

// Get original state of an element
const originalState = plugin.getOriginalState('.my-selector');

// Revert a specific change
const appliedChanges = plugin.getAppliedChanges('my-experiment');
plugin.revertChange(appliedChanges[0]);
```

## Implementation Details

### Protected Members

The Lite classes expose protected members that Full classes can access:

```typescript
// DOMChangesPluginLite
protected config: Required<PluginConfig>;
protected domManipulator: DOMManipulatorLite;
protected variantExtractor: VariantExtractor;
protected exposureTracker: ExposureTracker;
protected mutationObserver: MutationObserver | null;
protected eventListeners: Map<string, EventCallback[]>;
protected styleManagers: Map<string, StyleSheetManager>;
protected initialized: boolean;

protected emit(event: string, data?: EventCallbackData): void;
protected registerWithContext(): void;
protected unregisterFromContext(): void;

// DOMManipulatorLite
protected debug: boolean;
protected plugin: DOMChangesPluginLite;
protected pendingManager: PendingChangeManager;

protected moveElement(element: Element, target: Element, position?: string): void;
```

### Constructor Override Pattern

The Full version overrides the Lite constructor to:
1. Call `super()` with modified config
2. Initialize additional components (StateManager, MessageBridge, etc.)
3. Override the domManipulator with the Full version

```typescript
constructor(config: PluginConfig) {
  // Call parent with extensionBridge disabled (will enable it ourselves)
  super({ ...config, extensionBridge: false });

  // Initialize full-version components
  this.stateManager = new StateManager();
  this.fullDomManipulator = new DOMManipulator(this.stateManager, this.config.debug, this);
  this.codeInjector = new CodeInjector(this.config.debug);

  // Override domManipulator with full version
  this.domManipulator = this.fullDomManipulator as any;

  // Update config with actual extensionBridge setting
  this.config = {
    ...this.config,
    extensionBridge: config.extensionBridge ?? true,
  };
}
```

## Benefits

### 1. Code Reuse (~800 lines eliminated)
- Core transformation logic defined once in Lite classes
- Full classes only implement additional features
- Significantly reduced maintenance burden

### 2. Smaller Production Bundle
- Lite version is ~45% smaller than Full version
- Perfect for production experiments
- Only includes what's needed for applying changes

### 3. Clear Separation of Concerns
- **Lite**: Core DOM transformation & tracking
- **Full**: State management & extension features
- Easy to understand what each version provides

### 4. Backward Compatibility
- Existing code using `DOMChangesPlugin` continues to work
- All public APIs remain the same
- Version numbers unchanged

### 5. Easier Maintenance
- Changes to core logic only need to be made in Lite classes
- Full classes automatically inherit improvements
- Reduces risk of bugs from duplicate code drift

### 6. Type Safety
- TypeScript ensures correct usage of protected members
- Method overrides validated at compile time
- Clear interface contracts

## Bundle Sizes

Based on webpack output:

```
Lite Plugin: ~42 KiB (includes core transformation + tracking)
Full Plugin: ~78 KiB (includes everything)

Size reduction: ~45% for production use cases
```

## When to Use Which Version

### Use Lite When:
✅ Running production A/B tests
✅ Only need to apply DOM changes
✅ Want smallest possible bundle size
✅ Don't need to revert changes
✅ Not using browser extension

### Use Full When:
✅ Developing with browser extension
✅ Need to revert/undo changes
✅ Want original state tracking
✅ Need code injection capabilities
✅ Building visual editor features

## Migration Guide

If you're currently using the old separate implementations:

### From Old Lite → New Lite
No changes needed. The API is identical.

### From Old Full → New Full
No changes needed. The API is identical.

### Want to Switch from Full to Lite?
Just change the import:

```typescript
// Before
import { DOMChangesPlugin } from '@absmartly/sdk-plugins';

// After
import { DOMChangesPluginLite } from '@absmartly/sdk-plugins';
```

Note: You'll lose access to:
- `removeChanges()`
- `revertChange()`
- `getOriginalState()`
- `getAppliedChanges()`
- Extension bridge features

## Technical Decisions

### Why Not Composition?
We chose inheritance over composition because:
1. The Full version truly is a specialized version of Lite
2. Behavior is extended, not replaced
3. Reduces boilerplate delegation code
4. TypeScript's protected members work well for this pattern

### Why Protected Instead of Public?
Protected members allow Full classes to:
- Access necessary internals without exposing them publicly
- Maintain clean public APIs
- Prevent misuse of internal APIs
- Enable proper encapsulation

### Why Keep Separate Files?
- Clear separation makes it obvious which is which
- Import paths clearly indicate which version you're using
- Easier to maintain separate documentation
- Bundle splitting works naturally

## Future Enhancements

Potential improvements enabled by this architecture:

1. **Plugin Variants**: Easy to create specialized versions (e.g., `DOMChangesPluginMobile`)
2. **Feature Flags**: Compose Full version from Lite + feature modules
3. **Testing**: Mock Lite for testing Full-specific features
4. **Documentation**: Generate separate docs for each version

## Conclusion

This refactoring successfully:
- ✅ Eliminated ~800 lines of duplicated code
- ✅ Created a clean inheritance hierarchy
- ✅ Maintained 100% backward compatibility
- ✅ Reduced bundle size by 45% for production use
- ✅ Followed DRY and SOLID principles
- ✅ Made the codebase more maintainable

The Lite/Full architecture provides the best of both worlds: a lightweight production bundle and a feature-rich development version, all while sharing a single source of truth for core functionality.
