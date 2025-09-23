import { logDebug } from '../utils/debug';
export class StyleSheetManager {
  private styleEl: HTMLStyleElement | null = null;
  private rules = new Map<string, string>(); // ruleKey -> css text
  private debug: boolean;

  constructor(
    private id: string,
    debug = false
  ) {
    this.debug = debug;
  }

  ensure(): HTMLStyleElement {
    if (!this.styleEl || !document.head.contains(this.styleEl)) {
      this.styleEl = document.getElementById(this.id) as HTMLStyleElement;

      if (!this.styleEl) {
        const el = document.createElement('style');
        el.id = this.id;
        el.setAttribute('data-absmartly-styles', 'true');
        document.head.appendChild(el);
        this.styleEl = el;

        if (this.debug) {
          logDebug(`[ABsmartly] Created stylesheet: ${this.id}`);
        }
      }
    }
    return this.styleEl;
  }

  setRule(key: string, css: string): void {
    this.rules.set(key, css);
    this.render();

    if (this.debug) {
      logDebug(`[ABsmartly] Set CSS rule for ${key}`);
    }
  }

  deleteRule(key: string): void {
    if (this.rules.delete(key)) {
      this.render();

      if (this.debug) {
        logDebug(`[ABsmartly] Deleted CSS rule for ${key}`);
      }
    }
  }

  hasRule(key: string): boolean {
    return this.rules.has(key);
  }

  clear(): void {
    const hadRules = this.rules.size > 0;
    this.rules.clear();

    if (hadRules) {
      this.render();

      if (this.debug) {
        logDebug(`[ABsmartly] Cleared all CSS rules from ${this.id}`);
      }
    }
  }

  destroy(): void {
    this.clear();
    if (this.styleEl && document.head.contains(this.styleEl)) {
      this.styleEl.remove();
      this.styleEl = null;

      if (this.debug) {
        logDebug(`[ABsmartly] Destroyed stylesheet: ${this.id}`);
      }
    }
  }

  private render(): void {
    const el = this.ensure();
    const cssText = Array.from(this.rules.values()).join('\n\n');
    el.textContent = cssText;
  }

  getRulesCount(): number {
    return this.rules.size;
  }

  getCssText(): string {
    return Array.from(this.rules.values()).join('\n\n');
  }
}
