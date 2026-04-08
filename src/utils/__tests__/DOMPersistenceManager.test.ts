/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMPersistenceManager } from '../persistence';
import type { DOMChange } from '../../types';

describe('DOMPersistenceManager', () => {
  let manager: DOMPersistenceManager;
  let onReapply: jest.Mock;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
    onReapply = jest.fn();
    manager = new DOMPersistenceManager({ onReapply });
  });

  afterEach(() => {
    manager.destroy();
    document.body.innerHTML = '';
  });

  function createChange(overrides: Partial<DOMChange> = {}): DOMChange {
    return {
      selector: '#test-el',
      type: 'style',
      value: { backgroundColor: 'green' },
      ...overrides,
    };
  }

  function createJavascriptChange(overrides: Partial<DOMChange> = {}): DOMChange {
    return {
      selector: '#test-el',
      type: 'javascript',
      value: 'document.querySelector("#test-el").style.color = "red"',
      ...overrides,
    };
  }

  describe('watchElement', () => {
    it('should register an element for persistence watching', () => {
      const el = document.createElement('div');
      container.appendChild(el);
      const change = createChange();

      manager.watchElement(el, 'exp1', change);

      const applied = manager.getAppliedChanges();
      expect(applied.has('exp1')).toBe(true);
      expect(applied.get('exp1')).toContain(change);
    });

    it('should not duplicate the same change object', () => {
      const el = document.createElement('div');
      container.appendChild(el);
      const change = createChange();

      manager.watchElement(el, 'exp1', change);
      manager.watchElement(el, 'exp1', change);

      expect(manager.getAppliedChanges().get('exp1')).toHaveLength(1);
    });

    it('should track multiple changes for the same experiment', () => {
      const el = document.createElement('div');
      container.appendChild(el);
      const change1 = createChange({ selector: '.a' });
      const change2 = createChange({ selector: '.b' });

      manager.watchElement(el, 'exp1', change1);
      manager.watchElement(el, 'exp1', change2);

      expect(manager.getAppliedChanges().get('exp1')).toHaveLength(2);
    });

    it('should track multiple experiments for the same element', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      manager.watchElement(el, 'exp1', createChange());
      manager.watchElement(el, 'exp2', createChange({ selector: '.other' }));

      const applied = manager.getAppliedChanges();
      expect(applied.has('exp1')).toBe(true);
      expect(applied.has('exp2')).toBe(true);
    });
  });

  describe('unwatchElement', () => {
    it('should remove experiment from element tracking', () => {
      const el = document.createElement('div');
      container.appendChild(el);
      const change = createChange();

      manager.watchElement(el, 'exp1', change);
      manager.unwatchElement(el, 'exp1');

      // After unwatching, mutations should not trigger reapply for that experiment
      // The applied changes map is not cleared by unwatchElement (only by unwatchExperiment)
      expect(manager.getAppliedChanges().has('exp1')).toBe(true);
    });
  });

  describe('unwatchExperiment', () => {
    it('should remove all applied changes for the experiment', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      manager.watchElement(el, 'exp1', createChange());
      manager.unwatchExperiment('exp1');

      expect(manager.getAppliedChanges().has('exp1')).toBe(false);
    });

    it('should not affect other experiments', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      manager.watchElement(el, 'exp1', createChange());
      manager.watchElement(el, 'exp2', createChange({ selector: '.other' }));
      manager.unwatchExperiment('exp1');

      expect(manager.getAppliedChanges().has('exp1')).toBe(false);
      expect(manager.getAppliedChanges().has('exp2')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear all applied changes', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      manager.watchElement(el, 'exp1', createChange());
      manager.watchElement(el, 'exp2', createChange({ selector: '.other' }));
      manager.clearAll();

      expect(manager.getAppliedChanges().size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should disconnect observer and clear all state', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      manager.watchElement(el, 'exp1', createChange());
      manager.destroy();

      expect(manager.getAppliedChanges().size).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      manager.destroy();
      manager.destroy();
    });
  });

  describe('style persistence (MutationObserver)', () => {
    it('should trigger reapply when style is overwritten', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createChange({ persistStyle: true, value: { backgroundColor: 'green' } });
      manager.watchElement(el, 'exp1', change);

      // Wait for observer setup
      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate framework overwriting the style
      el.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalledWith(change, 'exp1');
    });

    it('should NOT trigger reapply when persistStyle is false', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createChange({ persistStyle: false, value: { backgroundColor: 'green' } });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });
  });

  describe('attribute persistence (MutationObserver)', () => {
    it('should trigger reapply when attribute is overwritten', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change: DOMChange = {
        selector: '#test-el',
        type: 'attribute',
        value: { 'data-variant': 'treatment' },
        persistAttribute: true,
      };
      manager.watchElement(el, 'exp1', change);
      el.setAttribute('data-variant', 'treatment');

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate framework overwriting the attribute
      el.setAttribute('data-variant', 'control');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalledWith(change, 'exp1');
    });

    it('should NOT trigger reapply when persistAttribute is false', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change: DOMChange = {
        selector: '#test-el',
        type: 'attribute',
        value: { 'data-variant': 'treatment' },
        persistAttribute: false,
      };
      manager.watchElement(el, 'exp1', change);
      el.setAttribute('data-variant', 'treatment');

      await new Promise(resolve => setTimeout(resolve, 0));

      el.setAttribute('data-variant', 'control');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });

    it('should NOT trigger reapply for unrelated attribute mutations', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change: DOMChange = {
        selector: '#test-el',
        type: 'attribute',
        value: { 'data-variant': 'treatment' },
        persistAttribute: true,
      };
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Mutate a different attribute
      el.setAttribute('data-other', 'something');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });
  });

  describe('persistScript (JavaScript change persistence)', () => {
    it('should NOT trigger reapply when persistScript is undefined (opt-in, default off)', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange();
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.color = 'blue';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });

    it('should trigger reapply on style mutation when persistScript is true', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange({ persistScript: true });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.color = 'blue';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalledWith(change, 'exp1');
    });

    it('should trigger reapply on class mutation when persistScript is true', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange({ persistScript: true });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.classList.add('framework-class');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalledWith(change, 'exp1');
    });

    it('should NOT trigger reapply when persistScript is false', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange({ persistScript: false });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.color = 'blue';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });

    it('should NOT trigger reapply for non-style/class attribute mutations on javascript changes', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange({ persistScript: true });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.setAttribute('data-value', 'something');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });

    it('should NOT trigger reapply when value is not a string', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change: DOMChange = {
        selector: '#test-el',
        type: 'javascript',
        value: undefined,
        persistScript: true,
      };
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.color = 'blue';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).not.toHaveBeenCalled();
    });

    it('should handle both style and class mutations in sequence', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      const change = createJavascriptChange({ persistScript: true });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.color = 'blue';
      await new Promise(resolve => setTimeout(resolve, 50));

      el.classList.add('new-class');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalledTimes(2);
      expect(onReapply).toHaveBeenCalledWith(change, 'exp1');
    });
  });

  describe('reapply guard (prevents infinite loops)', () => {
    it('should skip mutations triggered during reapply', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      onReapply.mockImplementation(() => {
        el.style.backgroundColor = 'green';
      });

      const change = createChange({ persistStyle: true, value: { backgroundColor: 'green' } });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onReapply).toHaveBeenCalledTimes(1);
    });

    it('should recover from onReapply throwing an error', async () => {
      const el = document.createElement('div');
      el.id = 'test-el';
      container.appendChild(el);

      // First call throws, second should still work
      onReapply.mockImplementationOnce(() => {
        throw new Error('script execution failed');
      });

      const change = createChange({ persistStyle: true, value: { backgroundColor: 'green' } });
      manager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      // First mutation — triggers reapply which throws
      el.style.backgroundColor = 'red';
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onReapply).toHaveBeenCalledTimes(1);

      // Second mutation — element should NOT be stuck in reapplyingElements
      el.style.backgroundColor = 'blue';
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onReapply).toHaveBeenCalledTimes(2);
    });
  });

  describe('debug mode', () => {
    it('should not throw when debug is enabled', async () => {
      const debugManager = new DOMPersistenceManager({ onReapply, debug: true });
      const el = document.createElement('div');
      el.id = 'debug-el';
      container.appendChild(el);

      const change = createChange({ persistStyle: true });
      debugManager.watchElement(el, 'exp1', change);

      await new Promise(resolve => setTimeout(resolve, 0));

      el.style.backgroundColor = 'red';

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onReapply).toHaveBeenCalled();
      debugManager.destroy();
    });
  });
});
