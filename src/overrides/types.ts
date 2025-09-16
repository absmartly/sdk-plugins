export interface OverrideValue {
  variant: number;
  env?: number; // 0 = running, 1 = development (SDK dev env), 2 = non-running (API fetch)
  id?: number; // experiment ID for API fetching
}

export interface CookieOverrides {
  [experimentName: string]: number | OverrideValue;
}

export interface ParsedCookie {
  overrides: CookieOverrides;
  devEnv: string | null;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  domain?: string;
  path?: string;
  maxAge?: number;
}

export interface CookieAdapter {
  get(name: string): string | null;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: CookieOptions): void;
}

export interface OverridesPluginConfig {
  context: any; // ABsmartlyContext

  // Cookie configuration
  cookieName?: string; // If not provided, cookies won't be used
  cookieAdapter?: CookieAdapter; // Custom cookie adapter for server-side
  cookieOptions?: CookieOptions; // Options for setting cookies

  // Query string configuration
  useQueryString?: boolean; // Default: true if in browser
  queryPrefix?: string; // Prefix for experiment query params (default: '_exp_')
  envParam?: string; // Query param for environment (default: 'env')
  persistQueryToCookie?: boolean; // Save query params to cookie (default: false)

  // URL provider for server-side
  url?: string | URL; // For server-side, provide the request URL

  // API configuration
  absmartlyEndpoint?: string; // API endpoint for fetching non-running experiments
  sdkEndpoint?: string; // SDK endpoint (required if not available from context)
  domChangesFieldName?: string; // Field name for DOM changes in variant config (default: '__dom_changes')

  debug?: boolean;
}
