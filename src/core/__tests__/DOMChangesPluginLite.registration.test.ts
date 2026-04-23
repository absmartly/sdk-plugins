/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import { createEmptyContextData } from '../../__tests__/fixtures';

describe('DOMChangesPluginLite: plugin registration', () => {
  let pluginInstances: DOMChangesPluginLite[] = [];

  beforeEach(() => {
    delete (window as any).__ABSMARTLY_PLUGINS__;
  });

  afterEach(() => {
    pluginInstances.forEach(p => {
      try {
        p.destroy();
      } catch {
        // ignore
      }
    });
    pluginInstances = [];
    delete (window as any).__ABSMARTLY_PLUGINS__;
    jest.restoreAllMocks();
  });

  function createPlugin(config: any): DOMChangesPluginLite {
    const plugin = new DOMChangesPluginLite(config);
    pluginInstances.push(plugin);
    return plugin;
  }

  describe('synchronous presence markers (before ready() resolves)', () => {
    it('registers in window.__ABSMARTLY_PLUGINS__.dom from the constructor', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());

      expect((window as any).__ABSMARTLY_PLUGINS__?.dom).toBeUndefined();

      // Intentionally NOT awaiting ready(): the constructor must register
      // presence synchronously so detection tools can see the plugin even
      // while initialization is still pending.
      const plugin = createPlugin({ context });

      const registry = (window as any).__ABSMARTLY_PLUGINS__;
      expect(registry?.dom).toBeDefined();
      expect(registry.dom.name).toBe('DOMChangesPluginLite');
      expect(registry.dom.initialized).toBe(false);
      expect(registry.dom.instance).toBe(plugin);
    });

    it('registers in context.__domPlugin from the constructor', () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData()) as any;

      expect(context.__domPlugin).toBeUndefined();

      const plugin = createPlugin({ context });

      expect(context.__domPlugin).toBeDefined();
      expect(context.__domPlugin.name).toBe('DOMChangesPluginLite');
      expect(context.__domPlugin.initialized).toBe(false);
      expect(context.__domPlugin.instance).toBe(plugin);
      expect(context.__plugins?.domPlugin).toBe(context.__domPlugin);
    });
  });

  describe('after successful initialization', () => {
    it('flips window.__ABSMARTLY_PLUGINS__.dom.initialized to true', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      await plugin.ready();

      const registry = (window as any).__ABSMARTLY_PLUGINS__;
      expect(registry.dom.initialized).toBe(true);
      expect(registry.dom.instance).toBe(plugin);
    });

    it('flips context.__domPlugin.initialized to true', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData()) as any;
      const plugin = createPlugin({ context });

      await plugin.ready();

      expect(context.__domPlugin.initialized).toBe(true);
      expect(context.__domPlugin.instance).toBe(plugin);
    });
  });

  describe('when initialize() throws', () => {
    it('keeps window.__ABSMARTLY_PLUGINS__.dom registered with initialized=false', async () => {
      jest
        .spyOn(DOMChangesPluginLite.prototype as any, 'applyInjectionsAndChanges')
        .mockRejectedValue(new Error('apply failed'));

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData());
      const plugin = createPlugin({ context });

      await expect(plugin.ready()).rejects.toThrow('apply failed');

      const registry = (window as any).__ABSMARTLY_PLUGINS__;
      expect(registry?.dom).toBeDefined();
      expect(registry.dom.initialized).toBe(false);
      expect(registry.dom.instance).toBe(plugin);
    });

    it('keeps context.__domPlugin registered with initialized=false', async () => {
      jest
        .spyOn(DOMChangesPluginLite.prototype as any, 'applyInjectionsAndChanges')
        .mockRejectedValue(new Error('apply failed'));

      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData()) as any;
      const plugin = createPlugin({ context });

      await expect(plugin.ready()).rejects.toThrow('apply failed');

      expect(context.__domPlugin).toBeDefined();
      expect(context.__domPlugin.initialized).toBe(false);
      expect(context.__domPlugin.instance).toBe(plugin);
    });
  });

  describe('destroy()', () => {
    it('removes both window.__ABSMARTLY_PLUGINS__.dom and context.__domPlugin entries', async () => {
      const sdk = createTestSDK();
      const context = createTestContext(sdk, createEmptyContextData()) as any;
      const plugin = createPlugin({ context });

      await plugin.ready();
      expect((window as any).__ABSMARTLY_PLUGINS__?.dom).toBeDefined();
      expect(context.__domPlugin).toBeDefined();

      plugin.destroy();

      expect((window as any).__ABSMARTLY_PLUGINS__?.dom).toBeUndefined();
      expect(context.__domPlugin).toBeUndefined();
    });
  });
});
