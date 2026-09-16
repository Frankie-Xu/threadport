import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, restoreBackup } from '../../src/storage/database.js';
import { migrate, SCHEMA_VERSION } from '../../src/storage/migrations.js';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function dir() { const d = await mkdtemp(join(tmpdir(), 'tp-migrate-')); dirs.push(d); return d; }
it('rolls back injected migration failure and restores consistent WAL-backed user data without overwrite', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
 db.exec("CREATE TABLE manual(value TEXT); INSERT INTO manual VALUES ('中文人工数据')");
 await expect(migrate(db, dataDir, [{ version: SCHEMA_VERSION + 1, sql: "DELETE FROM manual; CREATE TABLE partial(x); SELECT * FROM nonexistent;" }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.prepare('SELECT value FROM manual').pluck().get()).toBe('中文人工数据');
 expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
 expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined(); db.close();
 const backups = (await readdir(join(dataDir, 'backups'))).sort();
 const backup = join(dataDir, 'backups', backups.find(name => name.startsWith(`v${SCHEMA_VERSION}-`))!, 'backup.sqlite');
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
 await expect(migrate(db, dataDir, [{ version: SCHEMA_VERSION + 1, sql: 'CREATE TABLE lost(x)' }])).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
 expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION); db.close();
});

it('applies sequential schema changes once and retains a pre-upgrade backup', async () => {
 const dataDir = await dir(); const db = await openDatabase({ dataDir });
 try {
  await migrate(db, dataDir, [{ version: SCHEMA_VERSION + 1, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION + 1);
  await migrate(db, dataDir, [{ version: SCHEMA_VERSION + 1, sql: 'CREATE TABLE upgraded(value TEXT)' }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='upgraded'").get()).toBeDefined();
 } finally { db.close(); }
});
it('upgrades the shipped v1 schema without losing manual data and leaves old cursors rebuildable',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 old.exec(await readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));
 old.exec("INSERT INTO projects VALUES('p','人工项目'); INSERT INTO tasks VALUES('t','p',1,'{\"manual\":true}','2026-09-14T00:00:00Z'); INSERT INTO sessions(id,metadata_json) VALUES('s','{}'); INSERT INTO task_sessions VALUES('s','t'); INSERT INTO source_cursors VALUES('s','old',5,'old'); PRAGMA user_version=1;");old.close();
 const upgraded=await openDatabase({dataDir});try{expect(upgraded.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);expect(upgraded.prepare('SELECT body_json FROM tasks').pluck().get()).toBe('{"manual":true}');expect(upgraded.prepare('SELECT task_id FROM task_sessions').pluck().get()).toBe('t');expect(upgraded.prepare('SELECT cursor_json FROM source_cursors').pluck().get()).toBeNull();}finally{upgraded.close();}
});
it('upgrades v2 completed tasks with an event baseline and preserves unknown historical associations',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 old.exec(await readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));old.exec(await readFile(new URL('../../migrations/002-index-state.sql',import.meta.url),'utf8'));
 old.exec(`INSERT INTO projects VALUES('p','Project'); INSERT INTO sessions(id,metadata_json) VALUES('s','{}');
 INSERT INTO tasks VALUES('t','p',1,'{"lifecycle":"completed"}','2026-09-14T00:00:00Z');
 INSERT INTO task_revisions VALUES('t',1,'2026-09-14T00:00:00Z','{"lifecycle":"completed"}');
 INSERT INTO task_sessions VALUES('s','t'); INSERT INTO events VALUES('e','s',0,'{}',''); PRAGMA user_version=2;`);old.close();
 const upgraded=await openDatabase({dataDir});try{
  expect(upgraded.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);
  expect(upgraded.prepare('SELECT event_id FROM completed_task_events WHERE task_id=?').pluck().get('t')).toBe('e');
  expect(upgraded.prepare('SELECT session_ids_json FROM task_revisions').pluck().get()).toBeNull();
  expect(upgraded.prepare('SELECT session_id FROM task_sessions').pluck().get()).toBe('s');
 }finally{upgraded.close();}
});
it('upgrades v3 search state transactionally and ignores unchanged projection updates',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 for(const name of ['001-initial.sql','002-index-state.sql','003-task-management.sql'])old.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
 old.exec("INSERT INTO projects VALUES('p','Original'); PRAGMA user_version=3;");old.close();
 const upgraded=await openDatabase({dataDir});try{
  expect(upgraded.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);const generation=()=>upgraded.prepare('SELECT generation FROM search_state').pluck().get();expect(generation()).toBe(0);
  upgraded.prepare('UPDATE projects SET name=? WHERE id=?').run('Original','p');expect(generation()).toBe(0);
  upgraded.exec('BEGIN');upgraded.prepare('UPDATE projects SET name=? WHERE id=?').run('Transient','p');expect(generation()).toBe(1);upgraded.exec('ROLLBACK');expect(generation()).toBe(0);
  upgraded.prepare('UPDATE projects SET name=? WHERE id=?').run('Changed','p');expect(generation()).toBe(1);
 }finally{upgraded.close();}
});

