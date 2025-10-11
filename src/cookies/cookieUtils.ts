/**
 * Cookie utility functions extracted from CookiePlugin
 * These can be used independently for lightweight cookie operations
 */

export interface CookieOptions {
  domain?: string;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift();
    return cookieValue || null;
  }
  return null;
}

/**
 * Set a cookie with expiry and options
 */
export function setCookie(
  name: string,
  value: string,
  days: number,
  options: CookieOptions = {}
): boolean {
  try {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${date.toUTCString()}`;

    const path = options.path || '/';
    let cookieString = `${name}=${value};${expires};path=${path}`;

    if (options.domain && options.domain !== 'localhost') {
      cookieString += `;domain=${options.domain}`;
    }

    const sameSite = options.sameSite || 'Lax';
    cookieString += `;SameSite=${sameSite}`;

    if (options.secure) {
      cookieString += ';Secure';
    }

    document.cookie = cookieString;
    return true;
  } catch (e) {
    console.error(`Unable to set cookie ${name}:`, e);
    return false;
  }
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string, options: CookieOptions = {}): void {
  setCookie(name, '', -1, options);
}

/**
 * Generate a fast unique ID (timestamp + random)
 */
export function generateUniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}
