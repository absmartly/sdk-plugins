import type { URLFilter } from '../types';

export type RedirectType = 'domain' | 'page';

export type ControlBehavior = 'redirect-same' | 'no-redirect';

export interface URLRedirect {
  from: string;
  to: string;
  preservePath?: boolean;
  type: RedirectType;
}

export interface URLRedirectConfig {
  redirects: URLRedirect[];
  urlFilter?: URLFilter;
  controlBehavior?: ControlBehavior;
}

export interface RedirectMatch {
  redirect: URLRedirect;
  targetUrl: string;
  experimentName: string;
  variant: number;
  isControl: boolean;
}

export interface URLRedirectPluginConfig {
  context: import('../types').ABsmartlyContext;
  variableName?: string;
  debug?: boolean;
  autoApply?: boolean;
  useBeacon?: boolean;
  onBeforeRedirect?: (match: RedirectMatch) => void | Promise<void>;
}
