import { afterEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, restoreBackup } from '../../src/storage/database.js';
import { migrate, SCHEMA_VERSION } from '../../src/storage/migrations.js';
import { eventSearchText } from '../../src/storage/search-projection.js';
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
it('replaces legacy search projections with the canonical dirty session cache during migration',async()=>{
 const dataDir=await dir();const {readFile}=await import('node:fs/promises');const old=new Database(join(dataDir,'threadport.sqlite'));
 for(const name of ['001-initial.sql','002-index-state.sql','003-task-management.sql','004-history-search.sql','legacy-local/005-launch-coordination.sql','legacy-local/006-assertions.sql','legacy-local/007-execution-observations.sql'])old.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
 old.exec("INSERT INTO sessions(id,metadata_json) VALUES('s','{}'); INSERT INTO events VALUES('e','s',0,'{}','first'); PRAGMA user_version=7;");old.close();
 const upgraded=await openDatabase({dataDir});try{
  expect(upgraded.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);
  expect(upgraded.prepare('SELECT search_text FROM session_search WHERE session_id=?').pluck().get('s')).toBe('first');
  upgraded.prepare('UPDATE events SET search_text=? WHERE id=?').run('second','e');
  expect(upgraded.prepare('SELECT dirty FROM session_search WHERE session_id=?').pluck().get('s')).toBe(1);
  upgraded.prepare('DELETE FROM events WHERE id=?').run('e');
  upgraded.prepare('DELETE FROM sessions WHERE id=?').run('s');
  expect(upgraded.prepare('SELECT 1 FROM session_search WHERE session_id=?').get('s')).toBeUndefined();
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
 for(const name of ['001-initial.sql','002-index-state.sql','003-task-management.sql','004-history-search.sql','legacy-local/005-launch-coordination.sql'])old.exec(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8'));
 old.exec(`INSERT INTO projects VALUES('p','Project'); INSERT INTO tasks VALUES('t','p',1,'{}','2026-09-16T00:00:00Z'); INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES('t',1,'2026-09-16T00:00:00Z','{}'); PRAGMA user_version=5;`);
 const sql=await readFile(new URL('../../migrations/legacy-local/006-assertions.sql',import.meta.url),'utf8');
 await expect(migrate(old,dataDir,[{version:6,sql:sql+'; SELECT * FROM missing_assertion_table;'}])).rejects.toMatchObject({code:'MIGRATION_FAILED'});
 expect(old.pragma('user_version',{simple:true})).toBe(5);expect(old.prepare("SELECT name FROM sqlite_master WHERE name='assertion_revisions'").get()).toBeUndefined();
 await migrate(old,dataDir);expect(old.prepare('SELECT body_json FROM task_revisions').pluck().get()).toBe('{}');
 old.exec(`INSERT INTO assertion_revisions VALUES('a','t',1,1,'{}')`);expect(()=>old.exec("UPDATE assertion_revisions SET body_json='null'")).toThrow(/immutable/);old.close();
});

const commonHistory = ['001-initial.sql', '002-index-state.sql', '003-task-management.sql', '004-history-search.sql'];
const localHistory = [...commonHistory, 'legacy-local/005-launch-coordination.sql', 'legacy-local/006-assertions.sql', 'legacy-local/007-execution-observations.sql', 'legacy-local/008-search-projection.sql', 'legacy-local/009-search-event-projection.sql'];
const mainHistory = [...commonHistory, '005-control-plane.sql', '006-session-search-projection.sql'];
const canonicalHistory = [...mainHistory, '007-launch-coordination.sql', '008-assertions.sql', '009-execution-observations.sql'];
async function historicalDatabase(files: string[], version: number, crlf = false) {
 const dataDir = await dir();
 const db = new Database(join(dataDir, 'threadport.sqlite'));
 db.function('tp_search_event_v13',{deterministic:true},(body:string,existing:string)=>eventSearchText(JSON.parse(body),existing));
 const { readFile } = await import('node:fs/promises');
 for (const name of files.slice(0, version)) {
  const sql = await readFile(new URL('../../migrations/' + name, import.meta.url), 'utf8');
  db.exec(crlf ? sql.replace(/\r?\n/g, '\r\n') : sql);
 }
 db.pragma('foreign_keys=ON');
 db.pragma(`user_version=${version}`);
 db.exec(`INSERT INTO projects VALUES('p','Historical project');
 INSERT INTO sessions(id,metadata_json) VALUES('s','{}');
 INSERT INTO events VALUES('e','s',0,'{}','historical searchable evidence');
 INSERT INTO tasks VALUES('t','p',1,'{}','2026-09-16T00:00:00Z');
 INSERT INTO task_revisions(task_id,revision,changed_at,body_json) VALUES('t',1,'2026-09-16T00:00:00Z','{}');`);
 return { dataDir, db };
}

it('recognizes historical migration schemas created from Windows CRLF checkouts', async () => {
 const { dataDir, db } = await historicalDatabase(localHistory, 9, true);
 try {
  await migrate(db, dataDir);
  expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  expect(db.prepare('SELECT search_text FROM events').pluck().get()).toBe('historical searchable evidence');
 } finally { db.close(); }
});

for (const [lineage, files, versions] of [
 ['main', mainHistory, [5, 6]],
 ['local', localHistory, [5, 6, 7, 8, 9]],
 ['canonical', canonicalHistory, [7, 8, 9]],
] as const) {
 for (const version of versions) {
  it(`upgrades actual ${lineage} v${version} without relabeling or losing historical evidence`, async () => {
   const { dataDir, db } = await historicalDatabase([...files], version);
   try {
    if (lineage === 'main') db.exec("INSERT INTO control_events(event_id,payload_digest,event_json,recorded_at) VALUES('control','digest','{}','2026-09-20')");
    if (lineage === 'local' && version >= 6) db.exec("INSERT INTO assertion_revisions VALUES('assertion','t',1,1,'{}')");
    if (lineage === 'local' && version >= 7) db.exec("INSERT INTO execution_observations VALUES('observation','t','s','h','{}')");
    await migrate(db, dataDir);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT search_text FROM events WHERE id=?').pluck().get('e')).toBe('historical searchable evidence');
    expect(db.prepare('SELECT body_json FROM task_revisions').pluck().get()).toBe('{}');
    if (lineage === 'main') expect(db.prepare('SELECT event_id FROM control_events').pluck().get()).toBe('control');
    if (lineage === 'local' && version >= 6) expect(db.prepare('SELECT id FROM assertion_revisions').pluck().get()).toBe('assertion');
    if (lineage === 'local' && version >= 7) expect(db.prepare('SELECT id FROM execution_observations').pluck().get()).toBe('observation');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('search_event_projection','search_session_projection')").all()).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const backups = await readdir(join(dataDir, 'backups'));
    expect(backups).toHaveLength(1);
    const backup = new Database(join(dataDir, 'backups', backups[0]!, 'backup.sqlite'), { readonly: true });
    try { expect(backup.pragma('user_version', { simple: true })).toBe(version); }
    finally { backup.close(); }
    await migrate(db, dataDir);
    expect(await readdir(join(dataDir, 'backups'))).toHaveLength(1);
   } finally { db.close(); }
  });
 }
}

it('rejects ambiguous mixed and incomplete branch schemas before making any changes', async () => {
 const { dataDir, db } = await historicalDatabase(localHistory, 6);
 try {
  db.exec('CREATE TABLE control_events(event_id TEXT)');
  await expect(migrate(db, dataDir)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
  expect(db.pragma('user_version', { simple: true })).toBe(6);
  expect(db.prepare('SELECT count(*) FROM events').pluck().get()).toBe(1);
  db.exec('DROP TABLE control_events; DROP TRIGGER assertion_revision_immutable_update');
  await expect(migrate(db, dataDir)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
  expect(db.pragma('user_version', { simple: true })).toBe(6);
 } finally { db.close(); }
});

it('rolls back a failed real local lineage bridge and retains a restorable pre-upgrade backup', async () => {
 const { dataDir, db } = await historicalDatabase(localHistory, 5);
 try {
  // Existing out-of-band data corruption must fail validation, not erase history.
  db.pragma('foreign_keys=OFF');
  db.exec("INSERT INTO task_sessions VALUES('missing-session','t')");
  db.pragma('foreign_keys=ON');
  await expect(migrate(db, dataDir)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
  expect(db.pragma('user_version', { simple: true })).toBe(5);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='control_events'").get()).toBeUndefined();
  expect(db.prepare('SELECT session_id FROM task_sessions').pluck().get()).toBe('missing-session');
  expect(db.prepare('SELECT search_text FROM events').pluck().get()).toBe('historical searchable evidence');
  const backups = await readdir(join(dataDir, 'backups'));
  expect(backups).toHaveLength(1);
  const backup = new Database(join(dataDir, 'backups', backups[0]!, 'backup.sqlite'), { readonly: true });
  try { expect(backup.pragma('user_version', { simple: true })).toBe(5); expect(backup.pragma('integrity_check', { simple: true })).toBe('ok'); }
  finally { backup.close(); }
 } finally { db.close(); }
});

it('folds schema 10 cached text without changing original evidence or dirty state',async()=>{
 const {dataDir,db}=await historicalDatabase([...canonicalHistory,'010-unify-search-projection.sql'],10);
 try{
  const text='Before\0AfterNUL Ä 支付';
  db.prepare('UPDATE events SET search_text=? WHERE id=?').run(text,'e');
  db.prepare('UPDATE session_search SET search_text=?,dirty=0 WHERE session_id=?').run(text,'s');
  await migrate(db,dataDir);
  expect(db.prepare('SELECT search_text FROM events WHERE id=?').pluck().get('e')).toBe(text);
  expect(db.prepare('SELECT search_text,dirty FROM session_search WHERE session_id=?').get('s')).toEqual({search_text:'before\0afternul Ä 支付',dirty:0});
 }finally{db.close();}
});

it('backfills legacy command caches and scrubs control observations without changing retry or manifest digests',async()=>{
 const {dataDir,db}=await historicalDatabase([...canonicalHistory,'010-unify-search-projection.sql','011-fold-session-search.sql'],11);
 const {canonicalDigest,controlEventSchema}=await import('../../src/control-plane/contracts.js');
 const {manifestDigest,createContextManifest,assertManifestDigest}=await import('../../src/control-plane/manifest.js');
 const {openStore}=await import('../../src/storage/sqlite-store.js');
 const credential='Bearer '+'M'.repeat(24);
 const event=controlEventSchema.parse({
  eventId:'historical-control',protocol:'threadport.control-event.v1',taskId:'t',sessionId:null,runId:null,ordinal:null,occurredAt:null,recordedAt:'2026-11-03T00:00:00.000Z',
  source:{kind:'runtime',sourceId:'historical',coverage:'full',parserVersion:null},type:'attention.opened',payload:{message:'Old '+credential},idempotencyKey:credential,evidenceIds:[],
 });
 const manifest=createContextManifest({handoffId:'old-manifest',taskId:'t',taskRevision:1,constraints:[{key:'scope',text:'Synthetic safe'}]});
 const unsafe={...manifest,handoffId:'unsafe-manifest',constraints:[{...manifest.constraints[0],text:'Old '+credential}]};
 unsafe.digest=manifestDigest(unsafe);
 try{
  db.prepare('UPDATE events SET body_json=?,search_text=? WHERE id=?').run(JSON.stringify({
   text:'historical stdout',relativePaths:[],commandRun:{command:'npm run migrated-command-needle '+credential,cwd:'/private-cwd-needle'},reasoning:'private-reasoning-needle',
  }),'historical stdout','e');
  db.prepare("UPDATE session_search SET search_text='historical stdout',dirty=0 WHERE session_id='s'").run();
  db.prepare('INSERT INTO control_events(event_id,payload_digest,event_json,recorded_at,idempotency_key) VALUES(?,?,?,?,?)')
   .run(event.eventId,canonicalDigest(event),JSON.stringify(event),event.recordedAt,event.idempotencyKey);
  const save=db.prepare('INSERT INTO context_manifests VALUES(?,?,?,?,?,?)');
  for (const value of [manifest,unsafe]) save.run(value.handoffId,value.taskId,value.taskRevision,value.digest,JSON.stringify(value),value.createdAt);
  await migrate(db,dataDir);
  expect(db.prepare("SELECT search_text,dirty FROM session_search WHERE session_id='s'").get()).toMatchObject({dirty:0,search_text:expect.stringContaining('migrated-command-needle')});
  const row=db.prepare('SELECT event_json,payload_digest,idempotency_key FROM control_events').get();
  expect(row).toMatchObject({payload_digest:canonicalDigest(event)});
  expect(JSON.stringify(row)).not.toContain(credential);
 }finally{db.close();}
 const store=await openStore({dataDir});
 try{
  const matches=store.searchHistory({q:'migrated-command-needle'}).items;
  expect(matches).toHaveLength(1);
  expect(JSON.stringify(matches)).not.toMatch(/private-cwd-needle|private-reasoning-needle|Bearer MMM/);
  for(const q of ['private-cwd-needle','private-reasoning-needle','M'.repeat(24)])expect(store.searchHistory({q}).items).toEqual([]);
  const cp=store.controlPlane();
  expect(cp.appendImportedEvents([event])).toEqual({inserted:[],duplicate:[event.eventId]});
  expect(cp.projectState('t').attention[0].message).toContain('[REDACTED:bearer-token]');
  expect(cp.getManifest(unsafe.handoffId)).toBeNull();
  expect(cp.projectState('t').manifests[unsafe.handoffId]).toBeUndefined();
  expect(cp.getManifest(manifest.handoffId)).toEqual(manifest);
  expect(()=>assertManifestDigest(cp.getManifest(manifest.handoffId)!)).not.toThrow();
  expect(()=>cp.saveManifest({...unsafe,handoffId:'new-unsafe',digest:manifestDigest({...unsafe,handoffId:'new-unsafe'})})).toThrow(expect.objectContaining({code:'REDACTION_REQUIRED'}));
 }finally{store.close();}
});

it.each([11,14])('isolates malformed observations and old trust claims during the v%s WAL upgrade',async version=>{
 const files=[...canonicalHistory,'010-unify-search-projection.sql','011-fold-session-search.sql','012-receipt-attestations.sql','013-public-search-projection.sql','014-local-draft-identity.sql'];
 const {dataDir,db}=await historicalDatabase(files,version);
 const {canonicalDigest,controlEventSchema}=await import('../../src/control-plane/contracts.js');
 const {openStore}=await import('../../src/storage/sqlite-store.js');
 const credential='sk-'+'z'.repeat(27);
 const base={
  protocol:'threadport.control-event.v1',taskId:'t',sessionId:'s',runId:'r',ordinal:1,occurredAt:null,recordedAt:'2026-11-04T00:00:00.000Z',
  source:{kind:'runtime',sourceId:'self-reported',coverage:'full',parserVersion:null},idempotencyKey:null,evidenceIds:[],
 };
 const bad={...base,eventId:'bad-observation',type:'attention.opened',payload:{message:{toString:null}}};
 const good={...base,eventId:'good-observation',type:'run.started',payload:{}};
 const secret={...base,eventId:'secret-type',type:'review.'+credential,source:{...base.source,coverage:'partial'},payload:{}};
 const lineage={...base,eventId:'old-lineage',type:'lineage.relation',payload:{
  id:'old-edge',parentSessionId:'s',childSessionId:'child',relation:'handoff',evidenceLevel:'user-confirmed',status:'confirmed',
 }};
 const responsibility={...base,eventId:'old-responsibility',type:'responsibility.confirmed',payload:{id:'old-role',ownerSessionId:'s'}};
 const end={...base,eventId:'old-ending',ordinal:2,type:'responsibility.ended',payload:{id:'old-role'}};
 try{
  db.pragma('journal_mode=WAL');
  db.pragma('wal_autocheckpoint=0');
  db.exec("UPDATE task_revisions SET body_json='{\"latestWalRevision\":true}' WHERE task_id='t'");
  const insert=db.prepare('INSERT INTO control_events(event_id,payload_digest,event_json,recorded_at) VALUES(?,?,?,?)');
  for(const event of [bad,good,secret,lineage,responsibility,end])insert.run(event.eventId,canonicalDigest(event),JSON.stringify(event),event.recordedAt);
  expect((await stat(join(dataDir,'threadport.sqlite-wal'))).size).toBeGreaterThan(0);
  await migrate(db,dataDir);
  expect(db.pragma('user_version',{simple:true})).toBe(SCHEMA_VERSION);
  expect(db.prepare('SELECT count(*) FROM control_events').pluck().get()).toBe(6);
  const body=db.prepare('SELECT event_json FROM control_events WHERE event_id=?').pluck();
  expect(body.get(bad.eventId)).toBe(JSON.stringify(bad));
  expect(body.get(secret.eventId)).not.toContain(credential);
  expect(db.prepare('SELECT payload_digest FROM control_events WHERE event_id=?').pluck().get(secret.eventId)).toBe(canonicalDigest(secret));
  const [backupFolder]=await readdir(join(dataDir,'backups'));
  const backup=new Database(join(dataDir,'backups',backupFolder,'backup.sqlite'),{readonly:true});
  try{
   expect(backup.prepare("SELECT body_json FROM task_revisions WHERE task_id='t'").pluck().get()).toBe('{"latestWalRevision":true}');
   expect(backup.prepare('SELECT count(*) FROM control_events').pluck().get()).toBe(6);
  }finally{backup.close();}
 }finally{db.close();}
 const store=await openStore({dataDir});
 try{
  const cp=store.controlPlane();
  const state=cp.projectState('t');
  expect(state.sessions.s.runState).toBe('running');
  expect(state.attention).toEqual(expect.arrayContaining([expect.objectContaining({kind:'invalid-stored-event'})]));
  expect(JSON.stringify(state)).not.toContain(credential);
  expect(state.lineage).toEqual([expect.objectContaining({status:'candidate',evidenceLevel:'inferred'})]);
  expect(state.responsibilities).toEqual([expect.objectContaining({status:'proposed',confirmedAt:null})]);
  expect(cp.appendImportedEvents([controlEventSchema.parse(secret)]).duplicate).toEqual([secret.eventId]);
 }finally{store.close();}
});
