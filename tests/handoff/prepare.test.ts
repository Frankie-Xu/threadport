import { expect,it,vi } from 'vitest';
import { realpath,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project,temporary } from '../helpers.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { TaskService } from '../../src/tasks/service.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { exportHandoff } from '../../src/handoff/export.js';
import { IndexService } from '../../src/indexing/service.js';
import { fixture } from './helpers.js';
it('freezes a portable complete preview, preserves manual claims and exports the exact prompt',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const handoff=await service.prepareHandoff(f.input);
 expect(handoff.protocol).toBe('threadport.task-handoff.v1');expect(handoff.taskRevision).toBe(2);expect(handoff.prompt).toContain('Do not publish');expect(handoff.prompt).toContain('Historical');expect(Buffer.byteLength(handoff.prompt)).toBeLessThanOrEqual(32768);
 expect(handoff.capsule.git.root).toBe('.');expect(JSON.stringify(handoff)).not.toContain(f.root);expect(JSON.parse(exportHandoff(handoff,'json')).prompt).toBe(handoff.prompt);expect(exportHandoff(handoff,'markdown')).toBe(handoff.prompt);
 expect(Date.parse(handoff.expiresAt)-Date.parse(handoff.createdAt)).toBe(15*60*1000);
 }finally{f.store.close();}
},30000);
it('rejects an oversized Unicode manual objective and constraints without silently truncating',async()=>{
 const f=await fixture();try{await f.tasks.update(f.taskId,2,{objective:'目标'.repeat(4000),constraints:['约束'.repeat(1000),'约束'.repeat(1000)]});await expect(new HandoffService(f.store).prepareHandoff(f.input)).rejects.toMatchObject({code:'INVALID_INPUT'});}finally{f.store.close();}
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
