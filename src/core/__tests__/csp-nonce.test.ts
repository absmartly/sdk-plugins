/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { StyleSheetManager } from '../StyleSheetManager';
import { createTestSDK, createTestContext } from '../../__tests__/sdk-helper';
import { createEmptyContextData } from '../../__tests__/fixtures';
import { DOMChange } from '../../types';

const NONCE = 'r4nd0m-n0nce-va1ue';

describe('CSP nonce propagation', () => {
  let pluginInstances: DOMChangesPluginLite[] = [];

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    pluginInstances = [];
  });

  afterEach(() => {
    pluginInstances.forEach(plugin => {
      try {
        plugin.destroy();
      } catch {
        // ignore teardown failures
      }
    });
    jest.restoreAllMocks();
  });

  function createPlugin(config: any): DOMChangesPluginLite {
    const plugin = new DOMChangesPluginLite(config);
    pluginInstances.push(plugin);
    return plugin;
  }

  function newContext() {
    return createTestContext(createTestSDK(), createEmptyContextData());
  }

  describe('StyleSheetManager', () => {
    it('sets the nonce attribute on the style element it creates', () => {
      const manager = new StyleSheetManager('nonce-styles', false, NONCE);

      const styleEl = manager.ensure();

      expect(styleEl.getAttribute('nonce')).toBe(NONCE);
      manager.destroy();
    });

    it('omits the nonce attribute when none is configured', () => {
      const manager = new StyleSheetManager('plain-styles');

      const styleEl = manager.ensure();

      expect(styleEl.hasAttribute('nonce')).toBe(false);
      manager.destroy();
    });
  });

  describe('anti-flicker style', () => {
    it('sets the nonce attribute on the injected anti-flicker style', () => {
      createPlugin({
        context: newContext(),
        hideUntilReady: 'body',
        nonce: NONCE,
      });

      const styleEl = document.getElementById('absmartly-antiflicker');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.getAttribute('nonce')).toBe(NONCE);
    });

    it('omits the nonce attribute when none is configured', () => {
      createPlugin({
        context: newContext(),
        hideUntilReady: 'body',
      });

      const styleEl = document.getElementById('absmartly-antiflicker');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.hasAttribute('nonce')).toBe(false);
    });
  });

  describe('experiment stylesheets', () => {
    it('passes the configured nonce to per-experiment style managers', () => {
      const plugin = createPlugin({ context: newContext(), nonce: NONCE });

      const styleEl = plugin.getStyleManager('exp_with_styles').ensure();

      expect(styleEl.getAttribute('nonce')).toBe(NONCE);
    });
  });

  describe('javascript change <script> fallback', () => {
    const originalFunction = global.Function;

    afterEach(() => {
      global.Function = originalFunction;
    });

    function blockEval() {
      const realFunction = global.Function;
      (global as any).Function = function () {
        throw new EvalError("Refused to evaluate: CSP blocks 'unsafe-eval'");
      } as any;
      (global as any).Function.prototype = realFunction.prototype;
    }

    function captureInjectedScript(): { get: () => HTMLScriptElement | null; restore: () => void } {
      const originalAppend = HTMLHeadElement.prototype.appendChild;
      let captured: HTMLScriptElement | null = null;

      HTMLHeadElement.prototype.appendChild = function (this: HTMLHeadElement, node: Node): any {
        if (node instanceof HTMLScriptElement) {
          captured = node;
        }
        return originalAppend.call(this, node);
      } as any;

      return {
        get: () => captured,
        restore: () => {
          HTMLHeadElement.prototype.appendChild = originalAppend;
        },
      };
    }

    it('sets the nonce attribute on the fallback script element', () => {
      document.body.innerHTML = '<div class="target">Original</div>';
      const plugin = createPlugin({ context: newContext(), spa: false, nonce: NONCE });
      const manipulator = (plugin as any).domManipulator;

      blockEval();
      const capture = captureInjectedScript();

      try {
        const change: DOMChange = {
          selector: '.target',
          type: 'javascript',
          value: 'element.textContent = "Fallback executed";',
        };
        manipulator.applyChange(change, 'nonce_exp');
      } finally {
        capture.restore();
      }

      expect(capture.get()).not.toBeNull();
      expect(capture.get()?.getAttribute('nonce')).toBe(NONCE);
    });

    it('omits the nonce attribute on the fallback script when none is configured', () => {
      document.body.innerHTML = '<div class="target">Original</div>';
      const plugin = createPlugin({ context: newContext(), spa: false });
      const manipulator = (plugin as any).domManipulator;

      blockEval();
      const capture = captureInjectedScript();

      try {
        const change: DOMChange = {
          selector: '.target',
          type: 'javascript',
          value: 'element.textContent = "Fallback executed";',
        };
        manipulator.applyChange(change, 'plain_exp');
      } finally {
        capture.restore();
      }

      expect(capture.get()).not.toBeNull();
      expect(capture.get()?.hasAttribute('nonce')).toBe(false);
    });
  });
});
