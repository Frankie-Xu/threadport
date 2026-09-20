import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type SqliteStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { IndexService } from '../../src/indexing/service.js';
import { SearchService } from '../../src/search/service.js';
const stores:SqliteStore[]=[];const dirs:string[]=[];
afterEach(async()=>{for(const store of stores.splice(0))store.close();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'tp-search-'));dirs.push(dir);const store=await openStore({dataDir:join(dir,'data')});stores.push(store);
 const root=join(dir,'source');await mkdir(root);store.createProject('p','Same name');store.createProject('q','Same name');
 store.createWorkspace('wp','p','/synthetic/one/project');store.createWorkspace('wq','q','/synthetic/two/project');
 for(const [id,text,time] of [['a','支付回调 Alpha src/a/index.ts 100% a_b literal','2026-09-14T00:00:00Z'],['b','支付重试 beta','2026-09-14T00:00:00Z'],['c','unknown Alpha',null]] as const){
  const records=[{type:'user',sessionId:id,timestamp:time,message:{content:text}},{type:'assistant',sessionId:id,message:{content:[{type:'thinking',thinking:'hidden-canary-9281'},{type:'text',text:'secret=abcdefghijklmnop'}]}}];
  await writeFile(join(root,id+'.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n');
 }
 store.saveSource({id:'claude',agent:'claude',roots:[root],enabled:true,parserVersion:'claude-jsonl-v1'});const index=new IndexService(store);try{await index.refreshAll();}finally{await index.stop();}
 const sessions=store.listIndexedSessions('claude');const a=sessions.find(s=>s.vendorSessionId==='a')!;const b=sessions.find(s=>s.vendorSessionId==='b')!;
 store.bindSession(a.id,'p','wp');store.bindSession(b.id,'q','wq');const tasks=new TaskService(store);const task=await tasks.create({projectId:'p',title:'人工标题',sessionId:a.id});await tasks.update(task.id,1,{objective:'人工目标 persistence'});
 return {store,search:new SearchService(store),task,a,b,dir};
}
it('matches Chinese, English, relative paths and AND across visible event and manual fields',async()=>{
 const {search,a}=await setup();for(const q of ['支付回调','ALPHA','src/a/index.ts','人工标题','persistence 支付']){
  const result=await search.search({q,projectId:'p'});expect(result.items.map(i=>i.sessionId)).toEqual([a.id]);expect(result.items[0].matches.length).toBeGreaterThan(0);
 }
 expect((await search.search({q:'不存在'})).items).toEqual([]);
 for(const q of ['%','a_b','100%'])expect((await search.search({q})).items).toHaveLength(1);
 expect((await search.search({q:"' OR 1=1 --"})).items).toEqual([]);
 const visible=JSON.stringify(await search.search({}));expect(visible).not.toContain('abcdefghijklmnop');expect(visible).not.toContain('hidden-canary-9281');
 for(const q of ['abcdefghijklmnop','hidden-canary-9281'])expect((await search.search({q})).items).toEqual([]);
});
it('preserves filters, distinguishes same-name projects, orders unknown last and replays pages without duplication',async()=>{
 const {search,a,b}=await setup();const first=await search.search({q:'支付',limit:1});expect(first.nextCursor).not.toBeNull();
 const second=await search.search({q:'支付',limit:1,cursor:first.nextCursor!});expect(second.nextCursor).toBeNull();expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(2);
 expect(await search.search({q:'支付',limit:1,cursor:first.nextCursor!})).toEqual(second);
 expect((await search.search({projectId:'q',agent:'claude',from:'2026-09-14T00:00:00Z',to:'2026-09-14T00:00:00Z'})).items[0].sessionId).toBe(b.id);
 const all=await search.search({});expect(all.items.at(-1)?.lastActivityAt).toBeNull();expect(all.items.find(i=>i.sessionId===a.id)?.workspace?.displayPath).not.toBe(all.items.find(i=>i.sessionId===b.id)?.workspace?.displayPath);
 await expect(search.search({q:'other',cursor:first.nextCursor!})).rejects.toMatchObject({code:'INVALID_INPUT'});
});
it('rejects invalid query shapes and dates and invalidates cursors after manual changes',async()=>{
 const {search,store,task}=await setup();for(const input of [{limit:101},{limit:0},{from:'yesterday'},{from:'2026-02-30T00:00:00Z'},{from:'2026-09-15T00:00:00Z',to:'2026-09-14T00:00:00Z'},{cursor:'bad'},{q:'x'.repeat(1025)},{agent:'other'},{q:'a b c d e f g h i'},{q:'x'.repeat(129)},{sql:'x'}])await expect(search.search(input as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
 const page=await search.search({limit:1});await new TaskService(store).update(task.id,2,{title:'Changed'});
 await expect(search.search({limit:1,cursor:page.nextCursor!})).rejects.toMatchObject({code:'SEARCH_STALE'});
 const empty=await new TaskService(store).create({projectId:'p',title:'没有会话的任务'});expect((await search.search({q:'没有会话'})).items).toMatchObject([{kind:'task',sessionId:null,task:{id:empty.id}}]);
});
it('keeps keyset cursors across reopen, reads during a WAL writer, and rejects pages after commit',async()=>{
 const {search,store,dir}=await setup();const page=await search.search({limit:1});const reopened=await openStore({dataDir:join(dir,'data')});stores.push(reopened);
 expect(await new SearchService(reopened).search({limit:1,cursor:page.nextCursor!})).toEqual(await search.search({limit:1,cursor:page.nextCursor!}));
 const {default:Database}=await import('better-sqlite3');const writer=new Database(join(dir,'data','threadport.sqlite'));
 try{
  writer.exec('BEGIN IMMEDIATE');writer.prepare('UPDATE events SET search_text=?').run('new-WAL-marker');
  expect((await search.search({q:'new-WAL-marker'})).items).toEqual([]);expect((await search.search({q:'支付'})).items).toHaveLength(2);
  writer.exec('COMMIT');expect((await search.search({q:'new-WAL-marker'})).items).toHaveLength(3);
  await expect(new SearchService(store).search({limit:1,cursor:page.nextCursor!})).rejects.toMatchObject({code:'SEARCH_STALE'});
 }finally{if(writer.inTransaction)writer.exec('ROLLBACK');writer.close();}
});
it('handles fixed capacity with bounded pages and never searches private event bodies',async()=>{
 const {search,dir}=await setup();const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));
 const {seedSearchCapacity,capacityQueries}=await import('../fixtures/search-capacity.js');try{expect(seedSearchCapacity(db).events).toBe(50000);}finally{db.close();}
 for(const q of capacityQueries){const page=await search.search({q,projectId:'capacity',limit:10});expect(page.items.length).toBeLessThanOrEqual(10);for(const item of page.items)expect(item.matches.length).toBeGreaterThan(0);}
 expect((await search.search({q:'capacity-hidden-canary'})).items).toEqual([]);
 expect((await search.search({projectId:'capacity',agent:'claude'})).items).toEqual([]);expect((await search.search({projectId:'capacity',agent:'codex',limit:100})).items).toHaveLength(100);
 const ids:string[]=[];let cursor:string|undefined;do{const page=await search.search({projectId:'capacity',limit:100,cursor});ids.push(...page.items.map(i=>i.id));cursor=page.nextCursor??undefined;}while(cursor);
 expect(ids).toHaveLength(500);expect(new Set(ids).size).toBe(500);
},60000);
it('keeps a cursor valid on unchanged rescans and returns positions for distant AND terms',async()=>{
 const {store,search,dir,a}=await setup();const page=await search.search({limit:1});const index=new IndexService(store);try{await index.refreshAll();}finally{await index.stop();}
 expect((await search.search({limit:1,cursor:page.nextCursor!})).items).toHaveLength(1);
 const {default:Database}=await import('better-sqlite3');const writer=new Database(join(dir,'data','threadport.sqlite'));
 try{writer.prepare('UPDATE events SET search_text=? WHERE session_id=? AND ordinal=0').run('First '+'.'.repeat(600)+' Last',a.id);}finally{writer.close();}
 const result=await search.search({q:'first last'});expect(result.items).toHaveLength(1);const snippets=result.items[0].matches;
 expect(snippets.some(m=>m.text.includes('First'))).toBe(true);expect(snippets.some(m=>m.text.includes('Last'))).toBe(true);
 for(const m of snippets)for(const highlight of m.highlights)expect(['first','last']).toContain(m.text.slice(highlight.start,highlight.end).toLowerCase());
});
it('normalizes offset dates and keeps invalid stored activity unknown rather than repairing it',async()=>{
 const {search,dir,a}=await setup();expect((await search.search({projectId:'p',from:'2026-09-14T08:00:00+08:00',to:'2026-09-14T08:00:00+08:00'})).items[0].sessionId).toBe(a.id);
 const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));try{db.prepare('UPDATE sessions SET last_event_at=? WHERE id=?').run('2026-02-30T00:00:00Z',a.id);}finally{db.close();}
 expect((await search.search({projectId:'p'})).items[0].lastActivityAt).toBeNull();expect((await search.search({projectId:'p',from:'2026-01-01T00:00:00Z'})).items).toEqual([]);
});
it('preserves literal wildcard, slash, Unicode and NUL matching in clean and dirty projections',async()=>{
 const {search,dir,a}=await setup();const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));
 try{
  const text='prefix\0AfterNUL 100% a_b slash\\word Ä ä 支付 quote"term 🙂emoji abcd';
  db.prepare('UPDATE events SET search_text=? WHERE session_id=?').run(text,a.id);
  for(const dirty of [1,0]){
   if(dirty===0)db.prepare('UPDATE session_search SET search_text=lower(?),dirty=0 WHERE session_id=?').run(text,a.id);
   for(const q of ['AfterNUL','prefix\0After','%','a_b','slash\\word','Ä','支付','quote"term','🙂emoji','abcd'])expect((await search.search({q,projectId:'p'})).items.map(i=>i.sessionId)).toEqual([a.id]);
   for(const q of ['aZb','slashword','100anything','不存在'])expect((await search.search({q,projectId:'p'})).items).toEqual([]);
  }
 }finally{db.close();}
});
it('validates one stage timing sample per mixed benchmark search request',async()=>{
 const {validateSearchTimings}=await import('../../scripts/benchmark-validation.mjs');
 const samples=[{id:1},{id:2},{id:3}];
 expect(validateSearchTimings(samples,3)).toMatchObject({expected:3,observed:3,uniqueIds:3,duplicateIds:[],valid:true});
 expect(validateSearchTimings([...samples,{id:2}],3)).toMatchObject({observed:4,uniqueIds:3,duplicateIds:[2],valid:false});
});
it('maintains an invalidatable per-session search projection',async()=>{
 const {search,dir,a}=await setup();const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));
 try{
  const before=db.prepare('SELECT search_text,dirty FROM session_search WHERE session_id=?').get(a.id) as {search_text:string;dirty:number};
  expect(before.search_text).toContain('支付回调');expect(before.dirty).toBe(0);
  db.prepare('UPDATE events SET search_text=? WHERE session_id=? AND ordinal=0').run('projection marker',a.id);
  expect((db.prepare('SELECT dirty FROM session_search WHERE session_id=?').get(a.id) as {dirty:number}).dirty).toBe(1);
 }finally{db.close();}
 expect((await search.search({q:'projection marker',projectId:'p'})).items.map(i=>i.sessionId)).toEqual([a.id]);
 const missing=new Database(join(dir,'data','threadport.sqlite'));
 try{missing.prepare('DELETE FROM session_search WHERE session_id=?').run(a.id);}finally{missing.close();}
 expect((await search.search({q:'projection marker',projectId:'p'})).items.map(i=>i.sessionId)).toEqual([a.id]);
});
it('does not rewrite a clean projection on unchanged scans and repairs dirty or missing projections',async()=>{
 const {store,dir,a}=await setup();const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));
 const index=new IndexService(store);
 try{
  db.exec('CREATE TABLE projection_writes(session_id TEXT); CREATE TRIGGER record_projection_update AFTER UPDATE ON session_search BEGIN INSERT INTO projection_writes VALUES(new.session_id); END;');
  expect((await index.refreshAll())[0].state).toBe('completed');
  expect(db.prepare('SELECT count(*) FROM projection_writes').pluck().get()).toBe(0);
  db.prepare('UPDATE session_search SET dirty=1,search_text=? WHERE session_id=?').run('stale',a.id);
  expect((await index.refreshAll())[0].state).toBe('completed');
  expect(db.prepare('SELECT search_text,dirty FROM session_search WHERE session_id=?').get(a.id)).toMatchObject({search_text:expect.stringContaining('支付回调'),dirty:0});
  db.prepare('DELETE FROM session_search WHERE session_id=?').run(a.id);
  expect((await index.refreshAll())[0].state).toBe('completed');
  expect(db.prepare('SELECT search_text,dirty FROM session_search WHERE session_id=?').get(a.id)).toMatchObject({search_text:expect.stringContaining('支付回调'),dirty:0});
 }finally{await index.stop();db.close();}
});

