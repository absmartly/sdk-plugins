export type ChangeType =
  | 'text'
  | 'html'
  | 'style'
  | 'styleRules'
  | 'class'
  | 'attribute'
  | 'javascript'
  | 'move'
  | 'create'
  | 'delete';

export type DOMChangeValue = string | number | boolean | Record<string, string> | undefined;

// URL filtering types
export interface URLFilterConfig {
  include?: string[];
  exclude?: string[];
  mode?: 'simple' | 'regex';
  matchType?: 'full-url' | 'path' | 'domain' | 'query' | 'hash';
}

export type URLFilter = string | string[] | URLFilterConfig;

export interface StyleRuleStates {
  normal?: Record<string, string>;
  hover?: Record<string, string>;
  active?: Record<string, string>;
  focus?: Record<string, string>;
}

export interface DOMChange {
  selector: string;
  type: ChangeType;
  value?: DOMChangeValue;
  enabled?: boolean;

  // For class changes
  add?: string[];
  remove?: string[];

  // For move operations
  targetSelector?: string;
  position?: 'before' | 'after' | 'firstChild' | 'lastChild';

  // For create operations
  element?: string; // HTML string for new element

  // For styleRules type
  states?: StyleRuleStates;
  important?: boolean; // default true for styleRules

  // For pending changes (elements not yet in DOM)
  observerRoot?: string; // CSS selector for the root element to observe (e.g., '.main-content')
  waitForElement?: boolean; // If true, wait for element to appear before applying (auto-enabled in SPA mode)

  // For style persistence (frameworks like React overwriting styles)
  persistStyle?: boolean; // If true, watch for style changes and reapply when overwritten (auto-enabled in SPA mode)

  // For exposure tracking
  trigger_on_view?: boolean; // If true, trigger exposure only when element is visible in viewport
}

// New format for __dom_changes with URL filtering and global defaults
export interface DOMChangesConfig {
  changes: DOMChange[];
  urlFilter?: URLFilter;

  // Global defaults that can be overridden per-change
  waitForElement?: boolean;
  persistStyle?: boolean;
  important?: boolean;
  observerRoot?: string;
}

// Union type supporting both legacy array format and new config format
export type DOMChangesData = DOMChange[] | DOMChangesConfig;

export interface InjectionData {
  headStart?: string;
  headEnd?: string;
  bodyStart?: string;
  bodyEnd?: string;
}

export type InjectionLocation = 'headStart' | 'headEnd' | 'bodyStart' | 'bodyEnd';

export interface InjectionItem {
  code: string;
  priority: number;
  location: InjectionLocation;
}

export type RawInjectionData = Record<string, string | URLFilter>;

export interface InjectionDataWithFilter {
  data: RawInjectionData;
  urlFilter?: URLFilter;
}

export interface ElementState {
  selector: string;
  type: string;
  originalState: {
    text?: string;
    html?: string;
    style?: string;
    classList?: string[];
    attributes?: Record<string, string>;
    parent?: Element | null;
    nextSibling?: Element | null;
  };
}

// Import Context from SDK
import type { Context } from '@absmartly/javascript-sdk';

// ABsmartly Context type - extends SDK Context with plugin registration
export interface ABsmartlyContext extends Context {
  // Plugin registration - standardized under __plugins
  __plugins?: {
    [key: string]: PluginRegistration | undefined;
  };
  // Legacy registration - kept for backwards compatibility
  __domPlugin?: PluginRegistration;
}

export interface PluginRegistration {
  name: string; // Added plugin name
  version: string;
  initialized: boolean;
  capabilities: string[];
  instance: unknown; // Circular reference, so we use unknown
  timestamp: number;
}

export interface PluginConfig {
  context: ABsmartlyContext;
  autoApply?: boolean;
  /**
   * SPA mode - Enables features for Single Page Applications (React, Vue, Angular, etc.)
   * When enabled, automatically activates:
   * - Wait for element: Observes DOM for elements that don't exist yet
   * - Style persistence: Re-applies styles when frameworks overwrite them (e.g., on hover)
   *
   * Set to true for dynamic apps where DOM changes after page load
   */
  spa?: boolean;
  visibilityTracking?: boolean;
  variableName?: string;
  debug?: boolean;

  // Anti-flicker functionality to prevent content flash before experiments load
  hideUntilReady?: string | false; // CSS selector for elements to hide (e.g., 'body', '[data-absmartly-hide]', '[data-absmartly-hide], [data-custom]'), or false to disable
  hideTimeout?: number; // Max milliseconds to keep content hidden (default: 3000ms)
  hideTransition?: string | false; // CSS transition for fade-in (e.g., '0.3s ease-in'), false for instant reveal (default: false)
}

export interface AppliedChange {
  experimentName: string;
  change: DOMChange;
  elements: Element[];
  timestamp: number;
}

export interface PendingChange {
  experimentName: string;
  change: DOMChange;
  retryCount: number;
}

export type MessagePayloadData = {
  changes?: DOMChange[];
  experimentName?: string;
  count?: number;
  version?: string;
  capabilities?: string[];
  experiments?: ExperimentData[];
  overrides?: Record<string, unknown>;
  locations?: string[];
  error?: string;
  variant?: number;
  changeCount?: number;
  // Injection code fields
  headStart?: string;
  headEnd?: string;
  bodyStart?: string;
  bodyEnd?: string;
};

export interface MessagePayload {
  source: string;
  type: string;
  payload?: MessagePayloadData;
}

export interface ExperimentVariant {
  variables?: Record<string, unknown>;
  config?: string | Record<string, unknown>; // ABSmartly SDK provides this as a JSON string
}

export interface ExperimentData {
  name: string;
  variants?: ExperimentVariant[];
}

export interface ContextData {
  experiments?: ExperimentData[];
}

// Event callback types
export type EventCallback = (data?: EventCallbackData) => void;

export interface EventCallbackData {
  count?: number;
  experimentName?: string;
  changeCount?: number;
  locations?: string[];
  error?: string;
  removedChanges?: AppliedChange[];
  change?: DOMChange;
}

// Message handler type
export type MessageHandler = (payload: MessagePayloadData) => void;

// Exposure tracking types
export interface ExperimentTracking {
  experimentName: string;
  variant: number;
  changes: DOMChange[];
  allPossibleSelectors: Set<string>; // All selectors that need viewport tracking across all variants
  triggered: boolean;
  hasImmediateTrigger: boolean;
  hasViewportTrigger: boolean;
}
