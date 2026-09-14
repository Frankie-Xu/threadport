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
 expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
 db.exec("CREATE TABLE manual(value TEXT); INSERT INTO manual VALUES ('中文人工数据')");
 await expect(migrate(db, dataDir, [{ version: 4, sql: "DELETE FROM manual; CREATE TABLE partial(x); SELECT * FROM nonexistent;" }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.prepare('SELECT value FROM manual').pluck().get()).toBe('中文人工数据');
 expect(db.pragma('user_version', { simple: true })).toBe(3);
 expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined(); db.close();
 const backups = (await readdir(join(dataDir, 'backups'))).sort();
 const backup = join(dataDir, 'backups', backups.find(name => name.startsWith('v3-'))!, 'backup.sqlite');
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
 await expect(migrate(db, dataDir, [{ version: 4, sql: 'CREATE TABLE lost(x)' }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.pragma('user_version', { simple: true })).toBe(3); db.close();
});

it('applies sequential schema changes once and retains a pre-upgrade backup', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 try {
  await migrate(db, dataDir, [{ version: 4, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.pragma('user_version', { simple: true })).toBe(4);
  await migrate(db, dataDir, [{ version: 4, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='upgraded'").get()).toBeDefined();
 } finally { db.close(); }
});
it('upgrades the shipped v1 schema without losing manual data and leaves old cursors rebuildable',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 old.exec(await readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));
 old.exec("INSERT INTO projects VALUES('p','人工项目'); INSERT INTO tasks VALUES('t','p',1,'{\"manual\":true}','2026-09-14T00:00:00Z'); INSERT INTO sessions(id,metadata_json) VALUES('s','{}'); INSERT INTO task_sessions VALUES('s','t'); INSERT INTO source_cursors VALUES('s','old',5,'old'); PRAGMA user_version=1;");old.close();
 const upgraded=await openDatabase({dataDir});try{expect(upgraded.pragma('user_version',{simple:true})).toBe(3);expect(upgraded.prepare('SELECT body_json FROM tasks').pluck().get()).toBe('{"manual":true}');expect(upgraded.prepare('SELECT task_id FROM task_sessions').pluck().get()).toBe('t');expect(upgraded.prepare('SELECT cursor_json FROM source_cursors').pluck().get()).toBeNull();}finally{upgraded.close();}
});
it('upgrades v2 completed tasks with an event baseline and preserves unknown historical associations',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 old.exec(await readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));old.exec(await readFile(new URL('../../migrations/002-index-state.sql',import.meta.url),'utf8'));
 old.exec(`INSERT INTO projects VALUES('p','Project'); INSERT INTO sessions(id,metadata_json) VALUES('s','{}');
 INSERT INTO tasks VALUES('t','p',1,'{"lifecycle":"completed"}','2026-09-14T00:00:00Z');
 INSERT INTO task_revisions VALUES('t',1,'2026-09-14T00:00:00Z','{"lifecycle":"completed"}');
 INSERT INTO task_sessions VALUES('s','t'); INSERT INTO events VALUES('e','s',0,'{}',''); PRAGMA user_version=2;`);old.close();
 const upgraded=await openDatabase({dataDir});try{
  expect(upgraded.pragma('user_version',{simple:true})).toBe(3);
  expect(upgraded.prepare('SELECT event_id FROM completed_task_events WHERE task_id=?').pluck().get('t')).toBe('e');
  expect(upgraded.prepare('SELECT session_ids_json FROM task_revisions').pluck().get()).toBeNull();
  expect(upgraded.prepare('SELECT session_id FROM task_sessions').pluck().get()).toBe('s');
 }finally{upgraded.close();}
});
