import { CookieAdapter, CookieOptions } from './types';

export class BrowserCookieAdapter implements CookieAdapter {
  get(name: string): string | null {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return decodeURIComponent(cookie.substring(nameEQ.length));
      }
    }

    return null;
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
