import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type SqliteStore } from '../../src/storage/sqlite-store.js';
import { TaskService, previewTaskPatch } from '../../src/tasks/service.js';
const dirs:string[]=[];const stores:SqliteStore[]=[];
afterEach(async()=>{for(const s of stores.splice(0))s.close();for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'tp-tasks-'));dirs.push(dir);const store=await openStore({dataDir:dir});stores.push(store);store.createProject('p','Project');return {store,service:new TaskService(store),dir};}
it('creates and edits manual claims, archives reversibly, and rejects a second stale editor',async()=>{
 const {store,service}=await setup();const task=await service.create({projectId:'p',title:'中文任务'});
 expect(task).toMatchObject({revision:1,lifecycle:'active',archived:false,objective:{origin:'unknown',text:''}});
 const edited=await service.update(task.id,1,{objective:'修复支付',constraints:['禁止修改数据库'],nextAction:'运行测试',lifecycle:'paused'});
 expect(edited.objective).toMatchObject({text:'修复支付',origin:'user-confirmed',evidence:[]});
 await expect(service.update(task.id,1,{title:'旧编辑'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 let current=await service.update(task.id,2,{lifecycle:'completed',archived:true});expect(await service.list()).toEqual([]);expect(await service.list(100,0,true)).toHaveLength(1);current=await service.update(task.id,current.revision,{archived:false,lifecycle:'active',constraints:[]});
 expect(current).toMatchObject({archived:false,lifecycle:'active',constraints:[]});expect(store.getRevisions(task.id)).toHaveLength(4);
});
it('associates exclusively, rejects cross-project links, and persists the unassigned intermediate state',async()=>{
 const {store,service,dir}=await setup();store.createProject('q','Other');store.saveSession('s');store.saveSession('foreign');store.bindSession('foreign','q',null);
 const one=await service.create({projectId:'p',title:'One',sessionId:'s'});const two=await service.create({projectId:'p',title:'Two'});
 expect(store.getSessionBinding('s')?.projectId).toBe('p');
 await expect(service.attachSession(two.id,'s',1)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await expect(service.attachSession(one.id,'foreign',1)).rejects.toMatchObject({code:'PROJECT_MISMATCH'});
 expect(store.sessionIds(one.id)).toEqual(['s']);expect(store.getTask(one.id)?.revision).toBe(1);
 await service.detachSession(one.id,'s',1);const reopened=await openStore({dataDir:dir});stores.push(reopened);
 expect(reopened.listUnassignedSessions().map(s=>s.id)).toContain('s');await new TaskService(reopened).attachSession(two.id,'s',1);
 expect(store.sessionIds(two.id)).toEqual(['s']);expect(store.revisionSessionIds(one.id,1)).toEqual(['s']);expect(store.revisionSessionIds(one.id,2)).toEqual([]);
});
it('rejects invalid fields and requires redaction preview before saving',async()=>{
 const {store,service}=await setup();const task=await service.create({projectId:'p',title:'Task'});
 for(const patch of [{title:' '},{title:'a'.repeat(121)},{objective:'x'.repeat(8001)},{constraints:['x'.repeat(2001)]},{constraints:Array(51).fill('x')},{nextAction:'x'.repeat(4001)},{revision:5}])await expect(service.update(task.id,1,patch as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
 const patch={objective:'secret=abcdefghijklmnop'};await expect(service.update(task.id,1,patch)).rejects.toMatchObject({code:'REDACTION_REQUIRED'});
 const preview=previewTaskPatch(patch);expect(preview.redactedFields).toEqual(['objective']);await service.update(task.id,1,preview.patch);
 expect(JSON.stringify(store.getRevisions(task.id))).not.toContain('abcdefghijklmnop');
 await expect(service.create({projectId:'missing',title:'Task'})).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.update('missing',1,{title:'Task'})).rejects.toMatchObject({code:'NOT_FOUND'});
});
it('preserves manual decisions through indexing and reports new evidence after completion across reopen',async()=>{
 const {store,service,dir}=await setup();const {mkdir,writeFile,appendFile}=await import('node:fs/promises');const {IndexService}=await import('../../src/indexing/service.js');
 const root=join(dir,'logs');await mkdir(root);const path=join(root,'s.jsonl');const row=(text:string)=>JSON.stringify({type:'user',sessionId:'synthetic',message:{content:text}})+'\n';
 await writeFile(path,row('机器派生目标'));store.saveSource({id:'source',agent:'claude',roots:[root],enabled:true,parserVersion:'claude-jsonl-v1'});const index=new IndexService(store);
 try{
  await index.refresh('source');const session=store.listIndexedSessions('source')[0];expect(store.listTasks()).toEqual([]);expect(store.listUnassignedSessions().map(s=>s.id)).toContain(session.id);
  let task=await service.create({projectId:'p',title:'Manual',sessionId:session.id});task=await service.update(task.id,1,{objective:'人工目标',constraints:['不要修改数据库'],lifecycle:'completed'});
  expect((await service.detail(task.id)).resolved.attention).not.toContain('ACTIVITY_AFTER_COMPLETION');
  await appendFile(path,row('新消息，无时间戳'));await index.refresh('source');const detail=await service.detail(task.id);
  expect(detail.task).toEqual(task);expect(detail.resolved.objective?.text).toBe('人工目标');expect(detail.derived.objective?.origin).toBe('derived');expect(detail.resolved.attention).toContain('ACTIVITY_AFTER_COMPLETION');
  task=await service.update(task.id,task.revision,{archived:true});const reopened=await openStore({dataDir:dir});stores.push(reopened);expect((await new TaskService(reopened).detail(task.id)).resolved.attention).toContain('ACTIVITY_AFTER_COMPLETION');
  task=await service.update(task.id,task.revision,{lifecycle:'active'});task=await service.update(task.id,task.revision,{lifecycle:'completed'});
  await index.refresh('source');expect((await service.detail(task.id)).resolved.attention).not.toContain('ACTIVITY_AFTER_COMPLETION');
  expect(store.listIndexedSessions('source')[0].projectId).toBe('p');
 }finally{await index.stop();}
});
it('allows same-project worktrees and rejects incompatible workspace or bound-project changes',async()=>{
 const {store,service}=await setup();store.createProject('q','Other');store.createWorkspace('a','p','/synthetic/a');store.createWorkspace('b','p','/synthetic/b');store.createWorkspace('c','q','/synthetic/c');
 store.saveSession('a');store.saveSession('b');store.bindSession('a','p','a');store.bindSession('b','p','b');
 const task=await service.create({projectId:'p',title:'Task',sessionId:'a'});await service.attachSession(task.id,'b',1);expect(store.sessionIds(task.id)).toEqual(['a','b']);
 expect(()=>store.bindSession('a','p','c')).toThrowError(expect.objectContaining({code:'PROJECT_MISMATCH'}));
 expect(()=>store.bindSession('a','q','c')).toThrowError(expect.objectContaining({code:'PROJECT_MISMATCH'}));
 expect(store.getSessionBinding('a')).toMatchObject({projectId:'p',workspaceId:'a'});
});
it('rolls back task, revision, binding and link changes on late SQL failure',async()=>{
 const {store,service,dir}=await setup();const {default:Database}=await import('better-sqlite3');const fault=new Database(join(dir,'threadport.sqlite'));
 try{
  store.saveSession('s');const task=await service.create({projectId:'p',title:'Task'});
  fault.exec("CREATE TRIGGER reject_link BEFORE INSERT ON task_sessions BEGIN SELECT RAISE(ABORT,'injected'); END");
  await expect(service.attachSession(task.id,'s',1)).rejects.toMatchObject({code:'IO_FAILED'});
  expect(store.getTask(task.id)).toEqual(task);expect(store.getRevisions(task.id)).toHaveLength(1);expect(store.getSessionBinding('s')?.projectId).toBeNull();expect(store.sessionIds(task.id)).toEqual([]);
  await expect(service.create({projectId:'p',title:'Failed',sessionId:'s'})).rejects.toMatchObject({code:'IO_FAILED'});expect(store.listTasks()).toHaveLength(1);
  fault.exec('DROP TRIGGER reject_link');await service.attachSession(task.id,'s',1);
 }finally{fault.close();}
});
it('accepts exact field budgets and rejects omitted or invalid mutation identities',async()=>{
 const {service}=await setup();const task=await service.create({projectId:'p',title:'中'.repeat(120)});
 const saved=await service.update(task.id,1,{objective:'中'.repeat(8000),constraints:Array(50).fill('禁'.repeat(2000)),nextAction:'步'.repeat(4000)});expect(saved.constraints).toHaveLength(50);
 await expect(service.update(task.id,0,{})).rejects.toMatchObject({code:'INVALID_INPUT'});
 await expect(service.attachSession(task.id,'missing',2)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.detachSession(task.id,'missing',2)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(service.create({projectId:'p',title:'secret=abcdefghijklmnop'})).rejects.toMatchObject({code:'REDACTION_REQUIRED'});
});
