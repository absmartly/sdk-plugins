import type { DOMTrackerConfig, EventHandler } from '@absmartly/dom-tracker';

export interface AnalyticsPluginConfig extends Omit<DOMTrackerConfig, 'onEvent'> {
  context: any;
  onEvent?: EventHandler | EventHandler[];
}
