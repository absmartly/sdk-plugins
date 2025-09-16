import type { Context } from '@absmartly/javascript-sdk';

export interface CookiePluginOptions {
  context?: Context;
  debug?: boolean;
  cookieDomain?: string;
  cookiePath?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
  cookieExpiryDays?: number;
  unitIdCookieName?: string;
  publicIdCookieName?: string;
  expiryCookieName?: string;
  utmCookieName?: string;
  utmParamsList?: string[];
  autoUpdateExpiry?: boolean;
  expiryCheckInterval?: number;
}

export class CookiePlugin {
  private context?: Context;
  private debug: boolean;
  private cookieDomain: string;
  private cookiePath: string;
  private sameSite: 'Strict' | 'Lax' | 'None';
  private secure: boolean;
  private cookieExpiryDays: number;
  private unitIdCookieName: string;
  private publicIdCookieName: string;
  private expiryCookieName: string;
  private utmCookieName: string;
  private utmParams: string[];
  private autoUpdateExpiry: boolean;
  private expiryCheckInterval: number;
  private unitId?: string;

  constructor(options: CookiePluginOptions = {}) {
    this.context = options.context;
    this.debug = options.debug || false;
    this.cookieDomain = options.cookieDomain || '.absmartly.com';
    this.cookiePath = options.cookiePath || '/';
    this.sameSite = options.sameSite || 'Lax';
    this.secure = options.secure || false;
    this.cookieExpiryDays = options.cookieExpiryDays || 730;
    this.unitIdCookieName = options.unitIdCookieName || 'abs';
    this.publicIdCookieName = options.publicIdCookieName || 'abs_public';
    this.expiryCookieName = options.expiryCookieName || 'abs_expiry';
    this.utmCookieName = options.utmCookieName || 'abs_utm_params';
    this.utmParams = options.utmParamsList || [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ];
    this.autoUpdateExpiry = options.autoUpdateExpiry !== false;
    this.expiryCheckInterval = options.expiryCheckInterval || 30;
  }

