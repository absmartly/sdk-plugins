import { URLRedirect, RedirectMatch } from './types';
import { logDebug } from '../utils/debug';

export class URLRedirectMatcher {
  static findMatch(
    currentUrl: string,
    redirects: URLRedirect[],
    experimentName: string,
    variant: number
  ): RedirectMatch | null {
    let parsedCurrent: URL;
    try {
      parsedCurrent = new URL(currentUrl);
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid URL: ${currentUrl}`, error);
      return null;
    }

    for (const redirect of redirects) {
      const targetUrl = this.matchRedirect(parsedCurrent, redirect);
      if (targetUrl) {
        return {
          redirect,
          targetUrl,
          experimentName,
          variant,
          isControl: variant === 0,
        };
      }
    }

    return null;
  }

  private static matchRedirect(currentUrl: URL, redirect: URLRedirect): string | null {
    if (redirect.type === 'domain') {
      return this.matchDomainRedirect(currentUrl, redirect);
    }
    return this.matchPageRedirect(currentUrl, redirect);
  }

  private static matchDomainRedirect(currentUrl: URL, redirect: URLRedirect): string | null {
    let fromUrl: URL;
    try {
      fromUrl = new URL(redirect.from);
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'from' URL: ${redirect.from}`, error);
      return null;
    }

    if (currentUrl.origin !== fromUrl.origin) {
      return null;
    }

    let toUrl: URL;
    try {
      toUrl = new URL(redirect.to);
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'to' URL: ${redirect.to}`, error);
      return null;
    }

    if (redirect.preservePath !== false) {
      toUrl.pathname = currentUrl.pathname;
      toUrl.search = currentUrl.search;
      toUrl.hash = currentUrl.hash;
    }

    return toUrl.toString();
  }

  private static matchPageRedirect(currentUrl: URL, redirect: URLRedirect): string | null {
    let fromUrl: URL;
    try {
      fromUrl = new URL(redirect.from);
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'from' URL: ${redirect.from}`, error);
      return null;
    }

    if (currentUrl.origin !== fromUrl.origin || currentUrl.pathname !== fromUrl.pathname) {
      return null;
    }

    let toUrl: URL;
    try {
      toUrl = new URL(redirect.to);
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'to' URL: ${redirect.to}`, error);
      return null;
    }

    if (redirect.preservePath !== false) {
      toUrl.search = currentUrl.search;
      toUrl.hash = currentUrl.hash;
    }

    return toUrl.toString();
  }

  static buildTargetUrl(currentUrl: string, redirect: URLRedirect): string {
    const match = this.findMatch(currentUrl, [redirect], '', 0);
    return match?.targetUrl || currentUrl;
  }
}