it('returns only result metadata from SQLite instead of materializing full session text',async()=>{
 const {search}=await setup();const {default:Database}=await import('better-sqlite3');
 const prepare=Database.prototype.prepare;const resultRows:Record<string,unknown>[]=[];
 const spy=vi.spyOn(Database.prototype,'prepare').mockImplementation(function(this:InstanceType<typeof Database>,sql:string){
  const statement=prepare.call(this,sql);
  if(sql.startsWith('WITH documents AS')){
   const all=statement.all.bind(statement) as (...args:unknown[])=>unknown[];
   statement.all=((...args:unknown[])=>{const rows=all(...args) as Record<string,unknown>[];resultRows.push(...rows);return rows;}) as typeof statement.all;
  }
  return statement;
 });
 try{
  expect((await search.search({q:'支付'})).items).toHaveLength(2);
  expect(resultRows).toHaveLength(2);
  for(const row of resultRows){expect(row).not.toHaveProperty('sessionSearch');expect(row).not.toHaveProperty('searchDirty');}
 }finally{spy.mockRestore();}
});

it('uses trigrams only as candidates and verifies the full literal term',async()=>{
 const {search,dir,a}=await setup();const {default:Database}=await import('better-sqlite3');const db=new Database(join(dir,'data','threadport.sqlite'));
 try{
  const text='abc bcd';
  db.prepare('UPDATE events SET search_text=? WHERE session_id=?').run(text,a.id);
  db.prepare('UPDATE session_search SET search_text=?,dirty=0 WHERE session_id=?').run(text,a.id);
  expect((await search.search({q:'abcd',projectId:'p'})).items).toEqual([]);
  expect((await search.search({q:'abc',projectId:'p'})).items.map(item=>item.sessionId)).toEqual([a.id]);
 }finally{db.close();}
});
