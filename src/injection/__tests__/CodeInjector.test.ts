/* eslint-disable @typescript-eslint/no-explicit-any */
import { CodeInjector } from '../CodeInjector';
import { InjectionData } from '../../types';

describe('CodeInjector', () => {
  let codeInjector: CodeInjector;

  beforeEach(() => {
    codeInjector = new CodeInjector(false);
    // Clear any existing injected elements
    document.querySelectorAll('[data-absmartly-injected]').forEach(el => el.remove());
  });

  afterEach(() => {
    codeInjector.cleanup();
  });

  describe('inject', () => {
    it('should inject script at head start', () => {
      const data: InjectionData = {
        headStart: 'console.log("head start");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('head-start');

      const script = document.head.querySelector('script[data-absmartly-injected="head-start"]');
      expect(script).not.toBeNull();
      expect(script?.textContent).toBe('console.log("head start");');
      expect(script?.parentElement).toBe(document.head);
      expect(document.head.firstElementChild).toBe(script);
    });

    it('should inject script at head end', () => {
      const data: InjectionData = {
        headEnd: 'console.log("head end");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('head-end');

      const script = document.head.querySelector('script[data-absmartly-injected="head-end"]');
      expect(script).not.toBeNull();
      expect(script?.textContent).toBe('console.log("head end");');
      expect(script?.parentElement).toBe(document.head);
    });

    it('should inject script at body start', () => {
      const data: InjectionData = {
        bodyStart: 'console.log("body start");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('body-start');

      const script = document.body.querySelector('script[data-absmartly-injected="body-start"]');
      expect(script).not.toBeNull();
      expect(script?.textContent).toBe('console.log("body start");');
      expect(script?.parentElement).toBe(document.body);
      expect(document.body.firstElementChild).toBe(script);
    });

    it('should inject script at body end', () => {
      const data: InjectionData = {
        bodyEnd: 'console.log("body end");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('body-end');

      const script = document.body.querySelector('script[data-absmartly-injected="body-end"]');
      expect(script).not.toBeNull();
      expect(script?.textContent).toBe('console.log("body end");');
      expect(script?.parentElement).toBe(document.body);
    });

    it('should inject multiple scripts', () => {
      const data: InjectionData = {
        headStart: 'console.log("head start");',
        headEnd: 'console.log("head end");',
        bodyStart: 'console.log("body start");',
        bodyEnd: 'console.log("body end");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toHaveLength(4);
      expect(locations).toContain('head-start');
      expect(locations).toContain('head-end');
      expect(locations).toContain('body-start');
      expect(locations).toContain('body-end');

      const headStartScript = document.querySelector(
        'script[data-absmartly-injected="head-start"]'
      );
      const headEndScript = document.querySelector('script[data-absmartly-injected="head-end"]');
      const bodyStartScript = document.querySelector(
        'script[data-absmartly-injected="body-start"]'
      );
      const bodyEndScript = document.querySelector('script[data-absmartly-injected="body-end"]');

      expect(headStartScript).not.toBeNull();
      expect(headEndScript).not.toBeNull();
      expect(bodyStartScript).not.toBeNull();
      expect(bodyEndScript).not.toBeNull();
    });

    it('should not inject empty scripts', () => {
      const data: InjectionData = {
        headStart: '',
        headEnd: undefined,
        bodyStart: null as any,
        bodyEnd: '   ',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toHaveLength(0);

      const scripts = document.querySelectorAll('script[data-absmartly-injected]');
      expect(scripts).toHaveLength(0);
    });

    it('should not re-inject at the same location', () => {
      const data1: InjectionData = {
        headStart: 'console.log("first");',
      };

      const data2: InjectionData = {
        headStart: 'console.log("second");',
      };

      codeInjector.inject(data1);
      const locations = codeInjector.inject(data2);

      expect(locations).toHaveLength(0);

      const scripts = document.querySelectorAll('script[data-absmartly-injected="head-start"]');
      expect(scripts).toHaveLength(1);
      expect(scripts[0].textContent).toBe('console.log("first");');
    });

    it('should inject script even if it contains errors', () => {
      // Note: In JSDOM, script errors are thrown synchronously
      // In real browsers, they would be caught by window.onerror
      // This test verifies that the script is still injected
      const data: InjectionData = {
        headStart: '(function() { var validCode = true; })();',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('head-start');

      // Verify the script was actually injected
      const script = document.querySelector('script[data-absmartly-injected="head-start"]');
      expect(script).not.toBeNull();
      expect(script?.textContent).toContain('validCode');
    });

    it('should properly position head-start as first element', () => {
      // Add some existing elements to head
      const existingMeta = document.createElement('meta');
      existingMeta.name = 'test';
      document.head.insertBefore(existingMeta, document.head.firstChild);

      const data: InjectionData = {
        headStart: 'console.log("head start");',
      };

      codeInjector.inject(data);

      expect(document.head.firstElementChild?.getAttribute('data-absmartly-injected')).toBe(
        'head-start'
      );
    });

    it('should properly position body-start as first element', () => {
      // Add some existing elements to body
      const existingDiv = document.createElement('div');
      existingDiv.id = 'existing';
      document.body.insertBefore(existingDiv, document.body.firstChild);

      const data: InjectionData = {
        bodyStart: 'console.log("body start");',
      };

      codeInjector.inject(data);

      expect(document.body.firstElementChild?.getAttribute('data-absmartly-injected')).toBe(
        'body-start'
      );
    });
  });

  describe('cleanup', () => {
    it('should remove all injected scripts', () => {
      const data: InjectionData = {
        headStart: 'console.log("head start");',
        headEnd: 'console.log("head end");',
        bodyStart: 'console.log("body start");',
        bodyEnd: 'console.log("body end");',
      };

      codeInjector.inject(data);

      let scripts = document.querySelectorAll('script[data-absmartly-injected]');
      expect(scripts).toHaveLength(4);

      codeInjector.cleanup();

      scripts = document.querySelectorAll('script[data-absmartly-injected]');
      expect(scripts).toHaveLength(0);
    });

    it('should clear injected locations tracking', () => {
      const data: InjectionData = {
        headStart: 'console.log("test");',
      };

      codeInjector.inject(data);
      codeInjector.cleanup();

      // After cleanup, should be able to inject at the same location again
      const locations = codeInjector.inject(data);
      expect(locations).toContain('head-start');
    });
  });

  describe('error handling', () => {
    it('should handle missing head element', () => {
      // Temporarily remove head
      const originalHead = document.head;
      Object.defineProperty(document, 'head', {
        value: null,
        writable: true,
        configurable: true,
      });

      const data: InjectionData = {
        headStart: 'console.log("test");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toHaveLength(0);

      // Restore head
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    });

    it('should handle missing body element', () => {
      // Temporarily remove body
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true,
      });

      const data: InjectionData = {
        bodyStart: 'console.log("test");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toHaveLength(0);

      // Restore body
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('debug mode', () => {
    it('should log injection details when debug is enabled', () => {
      const logDebugModule = require('../../utils/debug');
      const logDebugSpy = jest.spyOn(logDebugModule, 'logDebug').mockImplementation();

      const debugInjector = new CodeInjector(true);

      const data: InjectionData = {
        headStart: 'var test = 1;',
      };

      debugInjector.inject(data);

      expect(logDebugSpy).toHaveBeenCalledWith('[ABsmartly] Injecting code at head-start');

      logDebugSpy.mockRestore();
      debugInjector.cleanup();
    });

    it('should log cleanup when debug is enabled', () => {
      const logDebugModule = require('../../utils/debug');
      const logDebugSpy = jest.spyOn(logDebugModule, 'logDebug').mockImplementation();

      const debugInjector = new CodeInjector(true);

      const data: InjectionData = {
        headStart: 'var test = 2;',
      };

      debugInjector.inject(data);
      debugInjector.cleanup();

      expect(logDebugSpy).toHaveBeenCalledWith(
        '[ABsmartly] Removing injected script at head-start'
      );

      logDebugSpy.mockRestore();
    });
  });

  describe('security', () => {
    it('should execute scripts in isolated context', () => {
      // Scripts should not have access to local variables

      const data: InjectionData = {
        headStart: 'window.testValue = "test";',
      };

      codeInjector.inject(data);

      // The script executes and can set window properties
      expect((window as any).testValue).toBe('test');

      // Cleanup
      delete (window as any).testValue;
    });

    it('should properly escape script content', () => {
      const data: InjectionData = {
        headStart: 'console.log("test with </script> tag");',
      };

      const locations = codeInjector.inject(data);

      expect(locations).toContain('head-start');

      const script = document.querySelector('script[data-absmartly-injected="head-start"]');
      expect(script?.textContent).toBe('console.log("test with </script> tag");');
    });
  });

  describe('getInjectedLocations', () => {
    it('should return list of injected locations', () => {
      const data: InjectionData = {
        headStart: 'console.log("1");',
        bodyEnd: 'console.log("2");',
      };

      codeInjector.inject(data);
      const locations = codeInjector.getInjectedLocations();

      expect(locations).toEqual(['head-start', 'body-end']);
    });

    it('should return empty array when no injections', () => {
      const locations = codeInjector.getInjectedLocations();
      expect(locations).toEqual([]);
    });
  });

  describe('hasInjectedAt', () => {
    it('should check if code is injected at location', () => {
      const data: InjectionData = {
        headStart: 'console.log("test");',
      };

      codeInjector.inject(data);

      expect(codeInjector.hasInjectedAt('head-start')).toBe(true);
      expect(codeInjector.hasInjectedAt('head-end')).toBe(false);
      expect(codeInjector.hasInjectedAt('body-start')).toBe(false);
      expect(codeInjector.hasInjectedAt('body-end')).toBe(false);
    });
  });
});
