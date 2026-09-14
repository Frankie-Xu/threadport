import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../src/storage/sqlite-store.js';
import type { Task } from '../../src/domain/models.js';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function dir() { const d = await mkdtemp(join(tmpdir(), 'tp-store-')); dirs.push(d); return d; }
export function task(): Task {
  const claim = { text: '禁止上传日志', origin: 'user-confirmed' as const, evidence: [], updatedAt: '2026-09-14T00:00:00Z' };
  return { id: 'task', projectId: 'project', revision: 1, title: '中文任务', objective: claim, constraints: [claim], nextAction: claim, lifecycle: 'active', archived: false, createdAt: claim.updatedAt, updatedAt: claim.updatedAt };
}
describe('SQLite Store', () => {
  it('persists validated tasks, revisions and session links atomically across reopen', async () => {
    const dataDir = await dir(); let store = await openStore({ dataDir });
    try {
      store.createProject('project', '项目'); store.saveSession('session');
      store.saveTask(task(), 0, ['session']);
      expect(store.getTask('task')).toEqual(task());
      expect(() => store.saveTask({ ...task(), revision: 2, title: 'stale' }, 0, [])).toThrowError(/revision/i);
      store.saveTask({ ...task(), revision: 2, constraints: [] }, 1, []);
      expect(store.listTasks(10, 0)[0].constraints).toEqual([]);
      expect(store.getRevisions('task', 10, 0)).toHaveLength(2);
      store.close(); store = await openStore({ dataDir });
      expect(store.getTask('task')?.revision).toBe(2);
      expect(store.sessionIds('task')).toEqual([]);
      expect(() => store.deleteProject('project')).toThrow();
      expect(() => store.saveTask({ ...task(), revision: 3 }, 2, ['missing'])).toThrow();
      expect(store.getTask('task')?.revision).toBe(2);
      expect(store.getRevisions('task', 10, 0)).toHaveLength(2);
      expect(() => store.saveTask({ ...task(), revision: 3, lifecycle: 'bad' as never }, 2)).toThrow();
      if (process.platform !== 'win32') expect((await stat(join(dataDir, 'threadport.sqlite'))).mode & 0o777).toBe(0o600);
    } finally { store.close(); }
  });
  it('rejects session stealing without partial updates and retains links on session upsert', async () => {
    const store = await openStore({ dataDir: await dir() });
    try {
      store.createProject('project', '项目'); store.saveSession('session'); store.saveTask(task(), 0, ['session']);
      expect(() => store.saveTask({ ...task(), id: 'other' }, 0, ['session'])).toThrow();
      expect(store.getTask('other')).toBeNull();
      store.saveSession('session'); expect(store.sessionIds('task')).toEqual(['session']);
      expect(() => store.listTasks(1001, 0)).toThrow();
    } finally { store.close(); }
  });
});
it('bounds write lock waits and returns STORAGE_BUSY without changing rows', async () => {
  const dataDir = await dir(); const store = await openStore({ dataDir });
  const { default: Database } = await import('better-sqlite3'); const lock = new Database(join(dataDir, 'threadport.sqlite'));
  try {
    lock.exec('BEGIN IMMEDIATE'); const start = performance.now();
    expect(() => store.createProject('blocked', 'Blocked')).toThrowError(expect.objectContaining({ code: 'STORAGE_BUSY', retryable: true }));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(4500); expect(elapsed).toBeLessThan(6500);
    lock.exec('ROLLBACK'); store.createProject('blocked', 'Retry succeeds');
  } finally { if (lock.inTransaction) lock.exec('ROLLBACK'); lock.close(); store.close(); }
}, 10000);
it('uses safe platform data directory defaults and refuses a symlink database', async () => {
  const { applicationDataDir } = await import('../../src/platform/paths.js');
  const { symlink, writeFile } = await import('node:fs/promises');
  const dataDir = await dir();
  expect(applicationDataDir({ platform: 'linux', home: dataDir, env: { XDG_DATA_HOME: 'relative' } })).toBe(join(dataDir, '.local', 'share', 'threadport'));
  expect(applicationDataDir({ platform: 'darwin', home: dataDir, env: {} })).toBe(join(dataDir, 'Library', 'Application Support', 'ThreadPort'));
  expect(applicationDataDir({ platform: 'win32', env: { LOCALAPPDATA: dataDir } })).toBe(join(dataDir, 'ThreadPort'));
  const target = join(dataDir, 'outside'); await writeFile(target, 'untouched'); await symlink(target, join(dataDir, 'threadport.sqlite'));
  await expect(openStore({ dataDir })).rejects.toMatchObject({ code: 'IO_FAILED' });
});
