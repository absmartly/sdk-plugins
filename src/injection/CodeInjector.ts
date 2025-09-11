import { InjectionData } from '../types';

export class CodeInjector {
  private injectedLocations: Set<string> = new Set();
  private debug: boolean;

  constructor(debug = false) {
    this.debug = debug;
  }

  inject(data: InjectionData): string[] {
    const injectedLocations: string[] = [];

    if (data.headStart && data.headStart.trim()) {
      if (this.injectScript('head-start', data.headStart)) {
        injectedLocations.push('head-start');
      }
    }

    if (data.headEnd && data.headEnd.trim()) {
      if (this.injectScript('head-end', data.headEnd)) {
        injectedLocations.push('head-end');
      }
    }

    if (data.bodyStart && data.bodyStart.trim()) {
      if (this.injectScript('body-start', data.bodyStart)) {
        injectedLocations.push('body-start');
      }
    }

    if (data.bodyEnd && data.bodyEnd.trim()) {
      if (this.injectScript('body-end', data.bodyEnd)) {
        injectedLocations.push('body-end');
      }
    }

    return injectedLocations;
  }

  private injectScript(location: string, code: string): boolean {
    // Check if already injected at this location
    if (this.injectedLocations.has(location)) {
      return false;
    }

    try {
      const script = document.createElement('script');
      script.textContent = code;
      script.setAttribute('data-absmartly-injected', location);

      switch (location) {
        case 'head-start':
          if (document.head) {
            if (document.head.firstChild) {
              document.head.insertBefore(script, document.head.firstChild);
            } else {
              document.head.appendChild(script);
            }
          } else {
            return false;
          }
          break;

        case 'head-end':
          if (document.head) {
            document.head.appendChild(script);
          } else {
            return false;
          }
          break;

        case 'body-start':
          if (document.body) {
            if (document.body.firstChild) {
              document.body.insertBefore(script, document.body.firstChild);
            } else {
              document.body.appendChild(script);
            }
          } else {
            return false;
          }
          break;

        case 'body-end':
          if (document.body) {
            document.body.appendChild(script);
          } else {
            return false;
          }
          break;

        default:
          return false;
      }

      this.injectedLocations.add(location);

      if (this.debug) {
        console.log(`[ABsmartly] Injecting code at ${location}`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.error(`[ABsmartly] Error injecting code at ${location}:`, error);
      }
      return false;
    }
  }

  cleanup(): void {
    // Remove all injected scripts
    document.querySelectorAll('script[data-absmartly-injected]').forEach(script => {
      const location = script.getAttribute('data-absmartly-injected');
      if (location && this.debug) {
        console.log(`[ABsmartly] Removing injected script at ${location}`);
      }
      script.remove();
    });

    this.injectedLocations.clear();
  }

  getInjectedLocations(): string[] {
    return Array.from(this.injectedLocations);
  }

  hasInjectedAt(location: string): boolean {
    return this.injectedLocations.has(location);
  }
}
