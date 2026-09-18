import { expect,it,vi } from 'vitest';
import { realpath,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git,project,temporary } from '../helpers.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { exportHandoff } from '../../src/handoff/export.js';
import { IndexService } from '../../src/indexing/service.js';
import { fixture } from './helpers.js';
import Database from 'better-sqlite3';
import { SnapshotService } from '../../src/workspace/snapshot.js';
import type { NormalizedEvent } from '../../src/domain/models.js';
it('freezes a portable complete preview, preserves manual claims and exports the exact prompt',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const handoff=await service.prepareHandoff(f.input);
 expect(handoff.protocol).toBe('threadport.task-handoff.v1');expect(handoff.taskRevision).toBe(2);expect(handoff.prompt).toContain('Do not publish');expect(handoff.prompt).toContain('Historical');expect(Buffer.byteLength(handoff.prompt)).toBeLessThanOrEqual(32768);
 expect(handoff.capsule.git.root).toBe('.');expect(JSON.stringify(handoff)).not.toContain(f.root);expect(JSON.parse(exportHandoff(handoff,'json')).prompt).toBe(handoff.prompt);expect(exportHandoff(handoff,'markdown')).toBe(handoff.prompt);
 expect(Date.parse(handoff.expiresAt)-Date.parse(handoff.createdAt)).toBe(15*60*1000);
 }finally{f.store.close();}
},30000);
it('rejects an oversized Unicode manual objective and constraints without silently truncating',async()=>{
 const f=await fixture();try{await f.tasks.update(f.taskId,2,{objective:'目标'.repeat(4000),constraints:['约束'.repeat(1000),'约束'.repeat(1000)]});await expect(new HandoffService(f.store).prepareHandoff(f.input)).rejects.toMatchObject({code:'CONTEXT_BUDGET_EXCEEDED'});}finally{f.store.close();}
},30000);

function addCommands(f: Awaited<ReturnType<typeof fixture>>, snapshots: Array<string|null>) {
 const db=new Database(join(f.dataDir,'threadport.sqlite'));
 try {
  const first=f.store.listEvents(f.input.sourceSessionId)[0];
  for(const [index,snapshotId] of snapshots.entries()){
   const ordinal=first.ordinal+index+1;const id=`command-${index}`;
   const event:NormalizedEvent={...first,id,ordinal,kind:'command',text:`Synthetic command ${index}`,commandRun:{id:`run-${index}`,sessionId:first.sessionId,ordinal,command:`npm test -- case-${index}`,cwd:null,exitCode:0,startedAt:null,completedAt:null,eventId:id,snapshotId}};
   db.prepare('INSERT INTO events(id,session_id,ordinal,body_json,search_text) VALUES(?,?,?,?,?)').run(id,event.sessionId,ordinal,JSON.stringify(event),event.text);
  }
 } finally {db.close();}
}
const promptBody=(prompt:string)=>JSON.parse(prompt.slice(prompt.indexOf('\n\n')+2));

it('keeps an earlier stale command visible when the latest command matches the workspace',async()=>{
 const f=await fixture();try{
  const before=await new SnapshotService(f.store).capture('w');
  await writeFile(join(f.root,'README.md'),'changed implementation');
  const after=await new SnapshotService(f.store).capture('w');
  addCommands(f,[before.id,after.id]);
  const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
  expect(h.verification.status).toBe('drifted');
  const evidence=promptBody(h.prompt).evidence.filter((item:{commandEvidence?:unknown})=>item.commandEvidence);
  expect(evidence[0].commandEvidence).toMatchObject({historical:{result:'succeeded',exitCode:0},applicability:'stale'});
  expect(evidence[1].commandEvidence).toMatchObject({applicability:'unknown',workspace:{status:'matched'}});
  expect(h.capsule.commands[0].summary).toContain('needs revalidation');
  expect(h.capsule.tests).toEqual([]);
  expect(h.omissions.join(' ')).toContain('1 stale');
  await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false})).rejects.toMatchObject({code:'INVALID_INPUT'});
  expect(service.get(h.id).handoff.prompt).toBe(h.prompt);
  expect(exportHandoff(h,'markdown')).toBe(h.prompt);
 }finally{f.store.close();}
},30000);

it('reports missing historical snapshots rather than substituting a later matching command',async()=>{
 const f=await fixture();try{
  const baseline=await new SnapshotService(f.store).capture('w');addCommands(f,['missing-snapshot',baseline.id,null]);
  const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
  expect(h.verification.status).toBe('unverifiable');
  const evidence=promptBody(h.prompt).evidence.filter((item:{commandEvidence?:unknown})=>item.commandEvidence);
  expect(evidence[0].commandEvidence).toMatchObject({applicability:'unknown',workspace:{status:'unverifiable',snapshotId:'missing-snapshot'}});
  expect(evidence[1].commandEvidence.workspace.status).toBe('matched');
  expect(evidence[2].commandEvidence.workspace.snapshotId).toBeNull();
  await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false})).rejects.toMatchObject({code:'INVALID_INPUT'});
 }finally{f.store.close();}
},30000);
it('exposes missing structured Agent results as explicit unknown evidence',async()=>{
 const f=await fixture();try{
  addCommands(f,[null]);
  const h=await new HandoffService(f.store).prepareHandoff(f.input);
  expect(h.innerEvidence).toHaveLength(1);
  expect(h.innerEvidence[0]).toMatchObject({eventId:'command-0',resultStatus:'unknown',applicability:'unverified',reasons:['NO_STRUCTURED_RESULT']});
  expect(promptBody(h.prompt).innerEvidence[0].applicability).toBe('unverified');
 }finally{f.store.close();}
},30000);

