import { DOMChangesPluginLite } from '../DOMChangesPluginLite';
import { createTestContext, createTestExperiment, createTestSDK } from '../../__tests__/sdk-helper';
import { DOMChange } from '../../types';

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

    plugin = new DOMChangesPluginLite({ context, executionPolicy: 'data-only' });
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
    expect(document.querySelector('[data-absmartly-injection]')).toBeNull();
    expect((window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted).toBeUndefined();
    expect(blockedChanges.map(change => change.type)).toEqual([
      'html',
      'javascript',
      'attribute',
      'create',
    ]);
    expect(blockedInjections).toEqual([1]);
  });

  it('blocks script-capable changes passed through the public applyChange API', async () => {
    const context = createTestContext(createTestSDK(), { experiments: [] });
    const blockedChanges: DOMChange[] = [];

    plugin = new DOMChangesPluginLite({
      context,
      autoApply: false,
      executionPolicy: 'data-only',
    });
    plugin.on('change_blocked', data => {
      if (data?.change) {
        blockedChanges.push(data.change);
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
    expect((window as Window & { remoteCodeExecuted?: boolean }).remoteCodeExecuted).toBeUndefined();
    expect(blockedChanges.map(change => change.type)).toEqual(['javascript']);
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
});
