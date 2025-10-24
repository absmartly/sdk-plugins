/* eslint-disable @typescript-eslint/no-explicit-any */
import { CookiePlugin } from '../CookiePlugin';

// Mock cookieUtils module used by CookiePlugin
jest.mock('../cookieUtils', () => {
  return {
    getCookie: jest.fn(),
    setCookie: jest.fn(),
    deleteCookie: jest.fn(),
    generateUniqueId: jest.fn().mockReturnValue('generated-id'),
    isLocalStorageAvailable: jest.fn(),
  };
});

import { getCookie, isLocalStorageAvailable } from '../cookieUtils';

const setCookieEnabled = (enabled: boolean) => {
  Object.defineProperty(window.navigator, 'cookieEnabled', {
    value: enabled,
    configurable: true,
  });
};

const withLocalStorage = (enabled: boolean, absId: string | null = null) => {
  (isLocalStorageAvailable as jest.Mock).mockReturnValue(enabled);
  if (enabled) {
    if (absId === null) {
      window.localStorage.removeItem('abs_id');
    } else {
      window.localStorage.setItem('abs_id', absId);
    }
  }
};

const setCookieValue = (name: string, value: string | null) => {
  (getCookie as jest.Mock).mockImplementation((cookieName: string) => {
    if (cookieName === name) return value;
    return null;
  });
};

describe('CookiePlugin.needsServerSideCookie', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // default: cookies enabled, localStorage available, no cookies set
    setCookieEnabled(true);
    withLocalStorage(true, null);
    (getCookie as jest.Mock).mockReturnValue(null);
  });

  it('returns true when no unitId and storage is accepted (cookies or localStorage)', () => {
    // No cookies, no abs_id in localStorage
    setCookieValue('abs', null);

    const plugin = new CookiePlugin();
    const result = plugin.needsServerSideCookie();

    expect(result).toBe(true);
  });

  it('returns true when unitId exists but expiry is not fresh (cookies enabled)', () => {
    // Simulate existing unit id via cookie
    setCookieValue('abs', 'unit-123');
    // cookies enabled
    setCookieEnabled(true);
    // expiry not fresh
    jest.spyOn(CookiePlugin.prototype as any, 'isExpiryFresh').mockReturnValue(false);

    const plugin = new CookiePlugin();
    const result = plugin.needsServerSideCookie();

    expect(result).toBe(true);
  });

  it('returns false when unitId exists and expiry is fresh (cookies enabled)', () => {
    setCookieValue('abs', 'unit-123');
    setCookieEnabled(true);
    jest.spyOn(CookiePlugin.prototype as any, 'isExpiryFresh').mockReturnValue(true);

    const plugin = new CookiePlugin();
    const result = plugin.needsServerSideCookie();

    expect(result).toBe(false);
  });

  it('returns false when no unitId and neither cookies nor localStorage are available', () => {
    // Neither storage mechanism available
    setCookieEnabled(false);
    withLocalStorage(false);
    (getCookie as jest.Mock).mockReturnValue(null);

    const plugin = new CookiePlugin();
    const result = plugin.needsServerSideCookie();

    expect(result).toBe(false);
  });

  it('returns true when no unitId and cookies disabled but localStorage available', () => {
    setCookieEnabled(false);
    withLocalStorage(true, null);
    setCookieValue('abs', null);

    const plugin = new CookiePlugin();
    const result = plugin.needsServerSideCookie();

    expect(result).toBe(true);
  });
});
