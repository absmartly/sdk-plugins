import {
  MessagePayload,
  MessagePayloadData,
  Overrides,
  MessageHandler,
  ExperimentData,
} from '../types';
import { logMessage } from '../utils/debug';

export class MessageBridge {
  private handlers: Map<string, MessageHandler> = new Map();
  private debug: boolean;
  private isReady = false;

  constructor(debug = false) {
    this.debug = debug;
    this.setupListener();
  }

  private setupListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;

      const data = event.data as MessagePayload;
      if (!data || typeof data !== 'object') return;

      // Only handle messages from the extension
      if (data.source !== 'absmartly-extension') return;

      logMessage('received', data.type, data.payload);

      if (this.debug) {
        console.log('[ABsmartly] Received message:', data.type, data.payload);
      }

      const handler = this.handlers.get(data.type);
      if (handler) {
        try {
          handler(data.payload || {});
        } catch (error) {
          console.error('[ABsmartly] Error handling message:', error);
          this.sendError(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    });

    this.isReady = true;
  }

  on(messageType: string, handler: MessageHandler): void {
    this.handlers.set(messageType, handler);
  }

  off(messageType: string): void {
    this.handlers.delete(messageType);
  }

  sendMessage(type: string, payload?: MessagePayloadData): void {
    const message: MessagePayload = {
      source: 'absmartly-sdk',
      type,
      payload,
    };

    logMessage('sent', type, payload);

    if (this.debug) {
      console.log('[ABsmartly] Sending message:', type, payload);
    }

    window.postMessage(message, '*');
  }

  // Convenience methods for common messages
  notifyReady(version: string, capabilities: string[]): void {
    this.sendMessage('PLUGIN_READY', { version, capabilities });
  }

  requestInjectionCode(): void {
    this.sendMessage('REQUEST_INJECTION_CODE');
  }

  requestOverrides(): void {
    this.sendMessage('REQUEST_OVERRIDES');
  }

  notifyChangesApplied(count: number, experimentName?: string): void {
    this.sendMessage('CHANGES_APPLIED', { count, experimentName });
  }

  notifyChangesRemoved(experimentName?: string): void {
    this.sendMessage('CHANGES_REMOVED', { experimentName });
  }

  sendExperimentData(experiments: ExperimentData[]): void {
    this.sendMessage('EXPERIMENT_DATA', { experiments });
  }

  sendOverridesData(overrides: Overrides): void {
    this.sendMessage('OVERRIDES_DATA', { overrides });
  }

  notifyExperimentTriggered(experimentName: string, variant: number): void {
    this.sendMessage('EXPERIMENT_TRIGGERED', { experimentName, variant });
  }

  sendError(error: string): void {
    this.sendMessage('ERROR', { error });
  }

  notifyCodeInjected(locations: string[]): void {
    this.sendMessage('CODE_INJECTED', { locations });
  }

  destroy(): void {
    this.handlers.clear();
    this.isReady = false;
  }

  getIsReady(): boolean {
    return this.isReady;
  }
}
