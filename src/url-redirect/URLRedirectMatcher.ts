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
    if (redirect.type === 'path-prefix') {
      return this.matchPathPrefixRedirect(currentUrl, redirect);
    }
    if (redirect.type === 'pattern') {
      return this.matchPatternRedirect(currentUrl, redirect);
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

  private static matchPathPrefixRedirect(currentUrl: URL, redirect: URLRedirect): string | null {
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

    const prefix = toUrl.pathname.replace(/\/$/, '');
    toUrl.pathname = prefix + currentUrl.pathname;

    if (redirect.preservePath !== false) {
      toUrl.search = currentUrl.search;
      toUrl.hash = currentUrl.hash;
    }

    return toUrl.toString();
  }

  private static matchPatternRedirect(currentUrl: URL, redirect: URLRedirect): string | null {
    let fromUrl: URL;
    try {
      fromUrl = new URL(redirect.from.replace(/\*/g, '__WILDCARD__'));
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'from' URL: ${redirect.from}`, error);
      return null;
    }

    const fromOrigin = `${fromUrl.protocol}//${fromUrl.hostname}${fromUrl.port ? ':' + fromUrl.port : ''}`;
    if (currentUrl.origin !== fromOrigin) {
      return null;
    }

    const fromPathPattern = new URL(redirect.from.replace(/\*/g, '__WILDCARD__')).pathname;
    const captures = this.matchWildcardPattern(currentUrl.pathname, fromPathPattern);
    if (!captures) {
      return null;
    }

    let toUrl: URL;
    try {
      toUrl = new URL(redirect.to.replace(/\*/g, '__WILDCARD__'));
    } catch (error) {
      logDebug(`[ABsmartly URLRedirect] Invalid 'to' URL: ${redirect.to}`, error);
      return null;
    }

    const toOrigin = `${toUrl.protocol}//${toUrl.hostname}${toUrl.port ? ':' + toUrl.port : ''}`;
    const toPathTemplate = new URL(redirect.to.replace(/\*/g, '__WILDCARD__').replace(/\$\d+/g, '__WILDCARD__')).pathname;

    const hasIndexedRefs = /\$\d+/.test(redirect.to);
    let resultPath: string;

    if (hasIndexedRefs) {
      const toPathRaw = new URL(redirect.to.replace(/\*/g, '__WILDCARD__')).pathname;
      resultPath = toPathRaw.replace(/\$(\d+)/g, (_, index) => {
        const i = parseInt(index, 10) - 1;
        return i >= 0 && i < captures.length ? captures[i] : '';
      });
      resultPath = resultPath.replace(/__WILDCARD__/g, '');
    } else {
      resultPath = toPathTemplate;
      for (const capture of captures) {
        resultPath = resultPath.replace('__WILDCARD__', capture);
      }
      resultPath = resultPath.replace(/__WILDCARD__/g, '');
    }

    const result = new URL(toOrigin);
    result.pathname = resultPath;

    if (redirect.preservePath !== false) {
      result.search = currentUrl.search;
      result.hash = currentUrl.hash;
    }

    return result.toString();
  }

  private static matchWildcardPattern(input: string, pattern: string): string[] | null {
    const parts = pattern.split('__WILDCARD__');

    if (parts.length === 1) {
      return input === pattern ? [] : null;
    }

    const captures: string[] = [];
    let remaining = input;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (i === 0) {
        if (!remaining.startsWith(part)) {
          return null;
        }
        remaining = remaining.slice(part.length);
      } else if (i === parts.length - 1) {
        if (!remaining.endsWith(part)) {
          return null;
        }
        captures.push(remaining.slice(0, remaining.length - part.length));
      } else {
        const idx = remaining.indexOf(part);
        if (idx === -1) {
          return null;
        }
        captures.push(remaining.slice(0, idx));
        remaining = remaining.slice(idx + part.length);
      }
    }

    return captures;
  }

  static buildTargetUrl(currentUrl: string, redirect: URLRedirect): string {
    const match = this.findMatch(currentUrl, [redirect], '', 0);
    return match?.targetUrl || currentUrl;
  }
}
