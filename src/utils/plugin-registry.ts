/**
 * Global plugin registry for ABsmartly plugins
 * Allows detection and inspection of loaded plugins
 */

export interface PluginRegistryEntry {
  name: string;
  version: string;
  initialized: boolean;
  timestamp: number;
  capabilities?: string[];
  instance?: any;
}

export interface PluginRegistry {
  dom?: PluginRegistryEntry;
  overrides?: PluginRegistryEntry;
  cookie?: PluginRegistryEntry;
  vitals?: PluginRegistryEntry;
  urlRedirect?: PluginRegistryEntry;
}

declare global {
  interface Window {
    __ABSMARTLY_PLUGINS__?: PluginRegistry;
  }
}

/**
 * Register a plugin in the global registry
 */
export function registerPlugin(pluginType: keyof PluginRegistry, entry: PluginRegistryEntry): void {
  if (typeof window === 'undefined') {
    return; // Not in browser environment
  }

  if (!window.__ABSMARTLY_PLUGINS__) {
    window.__ABSMARTLY_PLUGINS__ = {};
  }

  window.__ABSMARTLY_PLUGINS__[pluginType] = entry;
}

/**
 * Unregister a plugin from the global registry
 */
export function unregisterPlugin(pluginType: keyof PluginRegistry): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.__ABSMARTLY_PLUGINS__) {
    delete window.__ABSMARTLY_PLUGINS__[pluginType];
  }
}

/**
 * Check if a plugin is registered
 */
export function isPluginRegistered(pluginType: keyof PluginRegistry): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return !!(window.__ABSMARTLY_PLUGINS__ && window.__ABSMARTLY_PLUGINS__[pluginType]?.initialized);
}

/**
 * Get all registered plugins
 */
export function getRegisteredPlugins(): PluginRegistry {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__ABSMARTLY_PLUGINS__ || {};
}
