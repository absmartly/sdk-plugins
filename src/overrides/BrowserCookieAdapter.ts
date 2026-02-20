import { CookieAdapter, CookieOptions } from './types';
import { getCookie } from '../cookies/cookieUtils';

export class BrowserCookieAdapter implements CookieAdapter {
  get(name: string): string | null {
    return getCookie(name);
  }

  set(name: string, value: string, options?: CookieOptions): void {
    let cookieString = `${name}=${encodeURIComponent(value)}`;

    if (options) {
      if (options.path) {
        cookieString += `; path=${options.path}`;
      }
      if (options.domain) {
        cookieString += `; domain=${options.domain}`;
      }
      if (options.maxAge !== undefined) {
        cookieString += `; max-age=${options.maxAge}`;
      }
      if (options.secure) {
        cookieString += '; secure';
      }
      if (options.sameSite) {
        cookieString += `; samesite=${options.sameSite}`;
      }
      // Note: httpOnly cannot be set from browser JavaScript
    }

    document.cookie = cookieString;
  }

  delete(name: string, options?: CookieOptions): void {
    this.set(name, '', { ...options, maxAge: 0 });
  }
}
