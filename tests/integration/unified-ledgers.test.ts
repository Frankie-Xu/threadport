import { expect, it } from 'vitest';
import { openStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { temporary } from '../helpers.js';

it('preserves manual assertions and control manifests together across reopen and index clearing', async () => {
  const dataDir = await temporary();
  let store = await openStore({ dataDir });
  try {
    store.createProject('project', 'Unified project');
    const task = await new TaskService(store).create({ projectId: 'project', title: 'Unified task' });
    const assertion = store.assertionStore().append(task.id, task.revision, {
      kind: 'decision', topic: 'storage', text: 'Preserve both ledgers',
      scope: { workspaceId: null, path: null }, confirmed: true,
      applicability: 'applicable', supersedes: [],
    });
    const manifest = createContextManifest({ handoffId: 'unified-handoff', taskId: task.id, taskRevision: 2 });
    store.controlPlane().saveManifest(manifest);
    store.close();
    store = await openStore({ dataDir });
    store.maintenance().clearIndex();
    expect(store.assertionStore().view(task.id).entries[0]).toMatchObject({ id: assertion.id, text: 'Preserve both ledgers' });
    expect(store.controlPlane().getManifest(manifest.handoffId)).toEqual(manifest);
    expect(store.getTask(task.id)?.revision).toBe(2);
  } finally {
    store.close();
  }
});
