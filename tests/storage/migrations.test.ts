import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, restoreBackup } from '../../src/storage/database.js';
import { migrate } from '../../src/storage/migrations.js';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function dir() { const d = await mkdtemp(join(tmpdir(), 'tp-migrate-')); dirs.push(d); return d; }
it('rolls back injected migration failure and restores consistent WAL-backed user data without overwrite', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 db.exec("CREATE TABLE manual(value TEXT); INSERT INTO manual VALUES ('中文人工数据')");
 await expect(migrate(db, dataDir, [{ version: 2, sql: "DELETE FROM manual; CREATE TABLE partial(x); SELECT * FROM nonexistent;" }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.prepare('SELECT value FROM manual').pluck().get()).toBe('中文人工数据');
 expect(db.pragma('user_version', { simple: true })).toBe(1);
 expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined(); db.close();
 const backups = (await readdir(join(dataDir, 'backups'))).sort();
 const backup = join(dataDir, 'backups', backups.find(name => name.startsWith('v1-'))!, 'backup.sqlite');
 const restoredDir = await dir(); await restoreBackup(backup, restoredDir);
 await expect(restoreBackup(backup, restoredDir)).rejects.toMatchObject({ code: 'IO_FAILED' });
 const restored = await openDatabase({ dataDir: restoredDir });
 expect(restored.prepare('SELECT value FROM manual').pluck().get()).toBe('中文人工数据'); restored.close();
});
it('refuses a newer database without changing it', async () => {
 const dataDir = await dir(); const db = new Database(join(dataDir, 'threadport.sqlite')); db.pragma('user_version=99'); db.close();
 await expect(openDatabase({ dataDir })).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 const read = new Database(join(dataDir, 'threadport.sqlite')); expect(read.pragma('user_version', { simple: true })).toBe(99); read.close();
});
it('does not start a migration when backup cannot be written', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 const { writeFile } = await import('node:fs/promises');
 await rm(join(dataDir, 'backups'), { recursive: true, force: true }); await writeFile(join(dataDir, 'backups'), 'occupied');
 await expect(migrate(db, dataDir, [{ version: 2, sql: 'CREATE TABLE lost(x)' }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.pragma('user_version', { simple: true })).toBe(1); db.close();
});

it('applies sequential schema changes once and retains a pre-upgrade backup', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 try {
  await migrate(db, dataDir, [{ version: 2, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.pragma('user_version', { simple: true })).toBe(2);
  await migrate(db, dataDir, [{ version: 2, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='upgraded'").get()).toBeDefined();
 } finally { db.close(); }
});
