import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { DOMManipulatorLite } from '../DOMManipulatorLite';
import {
  createTestContext,
  createTestExperiment,
  createTestSDK,
  createTreatmentTracker,
} from '../../__tests__/sdk-helper';
import { DOMChange, PluginConfig } from '../../types';

describe('DOMChangesPluginLite data-only execution policy', () => {
  let plugin: DOMChangesPluginLite | undefined;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div id="safe">Original</div>
      <div id="html">Original</div>
      <div id="javascript">Original</div>
      <div id="attribute">Original</div>
      <div id="create"></div>
      <script id="script-target"></script>
      <svg><script id="svg-script-target"></script></svg>
      <div id="move-top-level">Top level move payload</div>
      <div id="move-value">Value move payload</div>
      <div id="move-before">Safe sibling move</div>
    `;
    delete (window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted;
  });

  afterEach(() => {
    plugin?.destroy();
    plugin = undefined;
  });

  it('applies data-only changes and blocks script-capable remote configuration', async () => {
    const changes: DOMChange[] = [
      { selector: '#safe', type: 'text', value: 'Safe change applied' },
      { selector: '#html', type: 'html', value: '<img src=x onerror="alert(1)">' },
      {
        selector: '#javascript',
        type: 'javascript',
        value: 'window.remoteCodeExecuted = true; element.textContent = "Executed";',
      },
      { selector: '#attribute', type: 'attribute', value: { onclick: 'alert(1)' } },
      {
        selector: '',
        type: 'create',
        targetSelector: '#create',
        element: '<img src=x onerror="alert(1)">',
      },
      { selector: '#script-target', type: 'text', value: 'window.remoteCodeExecuted = true;' },
      { selector: '#svg-script-target', type: 'text', value: 'window.remoteCodeExecuted = true;' },
    ];
    const experiment = createTestExperiment('security-policy', [
      {
        config: {
          __dom_changes: changes,
          __inject_html: { headEnd: '<script>window.remoteCodeExecuted = true</script>' },
        },
      },
    ]);
    const context = createTestContext(createTestSDK(), { experiments: [experiment] });
    const blockedChanges: DOMChange[] = [];
    const blockedInjections: number[] = [];

    plugin = new DOMChangesPluginLite({
      context,
      spa: false,
      executionPolicy: 'data-only',
    } as PluginConfig);
    plugin.on('change_blocked', data => {
      if (data?.change) {
        blockedChanges.push(data.change);
      }
    });
    plugin.on('html_injection_blocked', data => {
      blockedInjections.push(data?.count ?? 0);
    });

    await plugin.ready();

    expect(document.querySelector('#safe')?.textContent).toBe('Safe change applied');
    expect(document.querySelector('#html')?.innerHTML).toBe('Original');
    expect(document.querySelector('#javascript')?.textContent).toBe('Original');
    expect(document.querySelector('#attribute')?.hasAttribute('onclick')).toBe(false);
    expect(document.querySelector('#create')?.children).toHaveLength(0);
    expect(document.querySelector('#script-target')?.textContent).toBe('');
    expect(document.querySelector('#svg-script-target')?.textContent).toBe('');
    expect(document.querySelector('[data-absmartly-injection]')).toBeNull();
    expect(
      (window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted
    ).toBeUndefined();
    expect(blockedChanges.map(change => change.type)).toEqual([
      'html',
      'javascript',
      'attribute',
      'create',
      'text',
      'text',
    ]);
    expect(blockedInjections).toEqual([1]);
  });

  it('blocks move destinations inside script elements while allowing sibling moves', async () => {
    const changes: DOMChange[] = [
      {
        selector: '#move-top-level',
        type: 'move',
        targetSelector: '#script-target',
        position: 'lastChild',
      },
      {
        selector: '#move-value',
        type: 'move',
        value: { targetSelector: '#svg-script-target', position: 'firstChild' },
      },
      {
        selector: '#move-before',
        type: 'move',
        targetSelector: '#script-target',
        position: 'before',
      },
    ];
    const experiment = createTestExperiment('move-policy', [
      { config: { __dom_changes: changes } },
    ]);
    const context = createTestContext(createTestSDK(), { experiments: [experiment] });
    const blockedChanges: DOMChange[] = [];

    plugin = new DOMChangesPluginLite({
      context,
      spa: false,
      executionPolicy: 'data-only',
    } as PluginConfig);
    plugin.on('change_blocked', data => {
      if (data?.change) {
        blockedChanges.push(data.change);
      }
    });
    await plugin.ready();

    expect(document.querySelector('#script-target')?.textContent).toBe('');
    expect(document.querySelector('#svg-script-target')?.textContent).toBe('');
    expect(document.querySelector('#move-top-level')?.parentElement).toBe(document.body);
    expect(document.querySelector('#move-value')?.parentElement).toBe(document.body);
    expect(document.querySelector('#script-target')?.previousElementSibling?.id).toBe(
      'move-before'
    );
    expect(blockedChanges.map(change => change.selector)).toEqual([
      '#move-top-level',
      '#move-value',
    ]);
  });

  it('blocks script-capable changes passed through the public applyChange API', async () => {
    const context = createTestContext(createTestSDK(), { experiments: [] });
    const blockedChanges: DOMChange[] = [];
    const failedChanges: DOMChange[] = [];

    plugin = new DOMChangesPluginLite({
      context,
      autoApply: false,
      executionPolicy: 'data-only',
    } as PluginConfig);
    plugin.on('change_blocked', data => {
      if (data?.change) {
        blockedChanges.push(data.change);
      }
    });
    plugin.on('change_failed', data => {
      if (data?.change) {
        failedChanges.push(data.change);
      }
    });
    await plugin.ready();

    const result = plugin.applyChange(
      {
        selector: '#javascript',
        type: 'javascript',
        value: 'window.remoteCodeExecuted = true;',
      },
      'manual-change'
    );

    expect(result).toBe(false);
    expect(
      (window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted
    ).toBeUndefined();
    expect(blockedChanges.map(change => change.type)).toEqual(['javascript']);
    expect(failedChanges).toEqual([]);
  });

  it('preserves script-capable behavior when the execution policy is omitted', async () => {
    const experiment = createTestExperiment('legacy-policy', [
      {
        config: {
          __dom_changes: [
            {
              selector: '#javascript',
              type: 'javascript',
              value: 'window.remoteCodeExecuted = true;',
            },
          ],
        },
      },
    ]);
    const context = createTestContext(createTestSDK(), { experiments: [experiment] });

    plugin = new DOMChangesPluginLite({ context });
    await plugin.ready();

    expect((window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted).toBe(true);
  });

  it('preserves compatibility with DOM manipulator plugin objects from the published API', () => {
    const legacyPlugin = {
      config: { context: { peek: () => 0 }, spa: false },
      reapplyingElements: new Set<Element>(),
    } as unknown as DOMChangesPluginLite;
    const manipulator = new DOMManipulatorLite(false, legacyPlugin);

    expect(
      manipulator.applyChange({ selector: '#safe', type: 'text', value: 'Compatible' }, 'legacy')
    ).toBe(true);
    expect(document.querySelector('#safe')?.textContent).toBe('Compatible');

    manipulator.destroy();
  });

  it('does not expose an experiment when every configured change is blocked', async () => {
    const experiment = createTestExperiment('blocked-only', [
      {
        config: {
          __dom_changes: [
            {
              selector: '#javascript',
              type: 'javascript',
              value: 'window.remoteCodeExecuted = true;',
            },
          ],
        },
      },
    ]);
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      'blocked-only': 0,
    });

    plugin = new DOMChangesPluginLite({
      context: mockContext,
      executionPolicy: 'data-only',
    } as PluginConfig);
    await plugin.ready();

    expect(treatmentSpy).not.toHaveBeenCalled();
  });

  it('applies and exposes allowed changes when an experiment also contains blocked changes', async () => {
    const experiment = createTestExperiment('mixed-policy', [
      {
        config: {
          __dom_changes: [
            { selector: '#safe', type: 'text', value: 'Allowed' },
            {
              selector: '#javascript',
              type: 'javascript',
              value: 'window.remoteCodeExecuted = true;',
            },
          ],
        },
      },
    ]);
    const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], {
      'mixed-policy': 0,
    });

    plugin = new DOMChangesPluginLite({
      context: mockContext,
      executionPolicy: 'data-only',
    } as PluginConfig);
    await plugin.ready();

    expect(document.querySelector('#safe')?.textContent).toBe('Allowed');
    expect(treatmentSpy).toHaveBeenCalledWith('mixed-policy');
    expect(treatmentSpy).toHaveBeenCalledTimes(1);
  });

  it('fails closed when JavaScript consumers provide an unknown execution policy', async () => {
    const experiment = createTestExperiment('invalid-policy', [
      {
        config: {
          __dom_changes: [
            {
              selector: '#javascript',
              type: 'javascript',
              value: 'window.remoteCodeExecuted = true;',
            },
          ],
          __inject_html: { headEnd: '<script>window.remoteCodeExecuted = true</script>' },
        },
      },
    ]);
    const context = createTestContext(createTestSDK(), { experiments: [experiment] });

    plugin = new DOMChangesPluginLite({
      context,
      executionPolicy: 'data_only',
    } as unknown as PluginConfig);
    await plugin.ready();

    expect(document.querySelector('[data-absmartly-injection]')).toBeNull();
    expect(
      (window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted
    ).toBeUndefined();
  });
});
