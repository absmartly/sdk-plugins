type EventHandler = (event: string, props: Record<string, unknown>) => void;
type AttributeHandler = (attrs: Record<string, unknown>) => void;

interface DOMTrackerLikeConfig {
  onEvent?: EventHandler | EventHandler[];
  onAttribute?: AttributeHandler | AttributeHandler[];
  trackers?: any[];
  rules?: any[];
  presets?: any[];
  spa?: boolean;
  defaults?: boolean;
  debug?: boolean;
  pageName?: (url: URL) => string;
}

export interface AnalyticsPluginConfig extends DOMTrackerLikeConfig {
  context: any;
}
