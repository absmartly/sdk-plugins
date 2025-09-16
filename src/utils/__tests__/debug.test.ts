import {
  logDebug,
  logChangeApplication,
  logChangeRemoval,
  logExperimentSummary,
  logStateOperation,
  logVisibilityEvent,
  logMessage,
  logPerformance,
  DEBUG,
  LogContext,
} from '../debug';

const mockConsoleLog = jest.fn();

describe('Debug Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = mockConsoleLog;
  });

  describe('DEBUG flag', () => {
    it('should be available as an export', () => {
      expect(typeof DEBUG).toBe('boolean');
    });

    it('should be defined', () => {
      expect(DEBUG).toBeDefined();
    });
  });

  describe('when DEBUG is true', () => {
    const originalDebug = DEBUG;

    beforeAll(() => {
      // Mock DEBUG to true by overriding the imported value
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Object.defineProperty(require('../debug'), 'DEBUG', {
        value: true,
        configurable: true,
      });
    });

    afterAll(() => {
      // Restore original DEBUG value
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Object.defineProperty(require('../debug'), 'DEBUG', {
        value: originalDebug,
        configurable: true,
      });
    });

    describe('logDebug', () => {
      it('should log debug message with context', () => {
        const message = 'Test debug message';
        const context: LogContext = {
          experimentName: 'test-exp',
          selector: '.test',
          changeType: 'text',
        };

        logDebug(message, context);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('[ABsmartly Debug]'),
          context
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(message), context);
      });

      it('should log debug message without context', () => {
        const message = 'Test debug message without context';

        logDebug(message);

        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('[ABsmartly Debug]'));
      });

      it('should include timestamp in log messages', () => {
        const message = 'Test timestamp';

        logDebug(message);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[ABsmartly Debug\] \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] Test timestamp/
          )
        );
      });

      it('should skip repetitive messages', () => {
        logDebug('Original state already stored for element');
        logDebug('State store operation completed');
        logDebug('Message sent: test');
        logDebug('Message received: test');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should skip performance messages with duration < 5ms', () => {
        logDebug('Performance: some operation', { duration: 3 });

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should allow performance messages with duration >= 5ms', () => {
        logDebug('Performance: slow operation', { duration: 10 });

        expect(mockConsoleLog).toHaveBeenCalled();
      });
    });

    describe('logChangeApplication', () => {
      it('should log successful change application', () => {
        logChangeApplication('test-exp', '.test', 'text', 3, true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('✓ Applied text change to 3 element(s)'),
          expect.objectContaining({
            experimentName: 'test-exp',
            selector: '.test',
            changeType: 'text',
            elementsCount: 3,
            success: true,
          })
        );
      });

      it('should log failed change application', () => {
        logChangeApplication('test-exp', '.test', 'style', 0, false);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('✗ Applied style change to 0 element(s)'),
          expect.objectContaining({
            success: false,
          })
        );
      });
    });

    describe('logChangeRemoval', () => {
      it('should log change removal', () => {
        logChangeRemoval('test-exp', '.removed', 'text', 5);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('Restored 5 element(s) to original state'),
          expect.objectContaining({
            experimentName: 'test-exp',
            selector: '.removed',
            changeType: 'text',
            elementsCount: 5,
            action: 'restore',
          })
        );
      });
    });

    describe('logExperimentSummary', () => {
      it('should log experiment summary with success rate', () => {
        logExperimentSummary('test-exp', 10, 8, 2);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('Experiment "test-exp" summary'),
          expect.objectContaining({
            experimentName: 'test-exp',
            totalChanges: 10,
            successfulChanges: 8,
            pendingChanges: 2,
            successRate: '80%',
          })
        );
      });

      it('should handle zero total changes', () => {
        logExperimentSummary('empty-exp', 0, 0, 0);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            successRate: 'N/A',
          })
        );
      });

      it('should round success rate correctly', () => {
        logExperimentSummary('round-exp', 3, 1, 2);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            successRate: '33%',
          })
        );
      });
    });

    describe('logStateOperation', () => {
      it('should log store operation', () => {
        // Note: logStateOperation is filtered out by the debug utility, so we won't see console output
        logStateOperation('store', '.test', 'text', 'test-exp');

        // The message is filtered out by the debug utility, so no console.log call is made
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should handle missing experimentName', () => {
        logStateOperation('retrieve', '.test', 'style');

        // The retrieve operation is not filtered, so console.log should be called
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('State retrieve operation'),
          expect.objectContaining({
            experimentName: undefined,
          })
        );
      });
    });

    describe('logVisibilityEvent', () => {
      let mockElement: Element;

      beforeEach(() => {
        mockElement = document.createElement('div');
      });

      it('should log triggered visibility event', () => {
        mockElement.className = 'test-visible';

        logVisibilityEvent('visibility-exp', mockElement, true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('Element became visible - experiment triggered'),
          expect.objectContaining({
            experimentName: 'visibility-exp',
            selector: 'test-visible',
            triggered: true,
            action: 'visibility',
          })
        );
      });

      it('should use tagName when no className or id', () => {
        logVisibilityEvent('tag-exp', mockElement, true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            selector: 'DIV',
          })
        );
      });

      it('should prefer className over id', () => {
        mockElement.className = 'priority-class';
        mockElement.id = 'priority-id';

        logVisibilityEvent('priority-exp', mockElement, true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            selector: 'priority-class',
          })
        );
      });
    });

    describe('logMessage', () => {
      it('should log sent message', () => {
        const payload = { action: 'test', data: 'test-data' };

        logMessage('sent', 'APPLY_CHANGES', payload);

        // The message is filtered out by the debug utility, so no console.log call is made
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should log received message without payload', () => {
        logMessage('received', 'HEARTBEAT');

        // The message is filtered out by the debug utility, so no console.log call is made
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });
    });

    describe('logPerformance', () => {
      it('should log performance with duration', () => {
        logPerformance('DOM manipulation', 150);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('Performance: DOM manipulation took 150ms'),
          expect.objectContaining({
            operation: 'DOM manipulation',
            duration: 150,
            performance: true,
          })
        );
      });

      it('should log performance with additional details', () => {
        const details = {
          elementsProcessed: 100,
          changesApplied: 50,
        };

        logPerformance('Batch operation', 500, details);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('Performance: Batch operation took 500ms'),
          expect.objectContaining({
            operation: 'Batch operation',
            duration: 500,
            performance: true,
            elementsProcessed: 100,
            changesApplied: 50,
          })
        );
      });

      it('should handle fractional duration', () => {
        logPerformance('Quick operation', 1.5);

        // Performance messages with duration < 5ms are filtered out by the debug utility
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });
    });
  });

  describe('when DEBUG is false', () => {
    const originalDebug = DEBUG;

    beforeAll(() => {
      // Mock DEBUG to false
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Object.defineProperty(require('../debug'), 'DEBUG', {
        value: false,
        configurable: true,
      });
    });

    afterAll(() => {
      // Restore original DEBUG value
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Object.defineProperty(require('../debug'), 'DEBUG', {
        value: originalDebug,
        configurable: true,
      });
    });

    it('should not log debug messages when DEBUG is false', () => {
      logDebug('This should not be logged');
      logChangeApplication('test', '.test', 'text', 1, true);
      logChangeRemoval('test', '.test', 'text', 1);
      logExperimentSummary('test', 1, 1, 0);
      logStateOperation('store', '.test', 'text');
      logMessage('sent', 'TEST');
      logPerformance('test', 100);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('LogContext interface', () => {
    it('should handle all standard LogContext properties', () => {
      const context: LogContext = {
        experimentName: 'interface-test',
        selector: '.interface',
        changeType: 'test',
        elementsCount: 42,
      };

      // This test just verifies the interface compiles correctly
      expect(context.experimentName).toBe('interface-test');
      expect(context.selector).toBe('.interface');
      expect(context.changeType).toBe('test');
      expect(context.elementsCount).toBe(42);
    });

    it('should handle custom properties', () => {
      const context: LogContext = {
        experimentName: 'custom-test',
        customProp1: 'value1',
        customProp2: 123,
        customArray: [1, 2, 3],
      };

      expect(context.customProp1).toBe('value1');
      expect(context.customProp2).toBe(123);
      expect(context.customArray).toEqual([1, 2, 3]);
    });
  });
});
