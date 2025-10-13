/**
 * Override utility functions extracted for reusability
 * These can be used independently for lightweight override operations
 * without requiring the full OverridesPlugin class
 */

export interface SimpleOverride {
  variant: number;
  env?: number;
  id?: number;
}

export interface OverrideOptions {
  cookieName?: string;
  queryPrefix?: string;
  maxAge?: number;
}

/**
 * Parse query string parameters for experiment overrides
 * @param queryPrefix - Prefix for experiment parameters (e.g., '_exp_')
 * @param searchParams - Optional URLSearchParams instance (defaults to window.location.search)
 */
export function getQueryStringOverrides(
  queryPrefix: string = '_exp_',
  searchParams?: URLSearchParams
): Record<string, number | SimpleOverride> {
  if (typeof window === 'undefined' && !searchParams) {
    return {};
  }

  const urlParams = searchParams || new URLSearchParams(window.location.search);
  const overrides: Record<string, number | SimpleOverride> = {};

  for (const [key, value] of urlParams.entries()) {
    if (key.startsWith(queryPrefix)) {
      const experimentName = key.substring(queryPrefix.length);
      if (experimentName) {
        // Parse value as variant[,env][,id]
        const parts = value.split(',');
        const variant = parseInt(parts[0], 10);

        if (!isNaN(variant)) {
          if (parts.length === 1) {
            overrides[experimentName] = variant;
          } else {
            overrides[experimentName] = {
              variant,
              env: parts[1] ? parseInt(parts[1], 10) : undefined,
              id: parts[2] ? parseInt(parts[2], 10) : undefined,
            };
          }
        }
      }
    }
  }

  return overrides;
}

/**
 * Parse cookie value for experiment overrides
 * Format: name:variant.env.id,name2:variant2
 */
export function parseOverrideCookie(value: string): Record<string, number | SimpleOverride> {
  if (!value) return {};

  const overrides: Record<string, number | SimpleOverride> = {};

  // Skip dev environment if present (format: devEnv=xxx|experiments)
  let experimentsStr = value;
  if (value.includes('|')) {
    const parts = value.split('|');
    // Take the last part which has the experiments
    experimentsStr = parts[parts.length - 1];
  }

  if (!experimentsStr) return {};

  // Parse comma-separated experiments
  const experiments = experimentsStr.split(',');

  for (const exp of experiments) {
    const [name, values] = exp.split(':');
    if (!name || !values) continue;

    const decodedName = decodeURIComponent(name);

    // Parse dot-separated values (variant.env.id)
    const parts = values.split('.');
    const variant = parseInt(parts[0], 10);

    if (!isNaN(variant)) {
      if (parts.length === 1) {
        overrides[decodedName] = variant;
      } else {
        overrides[decodedName] = {
          variant,
          env: parts[1] ? parseInt(parts[1], 10) : undefined,
          id: parts[2] ? parseInt(parts[2], 10) : undefined,
        };
      }
    }
  }

  return overrides;
}

/**
 * Get experiment overrides from cookie
 */
export function getCookieOverrides(
  cookieName: string = 'absmartly_overrides'
): Record<string, number | SimpleOverride> {
  if (typeof document === 'undefined') return {};

  const nameEQ = cookieName + '=';
  const cookies = document.cookie.split(';');

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(nameEQ) === 0) {
      const value = decodeURIComponent(cookie.substring(nameEQ.length));
      return parseOverrideCookie(value);
    }
  }

  return {};
}

/**
 * Serialize overrides to cookie value format
 */
export function serializeOverrides(overrides: Record<string, number | SimpleOverride>): string {
  const parts: string[] = [];

  for (const [name, value] of Object.entries(overrides)) {
    const encodedName = encodeURIComponent(name);
    if (typeof value === 'number') {
      parts.push(`${encodedName}:${value}`);
    } else {
      let str = `${encodedName}:${value.variant}`;
      if (value.env !== undefined) str += `.${value.env}`;
      if (value.id !== undefined) str += `.${value.id}`;
      parts.push(str);
    }
  }

  return parts.join(',');
}

/**
 * Persist experiment overrides to cookie
 */
export function persistOverridesToCookie(
  overrides: Record<string, number | SimpleOverride>,
  options: OverrideOptions = {}
): void {
  if (typeof document === 'undefined') return;

  const cookieName = options.cookieName || 'absmartly_overrides';
  const maxAge = options.maxAge || 86400; // 1 day default

  const cookieValue = serializeOverrides(overrides);
  document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)};path=/;max-age=${maxAge}`;
}

/**
 * Get experiment overrides from query string or cookie
 * Returns normalized Record<string, number> for use with SDK createContext
 *
 * @param cookieName - Name of the cookie to read/write (default: 'absmartly_overrides')
 * @param queryPrefix - Prefix for query string parameters (default: '_exp_')
 * @param searchParams - Optional URLSearchParams instance (defaults to window.location.search)
 * @returns Normalized overrides as Record<string, number>
 */
export function getOverrides(
  cookieName: string = 'absmartly_overrides',
  queryPrefix: string = '_exp_',
  searchParams?: URLSearchParams
): Record<string, number> {
  // Try query string first
  const queryOverrides = getQueryStringOverrides(queryPrefix, searchParams);

  if (Object.keys(queryOverrides).length > 0) {
    // Persist query overrides to cookie
    persistOverridesToCookie(queryOverrides, {
      cookieName,
      maxAge: 86400, // 1 day
    });

    // Normalize to Record<string, number>
    return normalizeOverrides(queryOverrides);
  }

  // Fall back to cookie
  const cookieOverrides = getCookieOverrides(cookieName);
  return normalizeOverrides(cookieOverrides);
}

/**
 * Normalize overrides to simple Record<string, number>
 * Extracts just the variant number from SimpleOverride objects
 */
function normalizeOverrides(
  overrides: Record<string, number | SimpleOverride>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  for (const [key, value] of Object.entries(overrides)) {
    normalized[key] = typeof value === 'number' ? value : value.variant;
  }

  return normalized;
}
