/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
// This will be replaced by webpack DefinePlugin
declare const __DEBUG__: boolean;

// Build-time debug flag - true in development, false in production
export const DEBUG = typeof __DEBUG__ !== 'undefined' ? __DEBUG__ : false;

export interface LogContext {
  experimentName?: string;
  selector?: string;
  changeType?: string;
  elementsCount?: number;
  [key: string]: any;
}

/**
 * Logs debug messages only when DEBUG flag is true
 * This function will be completely removed in production builds
 */
export function logDebug(...args: unknown[]): void {
  if (DEBUG) {
    // Handle old format with message and context
    if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'object') {
      const [message, context] = args as [string, LogContext];
      // Skip repetitive messages
      if (message.includes('Original state already stored')) return;
      if (message.includes('State store operation')) return;
      if (message.includes('Performance:') && context?.duration && context.duration < 5) return;
      if (message.includes('Message sent:') || message.includes('Message received:')) return;

      const timestamp = new Date().toISOString();
      const prefix = '[ABsmartly Debug]';
      console.log(`${prefix} [${timestamp}] ${message}`, context);
    } else if (args.length === 1 && typeof args[0] === 'string') {
      // Single string message
      const message = args[0] as string;
      // Skip repetitive messages
      if (message.includes('Original state already stored')) return;
      if (message.includes('State store operation')) return;
      if (message.includes('Message sent:') || message.includes('Message received:')) return;

      const timestamp = new Date().toISOString();
      const prefix = '[ABsmartly Debug]';
      console.log(`${prefix} [${timestamp}] ${message}`);
    } else {
      // Direct console.log replacement - just pass through all arguments
      console.log(...args);
    }
  }
}

/**
 * Logs detailed change application
 */
export function logChangeApplication(
  experimentName: string,
  selector: string,
  changeType: string,
  elementsAffected: number,
  success: boolean
): void {
  if (DEBUG) {
    const status = success ? '✓' : '✗';
    const message = `${status} Applied ${changeType} change to ${elementsAffected} element(s)`;

    logDebug(message, {
      experimentName,
      selector,
      changeType,
      elementsCount: elementsAffected,
      success,
    });
  }
}

/**
 * Logs change removal/restoration
 */
export function logChangeRemoval(
  experimentName: string,
  selector: string,
  changeType: string,
  elementsRestored: number
): void {
  if (DEBUG) {
    const message = `Restored ${elementsRestored} element(s) to original state`;

    logDebug(message, {
      experimentName,
      selector,
      changeType,
      elementsCount: elementsRestored,
      action: 'restore',
    });
  }
}

/**
 * Logs experiment summary
 */
export function logExperimentSummary(
  experimentName: string,
  totalChanges: number,
  successfulChanges: number,
  pendingChanges: number
): void {
  if (DEBUG) {
    const message = `Experiment "${experimentName}" summary`;

    logDebug(message, {
      experimentName,
      totalChanges,
      successfulChanges,
      pendingChanges,
      successRate:
        totalChanges > 0 ? `${Math.round((successfulChanges / totalChanges) * 100)}%` : 'N/A',
    });
  }
}

/**
 * Logs state management operations
 */
export function logStateOperation(
  operation: 'store' | 'retrieve' | 'clear',
  selector: string,
  changeType: string,
  experimentName?: string
): void {
  if (DEBUG) {
    const message = `State ${operation} operation`;

    logDebug(message, {
      operation,
      selector,
      changeType,
      experimentName,
    });
  }
}

/**
 * Logs visibility tracking events
 */
export function logVisibilityEvent(
  experimentName: string,
  element: Element,
  triggered: boolean
): void {
  if (DEBUG) {
    const message = triggered
      ? 'Element became visible - experiment triggered'
      : 'Element visibility changed';

    logDebug(message, {
      experimentName,
      selector: element.className || element.id || element.tagName,
      triggered,
      action: 'visibility',
    });
  }
}

/**
 * Logs message bridge communication
 */
export function logMessage(
  direction: 'sent' | 'received',
  messageType: string,
  payload?: any
): void {
  if (DEBUG) {
    const message = `Message ${direction}: ${messageType}`;

    logDebug(message, {
      direction,
      messageType,
      payload,
      bridge: 'extension',
    });
  }
}

/**
 * Logs performance metrics
 */
export function logPerformance(operation: string, duration: number, details?: any): void {
  if (DEBUG) {
    const message = `Performance: ${operation} took ${duration}ms`;

    logDebug(message, {
      operation,
      duration,
      performance: true,
      ...details,
    });
  }
}
