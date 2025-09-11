import { PendingChangeManager } from '../PendingChangeManager';
import { DOMChange } from '../../types';

describe('PendingChangeManager', () => {
  let manager: PendingChangeManager;
  let applyFnMock: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    applyFnMock = jest.fn().mockReturnValue(true);
    manager = new PendingChangeManager(applyFnMock, false);
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
  });

  describe('addPending', () => {
    it('should apply change immediately if element exists', () => {
      document.body.innerHTML = '<button class="btn">Click</button>';

      const change: DOMChange = {
        selector: '.btn',
        type: 'style',
        value: { backgroundColor: 'red' },
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      // Should apply immediately
      expect(applyFnMock).toHaveBeenCalledWith(change, 'test-exp', expect.any(HTMLElement));
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should add to pending if element does not exist', () => {
      const change: DOMChange = {
        selector: '.missing',
        type: 'text',
        value: 'New Text',
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      expect(applyFnMock).not.toHaveBeenCalled();
      expect(manager.getPendingCount()).toBe(1);
    });

    it('should use document root if observerRoot does not exist', () => {
      const change: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Click me',
        waitForElement: true,
        observerRoot: '.non-existent-container',
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
        observerRoot: '.non-existent-container',
      });

      // Should treat as document root
      expect(manager.getPendingCount()).toBe(1);
    });

    it('should use specified observerRoot if it exists', () => {
      document.body.innerHTML = `
        <div class="container">
          <button class="btn">Click</button>
        </div>
      `;

      const change: DOMChange = {
        selector: '.btn',
        type: 'style',
        value: { color: 'blue' },
        waitForElement: true,
        observerRoot: '.container',
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
        observerRoot: '.container',
      });

      // Should apply immediately since element exists in container
      expect(applyFnMock).toHaveBeenCalled();
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe('MutationObserver behavior', () => {
    it('should apply pending changes when elements are added', async () => {
      const change: DOMChange = {
        selector: '.dynamic',
        type: 'text',
        value: 'Dynamic content',
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      expect(applyFnMock).not.toHaveBeenCalled();

      // Add element dynamically
      const div = document.createElement('div');
      div.className = 'dynamic';
      document.body.appendChild(div);

      // Wait for MutationObserver and batch processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(applyFnMock).toHaveBeenCalledWith(change, 'test-exp', div);
      expect(manager.getAppliedCount()).toBe(1);
    });

    it('should handle nested elements being added', async () => {
      const change: DOMChange = {
        selector: '.nested-btn',
        type: 'style',
        value: { backgroundColor: 'green' },
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      // Add container with nested element
      const container = document.createElement('div');
      container.innerHTML = '<button class="nested-btn">Nested</button>';
      document.body.appendChild(container);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(applyFnMock).toHaveBeenCalled();
      const button = container.querySelector('.nested-btn');
      expect(applyFnMock).toHaveBeenCalledWith(change, 'test-exp', button);
    });

    it('should batch multiple changes for performance', async () => {
      const changes = [
        { selector: '.btn1', type: 'text' as const, value: 'Button 1', waitForElement: true },
        { selector: '.btn2', type: 'text' as const, value: 'Button 2', waitForElement: true },
        { selector: '.btn3', type: 'text' as const, value: 'Button 3', waitForElement: true },
      ];

      changes.forEach(change => {
        manager.addPending({
          change,
          experimentName: 'test-exp',
        });
      });

      // Add all elements at once
      document.body.innerHTML = `
        <button class="btn1"></button>
        <button class="btn2"></button>
        <button class="btn3"></button>
      `;

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // All should be applied in one batch
      expect(applyFnMock).toHaveBeenCalledTimes(3);
    });

    it('should observe specific container when observerRoot is provided', async () => {
      document.body.innerHTML = '<div class="container"></div>';

      const change: DOMChange = {
        selector: '.container-btn',
        type: 'text',
        value: 'Container Button',
        waitForElement: true,
        observerRoot: '.container',
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
        observerRoot: '.container',
      });

      // Add to container
      const container = document.querySelector('.container')!;
      const btn = document.createElement('button');
      btn.className = 'container-btn';
      container.appendChild(btn);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(applyFnMock).toHaveBeenCalledWith(change, 'test-exp', btn);
    });
  });

  describe('removePending', () => {
    it('should remove specific pending change', () => {
      const change: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Click',
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      expect(manager.getPendingCount()).toBe(1);

      manager.removePending('.btn', 'test-exp');

      expect(manager.getPendingCount()).toBe(0);
    });

    it('should only remove changes for specified experiment', () => {
      const change: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Click',
        waitForElement: true,
      };

      manager.addPending({ change, experimentName: 'exp1' });
      manager.addPending({ change, experimentName: 'exp2' });

      expect(manager.getPendingCount()).toBe(2);

      manager.removePending('.btn', 'exp1');

      expect(manager.getPendingCount()).toBe(1);
      expect(manager.hasPendingForExperiment('exp1')).toBe(false);
      expect(manager.hasPendingForExperiment('exp2')).toBe(true);
    });
  });

  describe('removeAllPending', () => {
    it('should remove all pending changes for an experiment', () => {
      const changes = [
        { selector: '.btn1', type: 'text' as const, value: 'Button 1', waitForElement: true },
        { selector: '.btn2', type: 'text' as const, value: 'Button 2', waitForElement: true },
      ];

      changes.forEach(change => {
        manager.addPending({
          change,
          experimentName: 'test-exp',
        });
      });

      expect(manager.getPendingCount()).toBe(2);

      manager.removeAllPending('test-exp');

      expect(manager.getPendingCount()).toBe(0);
      expect(manager.hasPendingForExperiment('test-exp')).toBe(false);
    });
  });

  describe('observer cleanup', () => {
    it('should disconnect observer when no pending changes remain', async () => {
      const change: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Click',
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      // Add element to apply the change
      const btn = document.createElement('button');
      btn.className = 'btn';
      document.body.appendChild(btn);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Observer should be disconnected after applying
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should maintain separate observers for different roots', () => {
      document.body.innerHTML = `
        <div class="container1"></div>
        <div class="container2"></div>
      `;

      const change1: DOMChange = {
        selector: '.btn1',
        type: 'text',
        value: 'Button 1',
        waitForElement: true,
        observerRoot: '.container1',
      };

      const change2: DOMChange = {
        selector: '.btn2',
        type: 'text',
        value: 'Button 2',
        waitForElement: true,
        observerRoot: '.container2',
      };

      manager.addPending({
        change: change1,
        experimentName: 'exp1',
        observerRoot: '.container1',
      });

      manager.addPending({
        change: change2,
        experimentName: 'exp2',
        observerRoot: '.container2',
      });

      expect(manager.getPendingCount()).toBe(2);

      // Remove one
      manager.removePending('.btn1', 'exp1', '.container1');

      // Other should still be pending
      expect(manager.getPendingCount()).toBe(1);
      expect(manager.hasPendingForExperiment('exp2')).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', () => {
      const changes = [
        { selector: '.btn1', type: 'text' as const, value: 'Button 1', waitForElement: true },
        { selector: '.btn2', type: 'text' as const, value: 'Button 2', waitForElement: true },
      ];

      changes.forEach(change => {
        manager.addPending({
          change,
          experimentName: 'test-exp',
        });
      });

      expect(manager.getPendingCount()).toBe(2);

      manager.destroy();

      expect(manager.getPendingCount()).toBe(0);
      expect(manager.getAppliedCount()).toBe(0);
    });
  });

  describe('applied tracking', () => {
    it('should not apply the same change twice', async () => {
      const change: DOMChange = {
        selector: '.btn',
        type: 'text',
        value: 'Click',
        waitForElement: true,
      };

      manager.addPending({
        change,
        experimentName: 'test-exp',
      });

      // Add element
      const btn = document.createElement('button');
      btn.className = 'btn';
      document.body.appendChild(btn);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(applyFnMock).toHaveBeenCalledTimes(1);

      // Add same selector again
      const btn2 = document.createElement('button');
      btn2.className = 'btn';
      document.body.appendChild(btn2);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not apply again for same experiment
      expect(applyFnMock).toHaveBeenCalledTimes(1);
      expect(manager.getAppliedCount()).toBe(1);
    });
  });
});