it('migrates overlapping legacy active attempts to unknown without losing reservations',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 for(const name of ['001-initial.sql','002-index-state.sql','003-task-management.sql','004-history-search.sql'])old.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
 old.exec(`INSERT INTO projects VALUES('p','Project'); INSERT INTO tasks VALUES('t','p',1,'{}','2026-09-16T00:00:00Z');
 INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES('t',1,'2026-09-16T00:00:00Z','{}');
 INSERT INTO handoffs VALUES('h','t',1,'old','2026-09-16T00:15:00Z','{"workspace":{"canonicalRoot":"/synthetic"},"approval":{"launch":{"ownerPid":1}}}','launching');
 INSERT INTO launch_attempts VALUES('one','h','launching','2026-09-16T00:00:00Z',NULL,NULL);
 INSERT INTO launch_attempts VALUES('two','h','launching','2026-09-16T00:00:00Z',NULL,NULL); PRAGMA user_version=4;`);old.close();
 const upgraded=await openDatabase({dataDir});try{
  expect(upgraded.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);
  expect(upgraded.prepare("SELECT count(*) FROM workspace_runs WHERE state='unknown' AND workspace_root='/synthetic'").pluck().get()).toBe(2);
  expect(upgraded.prepare('SELECT state FROM handoffs').pluck().get()).toBe('unknown');
 }finally{upgraded.close();}
});
it('upgrades schema 5 without changing task history and rolls back a failed assertion migration',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 for(const name of ['001-initial.sql','002-index-state.sql','003-task-management.sql','004-history-search.sql','005-launch-coordination.sql'])old.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
 old.exec(`INSERT INTO projects VALUES('p','Project'); INSERT INTO tasks VALUES('t','p',1,'{}','2026-09-16T00:00:00Z'); INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES('t',1,'2026-09-16T00:00:00Z','{}'); PRAGMA user_version=5;`);
 const sql=await readFile(new URL('../../migrations/006-assertions.sql',import.meta.url),'utf8');
 await expect(migrate(old,dataDir,[{version:6,sql:sql+'; SELECT * FROM missing_assertion_table;'}])).rejects.toMatchObject({code:'MIGRATION_FAILED'});
 expect(old.pragma('user_version',{simple:true})).toBe(5);expect(old.prepare("SELECT name FROM sqlite_master WHERE name='assertion_revisions'").get()).toBeUndefined();
 await migrate(old,dataDir);expect(old.prepare('SELECT body_json FROM task_revisions').pluck().get()).toBe('{}');
 old.exec(`INSERT INTO assertion_revisions VALUES('a','t',1,1,'{}')`);expect(()=>old.exec("UPDATE assertion_revisions SET body_json='null'")).toThrow(/immutable/);old.close();
});
