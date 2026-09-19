import { afterEach, expect, it } from 'vitest';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { temporary } from '../helpers.js';
import { openStore, type SqliteStore } from '../../src/storage/sqlite-store.js';
import { IndexService } from '../../src/indexing/service.js';
import { TaskService } from '../../src/tasks/service.js';

const stores: SqliteStore[] = [];
const indexes: IndexService[] = [];
afterEach(async () => {
  for (const index of indexes.splice(0)) await index.stop();
  for (const store of stores.splice(0)) store.close();
});

function record(text: string): string {
  return JSON.stringify({ type: 'user', sessionId: 'synthetic', message: { content: text } }) + '\n';
}

it('completes a torn log after reopening without duplicating evidence or replacing manual edits', async () => {
  const dataDir = await temporary();
  const root = await temporary();
  const path = join(root, 'session.jsonl');
  const firstRecord = record('Imported observation');
  const pendingRecord = record('Completed after restart');
  const split = pendingRecord.indexOf('restart');
  await writeFile(path, firstRecord + pendingRecord.slice(0, split));
  const store = await openStore({ dataDir });
  stores.push(store);
  store.saveSource({ id: 'source', agent: 'claude', roots: [root], enabled: true, parserVersion: 'claude-jsonl-v1' });
  const index = new IndexService(store);
  indexes.push(index);
  await index.refresh('source');
  const session = store.listIndexedSessions('source')[0];
  const originalEvents = store.listEvents(session.id);
  expect(originalEvents.map(event => event.text)).toEqual(['Imported observation']);
  store.createProject('project', 'Project');
  store.bindSession(session.id, 'project', null);
  const tasks = new TaskService(store);
  const task = await tasks.create({ projectId: 'project', title: 'Manual task' });
  await tasks.attachSession(task.id, session.id, task.revision);
  const current = store.getTask(task.id)!;
  const edited = { ...current, revision: current.revision + 1, objective: { ...current.objective, text: 'Keep this human decision', origin: 'user-confirmed' as const } };
  store.saveTask(edited, current.revision);
  const revisions = store.getRevisions(task.id);
  await index.stop();
  store.close();
  stores.splice(stores.indexOf(store), 1);

  await appendFile(path, pendingRecord.slice(split));
  const reopened = await openStore({ dataDir });
  stores.push(reopened);
  const restarted = new IndexService(reopened);
  indexes.push(restarted);
  expect((await restarted.refresh('source')).state).toBe('completed');
  const events = reopened.listEvents(session.id);
  expect(events.map(event => event.text)).toEqual(['Imported observation', 'Completed after restart']);
  expect(events[0]).toEqual(originalEvents[0]);
  expect((await restarted.refresh('source')).state).toBe('completed');
  expect(reopened.listEvents(session.id)).toEqual(events);
  expect(reopened.getTask(task.id)).toEqual(edited);
  expect(reopened.getRevisions(task.id)).toEqual(revisions);
  expect(reopened.sessionIds(task.id)).toEqual([session.id]);
});

it('rolls back a failed revision write and can retry the same edit after reopening', async () => {
  const dataDir = await temporary();
  const store = await openStore({ dataDir });
  stores.push(store);
  store.createProject('project', 'Project');
  const task = await new TaskService(store).create({ projectId: 'project', title: 'Saved human edit' });
  const next = { ...task, title: 'Pending human edit', revision: task.revision + 1 };
  const fault = new Database(join(dataDir, 'threadport.sqlite'));
  try {
    // Fail after the tasks row is updated, at the revision append boundary.
    fault.exec("CREATE TRIGGER fail_revision BEFORE INSERT ON task_revisions BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
    expect(() => store.saveTask(next, task.revision)).toThrow();
    expect(store.getTask(task.id)).toEqual(task);
    expect(store.getRevisions(task.id)).toEqual([task]);
    fault.exec('DROP TRIGGER fail_revision');
  } finally {
    fault.close();
  }
  store.close();
  stores.splice(stores.indexOf(store), 1);
  const reopened = await openStore({ dataDir });
  stores.push(reopened);
  expect(reopened.getTask(task.id)).toEqual(task);
  reopened.saveTask(next, task.revision);
  expect(reopened.getTask(task.id)).toEqual(next);
  expect(reopened.getRevisions(task.id)).toEqual([next, task]);
});
