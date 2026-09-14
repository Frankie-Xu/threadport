import Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { cursorNativeRecords } from '../../src/adapters/cursor-native.js';

const exec = promisify(execFile);
const script = resolve('scripts/export-cursor-session.mjs');
const session = '11111111-1111-4111-8111-111111111111';
const epoch = Date.parse('2026-09-14T00:00:00Z');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const bubble = (id = 'visible') => ({ bubbleId: id, type: 1, createdAt: new Date(epoch).toISOString(), text: 'Synthetic task.' });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'threadport-cursor-export-')); roots.push(root);
  const path = join(root, 'state.vscdb'); const db = new Database(path);
  db.exec('CREATE TABLE cursorDiskKV(key TEXT PRIMARY KEY, value TEXT)');
  const put = (key: string, value: unknown) => db.prepare('INSERT OR REPLACE INTO cursorDiskKV VALUES(?,?)').run(key, JSON.stringify(value));
  const header = (ids: string[]) => put(`composerData:${session}`, { createdAt: epoch, fullConversationHeadersOnly: ids.map(bubbleId => ({ bubbleId })) });
  header(['visible']); put(`bubbleId:${session}:visible`, bubble());
  return { root, path, db, put, header };
}
async function sqliteAvailable() { try { await exec('sqlite3', ['-version']); return true; } catch { return false; } }
const hasSqlite = await sqliteAvailable();
if (process.env.THREADPORT_REQUIRE_SQLITE === '1' && !hasSqlite) {
  throw new Error('SQLite CLI is required for this verification run; install sqlite3 before running tests.');
}

it('fails without output when SQLite CLI is absent', async () => {
  const f = await fixture(); f.db.close();
  const emptyPath = join(f.root, 'empty-bin'); await mkdir(emptyPath);
  const out = join(f.root, 'missing-cli.json');
  await expect(exec(process.execPath, [script, f.path, session, out], { env: { ...process.env, PATH: emptyPath } })).rejects.toThrow();
  await expect(readFile(out)).rejects.toThrow();
});

it.skipIf(!hasSqlite)('refuses incomplete, malformed, missing-time and oversized snapshots without source mutation', async () => {
  const f = await fixture();
  try {
    for (const kind of ['missing-bubble', 'malformed', 'missing-time', 'oversized']) {
      f.header(['visible']); f.put(`bubbleId:${session}:visible`, bubble());
      if (kind === 'missing-bubble') f.header(['visible', 'absent']);
      if (kind === 'malformed') f.db.prepare('UPDATE cursorDiskKV SET value=? WHERE key=?').run('{broken', `bubbleId:${session}:visible`);
      if (kind === 'missing-time') f.put(`composerData:${session}`, { fullConversationHeadersOnly: [{ bubbleId: 'visible' }] });
      if (kind === 'oversized') f.put(`bubbleId:${session}:visible`, { ...bubble(), text: 'x'.repeat(17 * 1024 * 1024) });
      const before = createHash('sha256').update(await readFile(f.path)).digest('hex'); const out = join(f.root, `${kind}.json`);
      await expect(exec(process.execPath, [script, f.path, session, out])).rejects.toThrow();
      await expect(readFile(out)).rejects.toThrow();
      expect(createHash('sha256').update(await readFile(f.path)).digest('hex')).toBe(before);
    }
  } finally { f.db.close(); }
}, 30000);

it.skipIf(!hasSqlite)('rejects duplicate headers at conversion and refuses an invalid destination', async () => {
  const f = await fixture();
  try {
    f.header(['visible', 'visible']); const out = join(f.root, 'duplicate.json');
    await exec(process.execPath, [script, f.path, session, out]);
    const selected = JSON.parse(await readFile(out, 'utf8'));
    expect(() => cursorNativeRecords(selected)).toThrow(/Duplicate/);
    await expect(exec(process.execPath, [script, f.path, session, join(f.root, 'absent-dir', 'out.json')])).rejects.toThrow();
    await expect(readFile(join(f.root, 'absent-dir', 'out.json'))).rejects.toThrow();
  } finally { f.db.close(); }
});

it.skipIf(!hasSqlite)('reads a committed WAL snapshot while a writer holds an incomplete transaction', async () => {
  const f = await fixture();
  try {
    f.db.pragma('journal_mode = WAL');
    f.db.exec('BEGIN IMMEDIATE'); f.header(['visible', 'new']);
    const oldOut = join(f.root, 'during-write.json');
    await exec(process.execPath, [script, f.path, session, oldOut]);
    expect(JSON.parse(await readFile(oldOut, 'utf8')).bubbles.map((b: { bubbleId: string }) => b.bubbleId)).toEqual(['visible']);
    f.put(`bubbleId:${session}:new`, bubble('new')); f.db.exec('COMMIT');
    const newOut = join(f.root, 'after-commit.json');
    await exec(process.execPath, [script, f.path, session, newOut]);
    const selected = JSON.parse(await readFile(newOut, 'utf8'));
    expect(selected.bubbles.map((b: { bubbleId: string }) => b.bubbleId)).toEqual(['visible', 'new']);
    expect(cursorNativeRecords(selected)).toHaveLength(3);
    expect(f.db.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { if (f.db.inTransaction) f.db.exec('ROLLBACK'); f.db.close(); }
}, 15000);
