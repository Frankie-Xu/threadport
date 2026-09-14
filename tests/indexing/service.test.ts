import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, appendFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openStore, type SqliteStore } from '../../src/storage/sqlite-store.js';
import { IndexService } from '../../src/indexing/service.js';
import { createSourceRegistry } from '../../src/sources/registry.js';
const dirs:string[]=[];const stores:SqliteStore[]=[];const services:IndexService[]=[];
afterEach(async()=>{for(const service of services.splice(0))await service.stop();for(const store of stores.splice(0))store.close();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const row=(text:string)=>JSON.stringify({type:'user',sessionId:'synthetic',message:{content:text}})+'\n';
async function setup(){const dir=await mkdtemp(join(tmpdir(),'tp-index-'));dirs.push(dir);const root=join(dir,'source');await mkdir(root);const path=join(root,'session.jsonl');const dataDir=join(dir,'data');const store=await openStore({dataDir});stores.push(store);store.saveSource({id:'source',agent:'claude',roots:[root],enabled:true,parserVersion:'claude-jsonl-v1'});return{dir,root,path,dataDir,store};}
it('coalesces scans, appends exactly once, rebuilds and tombstones without changing manual tasks',async()=>{
 const {store,path}=await setup();await writeFile(path,row('A')+row('B'));const service=new IndexService(store);services.push(service);
 const p=service.refresh('source');expect(service.refresh('source')).toBe(p);expect((await p).state).toBe('completed');const session=store.listIndexedSessions('source')[0];expect(store.listEvents(session.id)).toHaveLength(2);
 const claim={text:'禁止上传日志',origin:'user-confirmed' as const,evidence:[],updatedAt:null};const task={id:'task',projectId:'project',revision:1,title:'人工任务',objective:claim,constraints:[claim],nextAction:claim,lifecycle:'completed' as const,archived:true,createdAt:'2026-09-14T00:00:00Z',updatedAt:'2026-09-14T00:00:00Z'};
 store.createProject('project','项目');store.saveTask(task,0,[session.id]);
 await service.refresh('source');expect(store.listEvents(session.id)).toHaveLength(2);
 await appendFile(path,row('C')+row('D'));const snapshot=await readFile(path);await service.refresh('source');expect(store.listEvents(session.id).map(e=>e.text)).toEqual(['A','B','C','D']);expect(await readFile(path)).toEqual(snapshot);
 await writeFile(path,row('Replacement'));await service.refresh('source');expect(store.listEvents(session.id).map(e=>e.text)).toEqual(['Replacement']);expect(store.getTask('task')).toEqual(task);expect(store.sessionIds('task')).toEqual([session.id]);
 await rm(path);await service.refresh('source');expect(store.listIndexedSessions('source')[0].status).toBe('missing');expect(store.getTask('task')).toEqual(task);expect(store.sessionIds('task')).toEqual([session.id]);
});
it('rolls back events, session and cursor together on injected SQL failure, then retries',async()=>{
 const {store,path,dataDir}=await setup();await writeFile(path,JSON.stringify({type:'user',sessionId:'synthetic',message:{content:[{type:'text',text:'A'},{type:'text',text:'B'}]}})+'\n');const fault=new Database(join(dataDir,'threadport.sqlite'));
 fault.exec("CREATE TRIGGER fail_batch BEFORE INSERT ON events WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 const service=new IndexService(store);services.push(service);expect((await service.refresh('source')).state).toBe('partial');expect(store.listIndexedSessions('source')).toEqual([]);
 fault.exec('DROP TRIGGER fail_batch');fault.close();await service.refresh('source');const session=store.listIndexedSessions('source')[0];expect(store.listEvents(session.id)).toHaveLength(2);expect(store.getIndexedSession('source',session.sourcePath)?.cursor?.nextOrdinal).toBe(2);
});
it('resumes after cancellation and reopening the database without duplicate records',async()=>{
 const {store,path,dataDir}=await setup();await writeFile(path,Array.from({length:150},(_,i)=>row(String(i))).join(''));
 const service=new IndexService(store,{onProgress:p=>{if(p.events>=100)service.cancel('source');}});services.push(service);
 expect((await service.refresh('source')).state).toBe('cancelled');const session=store.listIndexedSessions('source')[0];const count=store.listEvents(session.id,1000).length;expect(count).toBeGreaterThanOrEqual(100);expect(count).toBeLessThan(150);
 await service.stop();store.close();stores.splice(stores.indexOf(store),1);const reopened=await openStore({dataDir});stores.push(reopened);const next=new IndexService(reopened);services.push(next);await next.refreshAll();expect(reopened.listEvents(session.id,1000)).toHaveLength(150);
});
it('isolates a bad source and limits simultaneous reads across queued sources to two',async()=>{
 const {store,root,path}=await setup();await writeFile(path,row('A'));for(const id of ['b','c'])store.saveSource({id,agent:'claude',roots:[root],enabled:true,parserVersion:'claude-jsonl-v1'});
 let active=0,maximum=0;
 const service=new IndexService(store,{adapterFactory:id=>{const source=createSourceRegistry([{sourceId:id,agent:'claude',roots:[root]}]).get(id)!;return {...source,async read(input){active++;maximum=Math.max(maximum,active);try{await new Promise(resolve=>setTimeout(resolve,5));if(id==='b')throw new Error('synthetic failure');return await source.read(input);}finally{active--;}}};}});services.push(service);
 const result=await service.refreshAll();expect(maximum).toBe(2);expect(result.find(x=>x.sourceId==='b')?.state).toBe('partial');expect(store.listIndexedSessions('c')).toHaveLength(1);expect(store.listIndexedSessions('source')).toHaveLength(1);
});
it('fences stale owners and recovers expired leases without allowing more than two live slots',async()=>{
 const {store,root}=await setup();for(const id of ['b','c'])store.saveSource({id,agent:'claude',roots:[root],enabled:true,parserVersion:'claude-jsonl-v1'});
 const now=Date.now();expect(store.acquireIndexLease('source','owner',now)).toBe(true);expect(store.acquireIndexLease('source','second',now)).toBe(false);expect(store.acquireIndexLease('b','b-owner',now)).toBe(true);expect(store.acquireIndexLease('c','c-owner',now)).toBe(false);
 expect(store.acquireIndexLease('source','replacement',now+31000)).toBe(true);expect(()=>store.renewIndexLease('source','owner')).toThrowError(expect.objectContaining({code:'INDEX_STALE'}));store.releaseIndexLease('source','replacement');
});
it('rejects a stale cursor before changing persisted events',async()=>{
 const {store,path,root}=await setup();await writeFile(path,row('A'));const service=new IndexService(store);services.push(service);await service.refresh('source');
 const session=store.listIndexedSessions('source')[0];const saved=store.getIndexedSession('source',session.sourcePath)!;const adapter=createSourceRegistry([{sourceId:'source',agent:'claude',roots:[root]}]).get('source')!;
 const page=await adapter.read({candidate:{sourceId:'source',agent:'claude',path:session.sourcePath},cursor:saved.cursor,maxEvents:10,signal:new AbortController().signal});
 expect(store.acquireIndexLease('source','test-owner')).toBe(true);try{expect(()=>store.commitIndexPage('source','test-owner',page,null)).toThrowError(expect.objectContaining({code:'INDEX_STALE'}));expect(store.listEvents(session.id)).toHaveLength(1);}finally{store.releaseIndexLease('source','test-owner');}
});
it('stops at the global event budget and rolls back the over-budget session and cursor',async()=>{
 const {store,path,dataDir}=await setup();await writeFile(path,row('over budget'));const seed=new Database(join(dataDir,'threadport.sqlite'));
 seed.exec("INSERT INTO sessions(id,metadata_json) VALUES('capacity','{}'); WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n<100000) INSERT INTO events(id,session_id,ordinal,body_json,search_text) SELECT 'seed-'||n,'capacity',n,'{}','' FROM numbers;");
 const service=new IndexService(store);services.push(service);const result=await service.refresh('source');expect(result.state).toBe('failed');expect(result.warnings).toContain('INDEX_LIMIT');expect(store.listIndexedSessions('source')).toEqual([]);expect(seed.prepare('SELECT count(*) FROM events').pluck().get()).toBe(100000);seed.close();
});
