import { MessageBridge } from '../MessageBridge';
import { Overrides, ExperimentData } from '../../types';

describe('MessageBridge', () => {
  let messageBridge: MessageBridge;
  let postMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    messageBridge = new MessageBridge(false);
    postMessageSpy = jest.spyOn(window, 'postMessage');
  });

  afterEach(() => {
    messageBridge.destroy();
    postMessageSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should be ready after construction', () => {
      expect(messageBridge.getIsReady()).toBe(true);
    });

    it('should set ready to false after destroy', () => {
      messageBridge.destroy();
      expect(messageBridge.getIsReady()).toBe(false);
    });
  });

  describe('message handling', () => {
    it('should handle messages from extension', () => {
      const handler = jest.fn();
      messageBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
            payload: { test: 'data' },
          },
          source: window,
        })
      );

      expect(handler).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should ignore messages from other sources', () => {
      const handler = jest.fn();
      messageBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'other-source',
            type: 'TEST_MESSAGE',
            payload: { test: 'data' },
          },
          source: window,
        })
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore messages from different window', () => {
      const handler = jest.fn();
      messageBridge.on('TEST_MESSAGE', handler);

      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: iframe.contentWindow,
        })
      );

      expect(handler).not.toHaveBeenCalled();
      iframe.remove();
    });

    it('should handle empty payload', () => {
      const handler = jest.fn();
      messageBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: window,
        })
      );

      expect(handler).toHaveBeenCalledWith({});
    });

    it('should handle handler errors', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      messageBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: window,
        })
      );

      expect(errorSpy).toHaveBeenCalled();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ERROR',
          payload: { error: 'Test error' },
        }),
        '*'
      );
    });
  });

  describe('handler registration', () => {
    it('should register and unregister handlers', () => {
      const handler = jest.fn();
      messageBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: window,
        })
      );

      expect(handler).toHaveBeenCalledTimes(1);

      messageBridge.off('TEST_MESSAGE');

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: window,
        })
      );

      expect(handler).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should replace existing handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      messageBridge.on('TEST_MESSAGE', handler1);
      messageBridge.on('TEST_MESSAGE', handler2);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
          },
          source: window,
        })
      );

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('message sending', () => {
    it('should send messages with correct structure', () => {
      messageBridge.sendMessage('TEST_TYPE', {
        changes: [{ selector: '.test', type: 'text' }],
      } as any);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'TEST_TYPE',
          payload: { data: 'test' },
        },
        '*'
      );
    });

    it('should send message without payload', () => {
      messageBridge.sendMessage('TEST_TYPE');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'TEST_TYPE',
          payload: undefined,
        },
        '*'
      );
    });
  });

  describe('convenience methods', () => {
    it('should send plugin ready notification', () => {
      messageBridge.notifyReady('1.0.0', ['feature1', 'feature2']);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'PLUGIN_READY',
          payload: { version: '1.0.0', capabilities: ['feature1', 'feature2'] },
        },
        '*'
      );
    });

    it('should request injection code', () => {
      messageBridge.requestInjectionCode();

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'REQUEST_INJECTION_CODE',
          payload: undefined,
        },
        '*'
      );
    });

    it('should request overrides', () => {
      messageBridge.requestOverrides();

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'REQUEST_OVERRIDES',
          payload: undefined,
        },
        '*'
      );
    });

    it('should notify changes applied', () => {
      messageBridge.notifyChangesApplied(5, 'exp1');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'CHANGES_APPLIED',
          payload: { count: 5, experimentName: 'exp1' },
        },
        '*'
      );
    });

    it('should notify changes removed', () => {
      messageBridge.notifyChangesRemoved('exp1');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'CHANGES_REMOVED',
          payload: { experimentName: 'exp1' },
        },
        '*'
      );
    });

    it('should send experiment data', () => {
      const experiments: ExperimentData[] = [
        { name: 'exp1', variants: [] },
        { name: 'exp2', variants: [] },
      ];

      messageBridge.sendExperimentData(experiments);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'EXPERIMENT_DATA',
          payload: { experiments },
        },
        '*'
      );
    });

    it('should send overrides data', () => {
      const overrides: Overrides = {
        exp1: 1,
        exp2: 2,
      };

      messageBridge.sendOverridesData(overrides);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'OVERRIDES_DATA',
          payload: { overrides },
        },
        '*'
      );
    });

    it('should notify experiment triggered', () => {
      messageBridge.notifyExperimentTriggered('exp1', 1);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'EXPERIMENT_TRIGGERED',
          payload: { experimentName: 'exp1', variant: 1 },
        },
        '*'
      );
    });

    it('should send error', () => {
      messageBridge.sendError('Test error message');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'ERROR',
          payload: { error: 'Test error message' },
        },
        '*'
      );
    });

    it('should notify code injected', () => {
      const locations = ['head-start', 'body-end'];
      messageBridge.notifyCodeInjected(locations);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: 'absmartly-sdk',
          type: 'CODE_INJECTED',
          payload: { locations },
        },
        '*'
      );
    });
  });

  describe('debug mode', () => {
    it('should log messages when debug is enabled', () => {
      const logSpy = jest.spyOn(console, 'log');
      const debugBridge = new MessageBridge(true);

      debugBridge.sendMessage('TEST', { changes: [{ selector: '.test', type: 'text' }] } as any);

      expect(logSpy).toHaveBeenCalledWith('[ABsmartly] Sending message:', 'TEST', { data: 'test' });

      debugBridge.destroy();
    });

    it('should log received messages when debug is enabled', () => {
      const logSpy = jest.spyOn(console, 'log');
      const debugBridge = new MessageBridge(true);

      const handler = jest.fn();
      debugBridge.on('TEST_MESSAGE', handler);

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST_MESSAGE',
            payload: { test: 'data' },
          },
          source: window,
        })
      );

      expect(logSpy).toHaveBeenCalledWith('[ABsmartly] Received message:', 'TEST_MESSAGE', {
        test: 'data',
      });

      debugBridge.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear all handlers on destroy', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      messageBridge.on('TEST1', handler1);
      messageBridge.on('TEST2', handler2);

      messageBridge.destroy();

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST1',
          },
          source: window,
        })
      );

      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: 'absmartly-extension',
            type: 'TEST2',
          },
          source: window,
        })
      );

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
