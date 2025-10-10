import { HTMLInjector } from '../HTMLInjector';
import { InjectionLocation, InjectionDataWithFilter } from '../../types';

// Mock the DEBUG constant
let mockDebugEnabled = false;

jest.mock('../../utils/debug', () => {
  return {
    get DEBUG() {
      return mockDebugEnabled;
    },
    set DEBUG(value: boolean) {
      mockDebugEnabled = value;
    },
    logDebug: jest.fn((...args: unknown[]) => {
      if (mockDebugEnabled) {
        console.log(...args);
      }
    }),
  };
});

describe('HTMLInjector', () => {
  let injector: HTMLInjector;
  let originalHead: HTMLHeadElement | null;
  let originalBody: HTMLBodyElement | null;

  beforeEach(() => {
    // Store originals
    originalHead = document.head as HTMLHeadElement | null;
    originalBody = document.body as HTMLBodyElement | null;

    // Clear content
    if (document.head) {
      document.head.innerHTML = '';
    }
    if (document.body) {
      document.body.innerHTML = '';
    }
    injector = new HTMLInjector(false);

    // Reset DEBUG to false
    mockDebugEnabled = false;
  });

  afterEach(() => {
    injector.destroy();

    // Restore head and body if they were mocked
    if (!document.head && originalHead) {
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    }
    if (!document.body && originalBody) {
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    }

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('parseInjectionKey', () => {
    it('should parse basic location keys without priority', () => {
      expect(injector.parseInjectionKey('headStart')).toEqual({
        location: 'headStart',
        priority: 0,
      });
      expect(injector.parseInjectionKey('headEnd')).toEqual({
        location: 'headEnd',
        priority: 0,
      });
      expect(injector.parseInjectionKey('bodyStart')).toEqual({
        location: 'bodyStart',
        priority: 0,
      });
      expect(injector.parseInjectionKey('bodyEnd')).toEqual({
        location: 'bodyEnd',
        priority: 0,
      });
    });

    it('should parse location keys with priority', () => {
      expect(injector.parseInjectionKey('headStart15')).toEqual({
        location: 'headStart',
        priority: 15,
      });
      expect(injector.parseInjectionKey('headEnd10')).toEqual({
        location: 'headEnd',
        priority: 10,
      });
      expect(injector.parseInjectionKey('bodyStart5')).toEqual({
        location: 'bodyStart',
        priority: 5,
      });
      expect(injector.parseInjectionKey('bodyEnd100')).toEqual({
        location: 'bodyEnd',
        priority: 100,
      });
    });

    it('should handle zero priority', () => {
      expect(injector.parseInjectionKey('headStart0')).toEqual({
        location: 'headStart',
        priority: 0,
      });
    });

    it('should handle negative priority', () => {
      expect(injector.parseInjectionKey('headStart-5')).toEqual({
        location: 'headStart',
        priority: -5,
      });
    });

    it('should return null for invalid keys', () => {
      expect(injector.parseInjectionKey('invalid')).toBeNull();
      expect(injector.parseInjectionKey('headStartABC')).toBeNull();
      expect(injector.parseInjectionKey('head')).toBeNull();
      expect(injector.parseInjectionKey('')).toBeNull();
    });

    it('should not parse partial location matches', () => {
      expect(injector.parseInjectionKey('head')).toBeNull();
      expect(injector.parseInjectionKey('body')).toBeNull();
      expect(injector.parseInjectionKey('Start')).toBeNull();
    });
  });

  describe('collectInjections', () => {
    it('should collect injections from single experiment and variant', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>console.log("test")</script>',
                  bodyEnd: '<div>footer</div>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.size).toBe(2);
      expect(result.get('headStart')).toHaveLength(1);
      expect(result.get('bodyEnd')).toHaveLength(1);
      expect(result.get('headStart')?.[0]).toEqual({
        code: '<script>console.log("test")</script>',
        priority: 0,
        location: 'headStart',
      });
    });

    it('should collect injections with priorities', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>console.log("default")</script>',
                  headStart15: '<script>console.log("high priority")</script>',
                  headStart5: '<script>console.log("medium priority")</script>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toHaveLength(3);
      const headStartItems = result.get('headStart')!;

      // Should be sorted by priority descending (15, 5, 0)
      expect(headStartItems[0].priority).toBe(15);
      expect(headStartItems[1].priority).toBe(5);
      expect(headStartItems[2].priority).toBe(0);
    });

    it('should collect injections from multiple experiments', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [0, { data: { headStart: '<script>exp1</script>' } } as InjectionDataWithFilter],
          ]),
        ],
        [
          'exp2',
          new Map([
            [0, { data: { headStart: '<script>exp2</script>' } } as InjectionDataWithFilter],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toHaveLength(2);
    });

    it('should collect injections from multiple variants', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [0, { data: { headStart: '<script>variant0</script>' } } as InjectionDataWithFilter],
            [1, { data: { headStart: '<script>variant1</script>' } } as InjectionDataWithFilter],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toHaveLength(2);
    });

    it('should handle empty injection data', () => {
      const allInjectHTML = new Map();
      const result = injector.collectInjections(allInjectHTML);
      expect(result.size).toBe(0);
    });

    it('should skip invalid injection data', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [0, null as any],
            [1, 'invalid' as any],
            [2, { data: { headStart: '<script>valid</script>' } } as InjectionDataWithFilter],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toHaveLength(1);
    });

    it('should skip non-string code values', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: 123,
                  bodyEnd: '<div>valid</div>',
                },
              } as any,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toBeUndefined();
      expect(result.get('bodyEnd')).toHaveLength(1);
    });

    it('should handle duplicate priorities by preserving order', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart10: '<script>first</script>',
                  headStart: '<script>second</script>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
        [
          'exp2',
          new Map([
            [
              0,
              {
                data: {
                  headStart10: '<script>third</script>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);
      const items = result.get('headStart')!;

      // Both priority 10 items should come before priority 0
      expect(items[0].priority).toBe(10);
      expect(items[1].priority).toBe(10);
      expect(items[2].priority).toBe(0);
    });
  });

  describe('inject', () => {
    it('should inject at headStart', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'headStart',
          [{ code: '<script>test</script>', priority: 0, location: 'headStart' }],
        ],
      ]);

      injector.inject(injections);

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<script>test</script>');
      expect(document.head.firstChild).toBe(injected);
    });

    it('should inject at headEnd', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'headEnd',
          [{ code: '<style>body { margin: 0; }</style>', priority: 0, location: 'headEnd' }],
        ],
      ]);

      injector.inject(injections);

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<style>body { margin: 0; }</style>');
      expect(document.head.lastChild).toBe(injected);
    });

    it('should inject at bodyStart', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'bodyStart',
          [{ code: '<div>header</div>', priority: 0, location: 'bodyStart' }],
        ],
      ]);

      injector.inject(injections);

      const injected = document.body.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<div>header</div>');
      expect(document.body.firstChild).toBe(injected);
    });

    it('should inject at bodyEnd', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'bodyEnd',
          [{ code: '<div>footer</div>', priority: 0, location: 'bodyEnd' }],
        ],
      ]);

      injector.inject(injections);

      const injected = document.body.querySelector('[data-absmartly-injection]');
      expect(injected).toBeTruthy();
      expect(injected?.innerHTML).toBe('<div>footer</div>');
      expect(document.body.lastChild).toBe(injected);
    });

    it('should inject multiple items in priority order', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'headStart',
          [
            { code: '<script>priority-15</script>', priority: 15, location: 'headStart' },
            { code: '<script>priority-10</script>', priority: 10, location: 'headStart' },
            { code: '<script>priority-0</script>', priority: 0, location: 'headStart' },
          ],
        ],
      ]);

      injector.inject(injections);

      const injected = document.head.querySelectorAll('[data-absmartly-injection]');
      expect(injected).toHaveLength(3);

      // Higher priority should be injected first (earlier in DOM)
      expect(injected[0].innerHTML).toBe('<script>priority-15</script>');
      expect(injected[1].innerHTML).toBe('<script>priority-10</script>');
      expect(injected[2].innerHTML).toBe('<script>priority-0</script>');
    });

    it('should inject at all four locations', () => {
      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>head-start</script>', priority: 0, location: 'headStart' }]],
        ['headEnd', [{ code: '<script>head-end</script>', priority: 0, location: 'headEnd' }]],
        ['bodyStart', [{ code: '<div>body-start</div>', priority: 0, location: 'bodyStart' }]],
        ['bodyEnd', [{ code: '<div>body-end</div>', priority: 0, location: 'bodyEnd' }]],
      ]);

      injector.inject(injections);

      expect(document.head.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
      expect(document.body.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);
    });
  });

  describe('destroy', () => {
    it('should remove all injected elements', () => {
      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>test</script>', priority: 0, location: 'headStart' }]],
        ['bodyEnd', [{ code: '<div>footer</div>', priority: 0, location: 'bodyEnd' }]],
      ]);

      injector.inject(injections);

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(2);

      injector.destroy();

      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(0);
    });

    it('should clear injected IDs', () => {
      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>test</script>', priority: 0, location: 'headStart' }]],
      ]);

      injector.inject(injections);
      injector.destroy();

      // Injecting again should work (IDs were cleared)
      injector.inject(injections);
      expect(document.querySelectorAll('[data-absmartly-injection]')).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle script tags with special characters', () => {
      const injections = new Map<InjectionLocation, any>([
        [
          'headStart',
          [{ code: '<script>alert("test\'s <tag>");</script>', priority: 0, location: 'headStart' }],
        ],
      ]);

      injector.inject(injections);

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected?.innerHTML).toBe('<script>alert("test\'s <tag>");</script>');
    });

    it('should handle empty code', () => {
      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '', priority: 0, location: 'headStart' }]],
      ]);

      injector.inject(injections);

      const injected = document.head.querySelector('[data-absmartly-injection]');
      expect(injected?.innerHTML).toBe('');
    });

    it('should handle complex HTML structures', () => {
      const complexHTML = `
        <div class="banner">
          <h1>Title</h1>
          <p>Description</p>
        </div>
      `;

      const injections = new Map<InjectionLocation, any>([
        ['bodyStart', [{ code: complexHTML, priority: 0, location: 'bodyStart' }]],
      ]);

      injector.inject(injections);

      const injected = document.body.querySelector('[data-absmartly-injection]');
      expect(injected?.querySelector('.banner')).toBeTruthy();
      expect(injected?.querySelector('h1')?.textContent).toBe('Title');
    });
  });

  describe('debug mode', () => {
    beforeEach(() => {
      // Enable DEBUG
      mockDebugEnabled = true;

      injector.destroy();
      injector = new HTMLInjector(true); // Enable debug mode
    });

    afterEach(() => {
      // Disable DEBUG
      mockDebugEnabled = false;
    });

    it('should log debug messages for invalid keys', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      expect(injector.parseInjectionKey('invalidKey')).toBeNull();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Invalid injection key:'),
        'invalidKey'
      );

      consoleSpy.mockRestore();
    });

    it('should log debug messages when collecting injections', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>test</script>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      injector.collectInjections(allInjectHTML);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Collected injection:'),
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Sorted headStart injections by priority:'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should log debug messages for invalid injection data', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const allInjectHTML = new Map([
        ['exp1', new Map([[0, null as any]])],
      ]);

      injector.collectInjections(allInjectHTML);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Invalid injection data for exp1 variant 0:'),
        null
      );

      consoleSpy.mockRestore();
    });

    it('should log debug messages for non-string code', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: 123,
                },
              } as any,
            ],
          ]),
        ],
      ]);

      injector.collectInjections(allInjectHTML);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Skipping non-string injection code for key headStart:'),
        123
      );

      consoleSpy.mockRestore();
    });

    it('should log debug messages when injecting', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>test</script>', priority: 0, location: 'headStart' }]],
      ]);

      injector.inject(injections);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Injected at headStart:'),
        expect.any(Object)
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] All injections complete')
      );

      consoleSpy.mockRestore();
    });

    it('should log debug messages on destroy', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      injector.destroy();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Destroyed and cleaned up all injections')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle missing head element for headStart', () => {
      const originalHead = document.head;
      Object.defineProperty(document, 'head', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>test</script>', priority: 0, location: 'headStart' }]],
      ]);

      // Should not throw
      expect(() => injector.inject(injections)).not.toThrow();

      // Restore
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    });

    it('should handle missing head element for headEnd', () => {
      const originalHead = document.head;
      Object.defineProperty(document, 'head', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['headEnd', [{ code: '<script>test</script>', priority: 0, location: 'headEnd' }]],
      ]);

      // Should not throw
      expect(() => injector.inject(injections)).not.toThrow();

      // Restore
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    });

    it('should handle missing body element for bodyStart', () => {
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['bodyStart', [{ code: '<div>test</div>', priority: 0, location: 'bodyStart' }]],
      ]);

      // Should not throw
      expect(() => injector.inject(injections)).not.toThrow();

      // Restore
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    });

    it('should handle missing body element for bodyEnd', () => {
      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['bodyEnd', [{ code: '<div>test</div>', priority: 0, location: 'bodyEnd' }]],
      ]);

      // Should not throw
      expect(() => injector.inject(injections)).not.toThrow();

      // Restore
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    });

    it('should log debug message when head is missing', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true); // Enable debug

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const originalHead = document.head;
      Object.defineProperty(document, 'head', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['headStart', [{ code: '<script>test</script>', priority: 0, location: 'headStart' }]],
      ]);

      injector.inject(injections);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] <head> element not found for headStart injection')
      );

      consoleSpy.mockRestore();

      // Restore
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    });

    it('should log debug message when body is missing', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true); // Enable debug

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['bodyStart', [{ code: '<div>test</div>', priority: 0, location: 'bodyStart' }]],
      ]);

      injector.inject(injections);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] <body> element not found for bodyStart injection')
      );

      consoleSpy.mockRestore();

      // Restore
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    });

    it('should handle injection errors gracefully', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true); // Enable debug

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Force an error by making appendChild throw
      const originalAppendChild = document.head.appendChild;
      document.head.appendChild = jest.fn(() => {
        throw new Error('Test error');
      });

      const injections = new Map<InjectionLocation, any>([
        ['headEnd', [{ code: '<script>test</script>', priority: 0, location: 'headEnd' }]],
      ]);

      // Should not throw
      expect(() => injector.inject(injections)).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Error injecting at headEnd:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();

      // Restore
      document.head.appendChild = originalAppendChild;
    });

    it('should skip variants with null or invalid rawData', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [0, { data: null } as any],
            [1, { data: 'invalid string' } as any],
            [2, { data: { headStart: '<script>valid</script>' } } as InjectionDataWithFilter],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML);

      expect(result.get('headStart')).toHaveLength(1);
    });

    it('should log debug message when rawData is invalid', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const allInjectHTML = new Map([
        ['exp1', new Map([[0, { data: null } as any]])],
      ]);

      injector.collectInjections(allInjectHTML);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Invalid injection data for exp1 variant 0:'),
        null
      );

      consoleSpy.mockRestore();
    });

    it('should log debug message when head is missing for headEnd', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const originalHead = document.head;
      Object.defineProperty(document, 'head', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['headEnd', [{ code: '<script>test</script>', priority: 0, location: 'headEnd' }]],
      ]);

      injector.inject(injections);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] <head> element not found for headEnd injection')
      );

      consoleSpy.mockRestore();

      // Restore
      Object.defineProperty(document, 'head', {
        value: originalHead,
        writable: true,
        configurable: true,
      });
    });

    it('should log debug message when body is missing for bodyEnd', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const originalBody = document.body;
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
        configurable: true,
      });

      const injections = new Map<InjectionLocation, any>([
        ['bodyEnd', [{ code: '<div>test</div>', priority: 0, location: 'bodyEnd' }]],
      ]);

      injector.inject(injections);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] <body> element not found for bodyEnd injection')
      );

      consoleSpy.mockRestore();

      // Restore
      Object.defineProperty(document, 'body', {
        value: originalBody,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('URL filtering', () => {
    it('should filter injections by URL with include pattern', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>matched</script>',
                },
                urlFilter: {
                  include: ['/products'],
                  mode: 'simple',
                  matchType: 'path',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML, 'https://example.com/products');
      expect(result.get('headStart')).toHaveLength(1);

      const resultNoMatch = injector.collectInjections(allInjectHTML, 'https://example.com/checkout');
      expect(resultNoMatch.get('headStart')).toBeUndefined();
    });

    it('should filter injections by URL with exclude pattern', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>not-checkout</script>',
                },
                urlFilter: {
                  exclude: ['/checkout'],
                  mode: 'simple',
                  matchType: 'path',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML, 'https://example.com/products');
      expect(result.get('headStart')).toHaveLength(1);

      const resultExcluded = injector.collectInjections(allInjectHTML, 'https://example.com/checkout');
      expect(resultExcluded.get('headStart')).toBeUndefined();
    });

    it('should inject without URL filter (legacy behavior)', () => {
      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>no-filter</script>',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      const result = injector.collectInjections(allInjectHTML, 'https://example.com/any-path');
      expect(result.get('headStart')).toHaveLength(1);
    });

    it('should log debug message when URL filter does not match', () => {
      mockDebugEnabled = true;
      injector.destroy();
      injector = new HTMLInjector(true); // Enable debug

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>test</script>',
                },
                urlFilter: {
                  include: ['/products'],
                  mode: 'simple',
                  matchType: 'path',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      injector.collectInjections(allInjectHTML, 'https://example.com/checkout');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HTMLInjector] Skipping exp1 variant 0 - URL filter doesn\'t match:'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should use default URL when not provided', () => {
      // Mock window.location.href
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/products' },
        writable: true,
      });

      const allInjectHTML = new Map([
        [
          'exp1',
          new Map([
            [
              0,
              {
                data: {
                  headStart: '<script>test</script>',
                },
                urlFilter: {
                  include: ['/products'],
                  mode: 'simple',
                  matchType: 'path',
                },
              } as InjectionDataWithFilter,
            ],
          ]),
        ],
      ]);

      // Call without URL parameter - should use window.location.href
      const result = injector.collectInjections(allInjectHTML);
      expect(result.get('headStart')).toHaveLength(1);
    });
  });
});
