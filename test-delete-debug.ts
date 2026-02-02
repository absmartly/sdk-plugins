import { DOMChangesPluginLite } from './src/core/DOMChangesPluginLite';
import { createTreatmentTracker } from './src/__tests__/sdk-helper';
import { ExperimentData } from './src/types';

async function testDeleteViewport() {
  const experiment: ExperimentData = {
    name: 'test_delete_viewport',
    variants: [
      { variables: { __dom_changes: [] } },
      { variables: { __dom_changes: [{ selector: '.test', type: 'delete', trigger_on_view: true }] } },
    ],
  };

  const { mockContext, treatmentSpy } = createTreatmentTracker([experiment], { test_delete_viewport: 0 });
  document.body.innerHTML = '<div class="test">Original</div>';
  
  const plugin = new DOMChangesPluginLite({ context: mockContext, autoApply: true, spa: false, debug: true });
  await plugin.ready();
  
  console.log('treatmentSpy calls after ready:', treatmentSpy.mock.calls);
  console.log('Element exists:', document.querySelector('.test'));
  
  const tracker = (plugin as any).exposureTracker;
  console.log('Experiments registered:', tracker.experiments);
  console.log('Tracked elements:', tracker.trackedElements);
}

testDeleteViewport();