it('retains stale-result counts when the affected command is outside the excerpt budget',async()=>{
 const f=await fixture();try{
  const before=await new SnapshotService(f.store).capture('w');await writeFile(join(f.root,'README.md'),'new code');
  const after=await new SnapshotService(f.store).capture('w');addCommands(f,[before.id,...Array(24).fill(after.id)]);
  const h=await new HandoffService(f.store).prepareHandoff(f.input);
  expect(h.verification.status).toBe('drifted');
  expect(h.omissions.join(' ')).toContain('1 stale');
  expect(h.omissions.join(' ')).toContain('24 unknown');
  expect(h.omissions.join(' ')).toContain('older source events omitted');
  expect(promptBody(h.prompt).evidence.some((item:{id:string})=>item.id==='command-0')).toBe(false);
  expect(h.prompt).toContain('Do not publish');
  expect(Buffer.byteLength(h.prompt)).toBeLessThanOrEqual(32768);
 }finally{f.store.close();}
},30000);

it('keeps historical evidence from a different workspace unverifiable even when file content matches',async()=>{
 const f=await fixture();try{
  const linked=join(await temporary(),'linked');git(f.root,'worktree','add','--detach',linked,'HEAD');
  f.store.createWorkspace('other-binding','p',await realpath(linked));
  const other=await new SnapshotService(f.store).capture('other-binding');addCommands(f,[other.id]);
  const h=await new HandoffService(f.store).prepareHandoff(f.input);
  expect(h.verification).toMatchObject({status:'unverifiable',reasons:[{code:'WORKSPACE_UNBOUND'}]});
  const evidence=promptBody(h.prompt).evidence.find((item:{commandEvidence?:unknown})=>item.commandEvidence).commandEvidence;
  expect(evidence).toMatchObject({applicability:'unknown',workspace:{status:'unverifiable',snapshotId:other.id,reasons:['WORKSPACE_UNBOUND']}});
  expect(h.capsule.commands[0].exit_code).toBe(0);
 }finally{f.store.close();}
},30000);
it('rejects cross-project preparation and cross-agent native resume',async()=>{
 const f=await fixture();try{f.store.createProject('other','Other');f.store.createWorkspace('other','other',await realpath(await project()));const service=new HandoffService(f.store);
 await expect(service.prepareHandoff({...f.input,workspaceId:'other'})).rejects.toMatchObject({code:'PROJECT_MISMATCH'});
 await expect(service.prepareHandoff({...f.input,mode:'native-resume'})).rejects.toMatchObject({code:'INVALID_INPUT'});
 }finally{f.store.close();}
},30000);
it('drops older evidence with an explicit omission list before rejecting manual content',async()=>{
 const f=await fixture();try{
 const lines=Array.from({length:30},(_,n)=>JSON.stringify({type:'user',sessionId:'synthetic',message:{role:'user',content:`Evidence ${n}: `+'证据'.repeat(1500)}})).join('\n')+'\n';
 await writeFile(join(f.logs,'session.jsonl'),lines);const index=new IndexService(f.store);await index.refresh('s');await index.stop();
 const h=await new HandoffService(f.store).prepareHandoff(f.input);expect(Buffer.byteLength(h.prompt)).toBeLessThanOrEqual(32768);expect(h.omissions.join('\n')).toContain('older source events omitted');expect(h.omissions.join('\n')).toContain('source marked evidence incomplete');expect(h.prompt).toContain('Evidence 29');expect(h.prompt).not.toContain('Evidence 0:');expect(h.prompt).toContain('Implement the requested behavior');expect(h.prompt).toContain('Do not publish');
 }finally{f.store.close();}
},30000);

it('rejects a task revision changed while the workspace capture was in flight',async()=>{
 const f=await fixture();try{
 const save=f.store.saveSnapshot.bind(f.store);const spy=vi.spyOn(f.store,'saveSnapshot').mockImplementation((snapshot,binding)=>{
  const task=f.store.getTask(f.taskId)!;f.store.saveTask({...task,revision:task.revision+1,title:'Concurrent edit'},task.revision);save(snapshot,binding);
 });
 try{await expect(new HandoffService(f.store).prepareHandoff(f.input)).rejects.toMatchObject({code:'REVISION_CONFLICT'});}finally{spy.mockRestore();}
 expect(f.store.getTask(f.taskId)?.title).toBe('Concurrent edit');
 }finally{f.store.close();}
},30000);