  private debugLog(...args: any[]): void {
    if (this.debug) {
      console.debug('[CookiePlugin]', ...args);
    }
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const cookieValue = parts.pop()?.split(';').shift();
      return cookieValue || null;
    }
    return null;
  }

  private setCookie(name: string, value: string, days?: number): boolean {
    try {
      const date = new Date();
      const expiryDays = days !== undefined ? days : this.cookieExpiryDays;
      date.setTime(date.getTime() + expiryDays * 24 * 60 * 60 * 1000);
      const expires = `expires=${date.toUTCString()}`;

      let cookieString = `${name}=${value};${expires};path=${this.cookiePath}`;

      if (this.cookieDomain && this.cookieDomain !== 'localhost') {
        cookieString += `;domain=${this.cookieDomain}`;
      }

      cookieString += `;SameSite=${this.sameSite}`;

      if (this.secure) {
        cookieString += ';Secure';
      }

      document.cookie = cookieString;
      this.debugLog(`Set cookie ${name}:`, value);
      return true;
    } catch (e) {
      console.warn(`Unable to set cookie ${name}:`, e);
      return false;
    }
  }

  private deleteCookie(name: string): void {
    this.setCookie(name, '', -1);
  }

  private isLocalStorageAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  private generateFastUniqueID(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  public getUnitId(): string | null {
    if (this.unitId) {
      return this.unitId;
    }

    const cookiesEnabled = navigator.cookieEnabled;
    const localStorageAvailable = this.isLocalStorageAvailable();

    let unitId = null;

    if (cookiesEnabled) {
      unitId = this.getCookie(this.unitIdCookieName) || this.getCookie(this.publicIdCookieName);
    }

    if (!unitId && localStorageAvailable) {
      unitId = localStorage.getItem('abs_id');
    }

    if (unitId) {
      this.unitId = unitId;
    }

    return unitId;
  }

  public setUnitId(unitId: string): void {
    this.unitId = unitId;

    const cookiesEnabled = navigator.cookieEnabled;
    const localStorageAvailable = this.isLocalStorageAvailable();

    if (cookiesEnabled) {
      this.setCookie(this.unitIdCookieName, unitId);
      this.setCookie(this.publicIdCookieName, unitId);
      if (this.autoUpdateExpiry) {
        this.updateExpiryTimestamp();
      }
    }

    if (localStorageAvailable) {
      localStorage.setItem('abs_id', unitId);
    }

    this.debugLog('Unit ID set:', unitId);
  }

  public generateAndSetUnitId(): string {
    const unitId = this.generateFastUniqueID();
    this.setUnitId(unitId);
    return unitId;
  }

  public updateExpiryTimestamp(): void {
    if (navigator.cookieEnabled) {
      const now = Date.now();
      this.setCookie(this.expiryCookieName, now.toString());
      this.debugLog('Updated expiry timestamp:', now);
    }
  }

  public isExpiryFresh(): boolean {
    if (!navigator.cookieEnabled) {
      return false;
    }

    const expiryCookie = this.getCookie(this.expiryCookieName);
    if (!expiryCookie) {
      return false;
    }

    try {
      const expiryTimestamp = parseInt(expiryCookie, 10);
      const now = Date.now();
      const daysSinceSet = (now - expiryTimestamp) / (1000 * 60 * 60 * 24);

      const isFresh = daysSinceSet <= this.expiryCheckInterval;
      this.debugLog('Expiry check:', { daysSinceSet, isFresh });

      return isFresh;
    } catch (e) {
      this.debugLog('Error parsing expiry cookie:', e);
      return false;
    }
  }

  public getUtmParams(): Record<string, string> {
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(window.location.search);

    this.utmParams.forEach(param => {
      const value = searchParams.get(param);
      if (value) {
        params[param] = value;
      }
    });

    if (Object.keys(params).length === 0 && document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        this.utmParams.forEach(param => {
          const value = referrerUrl.searchParams.get(param);
          if (value) {
            params[param] = value;
          }
        });
      } catch (e) {
        this.debugLog('Error parsing referrer URL:', e);
      }
    }

    if (Object.keys(params).length === 0) {
      const storedParams = this.getStoredUtmParams();
      if (storedParams) {
        return storedParams;
      }
    }

    return params;
  }

  public storeUtmParams(params: Record<string, string>): void {
    if (Object.keys(params).length === 0) return;

    const storage = {
      params,
      timestamp: Date.now(),
    };

    const cookiesEnabled = navigator.cookieEnabled;
    const localStorageAvailable = this.isLocalStorageAvailable();

    if (localStorageAvailable) {
      try {
        localStorage.setItem(this.utmCookieName, JSON.stringify(storage));
        this.debugLog('Stored UTM params in localStorage:', params);
      } catch (e) {
        this.debugLog('Failed to store UTM params in localStorage:', e);
      }
    }

    if (cookiesEnabled) {
      this.setCookie(this.utmCookieName, JSON.stringify(storage), 30);
      this.debugLog('Stored UTM params in cookie:', params);
    }
  }

  public getStoredUtmParams(): Record<string, string> | null {
    let stored = null;

    const localStorageAvailable = this.isLocalStorageAvailable();
    const cookiesEnabled = navigator.cookieEnabled;

    if (localStorageAvailable) {
      try {
        stored = localStorage.getItem(this.utmCookieName);
      } catch (e) {
        this.debugLog('Failed to get UTM params from localStorage:', e);
      }
    }

    if (!stored && cookiesEnabled) {
      stored = this.getCookie(this.utmCookieName);
    }

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
          return parsed.params;
        }
      } catch (e) {
        this.debugLog('Failed to parse stored UTM params:', e);
      }
    }

    return null;
  }

  public applyUtmAttributesToContext(context?: Context): void {
    const ctx = context || this.context;
    if (!ctx) {
      console.warn('No context available to apply UTM attributes');
      return;
    }

    const utmParams = this.getUtmParams();

    if (Object.keys(utmParams).length > 0) {
      this.storeUtmParams(utmParams);
    }

    Object.entries(utmParams).forEach(([param, value]) => {
      const attributeName = param.slice(4);
      ctx.attribute(attributeName, value);
      this.debugLog(`Set attribute ${attributeName}:`, value);
    });
  }

  public clearAllCookies(): void {
    this.deleteCookie(this.unitIdCookieName);
    this.deleteCookie(this.publicIdCookieName);
    this.deleteCookie(this.expiryCookieName);
    this.deleteCookie(this.utmCookieName);

    const localStorageAvailable = this.isLocalStorageAvailable();
    if (localStorageAvailable) {
      localStorage.removeItem('abs_id');
      localStorage.removeItem(this.utmCookieName);
    }

    this.unitId = undefined;
    this.debugLog('All cookies and storage cleared');
  }

  public async initialize(): Promise<void> {
    this.debugLog('Initializing CookiePlugin');

    let unitId = this.getUnitId();

    if (!unitId) {
      unitId = this.generateAndSetUnitId();
      this.debugLog('Generated new unit ID:', unitId);
    } else {
      this.debugLog('Using existing unit ID:', unitId);

      if (this.autoUpdateExpiry && !this.isExpiryFresh()) {
        this.updateExpiryTimestamp();
      }
    }

    if (this.context) {
      this.applyUtmAttributesToContext();
    }

    this.debugLog('CookiePlugin initialized successfully');
  }

  public setContext(context: Context): void {
    this.context = context;
    this.debugLog('Context set for CookiePlugin');
  }

  public needsWorkerCall(searchParams?: URLSearchParams): boolean {
    const params = searchParams || new URLSearchParams(window.location.search);

    const hasOverrides = Array.from(params.keys()).some(key => key.startsWith('exp_'));
    if (hasOverrides) {
      this.debugLog('Worker call needed due to experiment overrides');
      return true;
    }

    const unitId = this.getUnitId();
    const cookiesEnabled = navigator.cookieEnabled;
    const localStorageAvailable = this.isLocalStorageAvailable();

    if (!unitId) {
      if (cookiesEnabled || localStorageAvailable) {
        const expiryCookie = this.getCookie(this.expiryCookieName);
        this.debugLog(
          expiryCookie
            ? 'No existing ID but expiry cookie exists - need worker call'
            : 'No existing ID and no expiry cookie - need worker call'
        );
        return true;
      }
    } else if (cookiesEnabled && !this.isExpiryFresh()) {
      this.debugLog('Existing ID present but expiry not fresh - need worker call');
      return true;
    }

    return false;
  }

  public trackLanding(context?: Context): void {
    const ctx = context || this.context;
    if (!ctx) {
      console.warn('No context available for tracking landing');
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hasUtmParams = this.utmParams.some(param => searchParams.get(param));
    const referrerUrl = document.referrer;
    const isExternalReferrer =
      referrerUrl && !referrerUrl.includes(this.cookieDomain.replace('.', ''));
    const acceptsStorage = navigator.cookieEnabled || this.isLocalStorageAvailable();
    const hasCookies = !!(
      this.getCookie(this.unitIdCookieName) ||
      this.getCookie(this.publicIdCookieName) ||
      this.getCookie(this.expiryCookieName) ||
      (this.isLocalStorageAvailable() && localStorage.getItem('abs_id'))
    );
    const isFirstVisit = acceptsStorage && !hasCookies;

    if (hasUtmParams || isExternalReferrer || isFirstVisit) {
      const properties = {
        referrer_url: referrerUrl || '',
        landing_url: window.location.href,
        accepts_cookies: navigator.cookieEnabled,
        accepts_storage: this.isLocalStorageAvailable(),
        has_utm: hasUtmParams,
      };

      this.debugLog('Tracking landing:', properties);
      ctx.track('landing', properties);
    }
  }
}
