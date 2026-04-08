import { DOMTracker } from '@absmartly/dom-tracker';
import type { EventHandler, AttributeHandler } from '@absmartly/dom-tracker';
import type { AnalyticsPluginConfig } from './types';
import { registerPlugin, unregisterPlugin } from '../utils/plugin-registry';

export class AnalyticsPlugin {
  private tracker: DOMTracker;
  private readonly context: any;
  private destroyed = false;

  constructor(config: AnalyticsPluginConfig) {
    const { context, onEvent, onAttribute, ...trackerConfig } = config;
    this.context = context;

    const eventHandlers: EventHandler[] = [
      (event: string, props: Record<string, unknown>) => context.track(event, props),
      ...normalizeToArray(onEvent ?? []),
    ];

    const attrHandlers: AttributeHandler[] = [
      (attrs: Record<string, unknown>) => context.attributes(attrs),
      ...normalizeToArray(onAttribute ?? []),
    ];

    this.tracker = new DOMTracker({
      ...trackerConfig,
      onEvent: eventHandlers,
      onAttribute: attrHandlers,
    });

    if (!context.__plugins) context.__plugins = {};
    context.__plugins.analytics = {
      name: 'analytics',
      version: '0.1.0',
      initialized: true,
      timestamp: Date.now(),
      capabilities: ['tracking', 'attributes'],
      instance: this,
    };

    try {
      registerPlugin('analytics', {
        name: 'analytics',
        version: '0.1.0',
        initialized: true,
        timestamp: Date.now(),
        capabilities: ['tracking', 'attributes'],
        instance: this,
      });
    } catch (_e) {
      /* plugin registry may not be initialized */
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tracker.destroy();
    if (this.context.__plugins) delete this.context.__plugins.analytics;
    try {
      unregisterPlugin('analytics');
    } catch (_e) {
      /* ignore */
    }
  }
}

function normalizeToArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
