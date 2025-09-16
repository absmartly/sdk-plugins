export type ChangeType =
  | 'text'
  | 'html'
  | 'style'
  | 'styleRules'
  | 'class'
  | 'attribute'
  | 'javascript'
  | 'move'
  | 'create';

export type DOMChangeValue = string | number | boolean | Record<string, string> | undefined;

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
  waitForElement?: boolean; // If true, wait for element to appear before applying

  // For exposure tracking
  trigger_on_view?: boolean; // If true, trigger exposure only when element is visible in viewport
}

export interface InjectionData {
  headStart?: string;
  headEnd?: string;
  bodyStart?: string;
  bodyEnd?: string;
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

// ABsmartly Context type
export interface ABsmartlyContext {
  data(): ContextData | null;
  peek(experimentName: string): number | undefined;
  treatment(experimentName: string): number;
  override(experimentName: string, variant: number): void;
  customFieldValue(experimentName: string, fieldName: string): unknown;
  // Plugin registration
  __domPlugin?: PluginRegistration;
}

export interface PluginRegistration {
  version: string;
  initialized: boolean;
  capabilities: string[];
  instance: unknown; // Circular reference, so we use unknown
  timestamp: number;
}

export interface PluginConfig {
  context: ABsmartlyContext;
  autoApply?: boolean;
  spa?: boolean;
  visibilityTracking?: boolean;
  extensionBridge?: boolean;
  dataSource?: 'variable' | 'customField';
  dataFieldName?: string;
  debug?: boolean;
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
  overrides?: any;
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
