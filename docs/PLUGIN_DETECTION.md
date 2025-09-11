# Plugin Detection Implementation

## Overview
The browser extension needs a reliable way to detect if the DOM Changes Plugin is loaded and ready. This implementation adds the plugin reference to the ABsmartly context object, making it discoverable through the existing context discovery mechanism.

## Implementation Details

### 1. Plugin Registration
The plugin registers itself with the ABsmartly context when initialized:

```typescript
// In DOMChangesPlugin.initialize()
this.config.context.__domPlugin = {
  version: '1.0.0',
  initialized: true,
  capabilities: ['preview', 'overrides', 'injection', 'spa', 'visibility'],
  instance: this,  // Direct reference to plugin instance
  timestamp: Date.now()
};
```

### 2. Plugin Cleanup
The plugin removes its registration when destroyed:

```typescript
// In DOMChangesPlugin.destroy()
if (this.config.context.__domPlugin) {
  delete this.config.context.__domPlugin;
}
```

### 3. Extension Detection Code
The extension can detect the plugin using the existing `getABsmartlyContext()` function:

```javascript
// Extension detection code
function detectPlugin() {
  const context = getABsmartlyContext();  // Existing function in extension
  
  if (context?.__domPlugin?.initialized) {
    // Plugin is loaded and ready
    const plugin = context.__domPlugin;
    console.log('Plugin detected:', {
      version: plugin.version,
      capabilities: plugin.capabilities,
      timestamp: plugin.timestamp
    });
    
    // Can access plugin instance directly
    const pluginInstance = plugin.instance;
    return plugin;
  }
  
  return null;
}

// Poll for plugin availability
function waitForPlugin(callback, maxAttempts = 30) {
  let attempts = 0;
  const interval = setInterval(() => {
    const plugin = detectPlugin();
    if (plugin || ++attempts >= maxAttempts) {
      clearInterval(interval);
      if (plugin) {
        callback(plugin);
      } else {
        console.warn('Plugin not detected after', maxAttempts, 'attempts');
      }
    }
  }, 500); // Check every 500ms
}
```

## Benefits

1. **No Global Pollution**: Plugin stays within the ABsmartly context namespace
2. **Reuses Existing Code**: Uses the extension's existing `getABsmartlyContext()` function
3. **Direct Access**: Extension can access plugin instance methods if needed
4. **Simple & Clean**: Single property on context object
5. **Synchronous Check**: No need for async message passing for detection

## Usage in Extension

```javascript
// Check if plugin is available
if (detectPlugin()) {
  // Plugin is ready, can send messages or interact
  window.postMessage({
    source: 'absmartly-extension',
    type: 'PREVIEW_CHANGES',
    payload: { changes: [...] }
  }, '*');
} else {
  // Plugin not loaded, wait or show message
  waitForPlugin((plugin) => {
    console.log('Plugin is now ready:', plugin.version);
  });
}
```

## Fallback Detection Methods

The plugin also supports these detection methods as fallbacks:

1. **Message-Based**: Plugin sends `PLUGIN_READY` message on initialization
2. **Ping/Pong**: Extension can send `PING` and wait for `PONG` response
3. **Custom Events**: Could add custom DOM events if needed

## Version Compatibility

The extension can check plugin version for compatibility:

```javascript
const plugin = detectPlugin();
if (plugin) {
  const [major, minor] = plugin.version.split('.').map(Number);
  if (major < 1) {
    console.warn('Plugin version too old, some features may not work');
  }
}
```