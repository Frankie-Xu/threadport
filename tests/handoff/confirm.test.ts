import { expect,it,vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { fixture } from './helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { exportHandoff } from '../../src/handoff/export.js';
import { sha256 } from '../../src/handoff/contracts.js';

it('confirms only the reviewed UUID command and rejects later task and workspace changes',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);const input={id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true};
 expect(await service.confirmHandoff(input)).toEqual({command:`threadport continue --handoff ${h.id}`});expect(service.get(h.id).state).toBe('confirmed');
 await f.tasks.update(f.taskId,2,{nextAction:'New manual action'});await expect(service.confirmHandoff(input)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const next=await service.prepareHandoff(f.input);await writeFile(join(f.root,'README.md'),'changed after preview');await expect(service.confirmHandoff({...input,id:next.id,promptDigest:next.promptDigest})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
},30000);
it('rejects prompt alteration, expiry and package tampering',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
 await expect(service.confirmHandoff({id:h.id,promptDigest:'0'.repeat(64),acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 expect(()=>exportHandoff({...h,prompt:h.prompt+'tampered'},'markdown')).toThrow();
 const unsafe={...h,prompt:'Read /Users/private/secret'};unsafe.promptDigest=sha256(unsafe.prompt);expect(()=>exportHandoff(unsafe,'json')).toThrow();
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(h.expiresAt));try{await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});}finally{clock.mockRestore();}
 const repository=f.store.handoffStore();const loaded=repository.read(h.id);loaded.record.handoff.expiresAt='2000-01-01T00:00:00.000Z';expect(()=>repository.assertCurrent(loaded.record)).toThrow();
 // A second connection simulates an edited persisted payload, never an authorized in-place update.
 const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare("UPDATE handoffs SET body_json=json_set(body_json,'$.handoff.target','claude') WHERE id=?").run(h.id);}finally{db.close();}
 await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
},30000);
it('requires acknowledgement for unknown manual claims and rejects branch-only changes',async()=>{
 const f=await fixture();try{const task=await f.tasks.create({projectId:'p',title:'Unknown task'});await f.tasks.detachSession(f.taskId,f.input.sourceSessionId,2);await f.tasks.attachSession(task.id,f.input.sourceSessionId,1);const service=new HandoffService(f.store);const h=await service.prepareHandoff({...f.input,taskId:task.id});const input={id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false};
 await expect(service.confirmHandoff(input)).rejects.toMatchObject({code:'INVALID_INPUT'});expect((await service.confirmHandoff({...input,acknowledgeUncertainty:true})).command).toContain(h.id);
 const {git}=await import('../helpers.js');git(f.root,'checkout','-b','another');await expect(service.confirmHandoff({...input,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
},30000);

it('allows reviewed historical drift only with acknowledgement, then rejects any new drift',async()=>{
 const f=await fixture();try{
 const {SnapshotService}=await import('../../src/workspace/snapshot.js');const baseline=await new SnapshotService(f.store).capture('w');
 const event=f.store.listEvents(f.input.sourceSessionId)[0];event.kind='command';event.commandRun={id:'run',sessionId:event.sessionId,ordinal:event.ordinal,command:'npm test',cwd:null,exitCode:0,startedAt:null,completedAt:null,eventId:event.id,snapshotId:baseline.id};
 const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare('UPDATE events SET body_json=? WHERE id=?').run(JSON.stringify(event),event.id);}finally{db.close();}
 await writeFile(join(f.root,'README.md'),'first drift');const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);expect(h.verification.status).toBe('drifted');const input={id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false};
 await expect(service.confirmHandoff(input)).rejects.toMatchObject({code:'INVALID_INPUT'});await expect(service.confirmHandoff({...input,acknowledgeUncertainty:true})).resolves.toHaveProperty('command');
 await writeFile(join(f.root,'README.md'),'second drift');await expect(service.confirmHandoff({...input,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
},30000);
it('acknowledges an explicitly incomplete historical snapshot without asserting a match',async()=>{
 const f=await fixture();try{
 const baseline={id:'incomplete',workspaceId:'w',capturedAt:new Date().toISOString(),head:null,digest:null,bindingDigest:null,algorithm:'threadport.workspace.raw.v1' as const,scope:'head-tracked-diff-untracked' as const,incompleteReasons:['READ_FAILED' as const]};f.store.saveSnapshot(baseline);
 const event=f.store.listEvents(f.input.sourceSessionId)[0];event.kind='command';event.commandRun={id:'unknown',sessionId:event.sessionId,ordinal:event.ordinal,command:'npm test',cwd:null,exitCode:null,startedAt:null,completedAt:null,eventId:event.id,snapshotId:baseline.id};
 const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare('UPDATE events SET body_json=? WHERE id=?').run(JSON.stringify(event),event.id);}finally{db.close();}
 const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);expect(h.verification.status).toBe('unverifiable');expect(h.capsule.tests).toEqual([]);const input={id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false};
 await expect(service.confirmHandoff(input)).rejects.toMatchObject({code:'INVALID_INPUT'});await expect(service.confirmHandoff({...input,acknowledgeUncertainty:true})).resolves.toHaveProperty('command');
 }finally{f.store.close();}
},30000);
it('requires partial-source acknowledgement and invalidates approval after source revocation',async()=>{
 const f=await fixture();try{const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare("UPDATE sessions SET metadata_json=json_set(metadata_json,'$.session.status','partial') WHERE id=?").run(f.input.sourceSessionId);}finally{db.close();}
 const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);const input={id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:false};expect(h.omissions.join(' ')).toContain('partial');
 await expect(service.confirmHandoff(input)).rejects.toMatchObject({code:'INVALID_INPUT'});await service.confirmHandoff({...input,acknowledgeUncertainty:true});f.store.apiStore().revokeSource('s');
 await expect(service.confirmHandoff({...input,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const unsafe={...h,prompt:'sk-proj-'+ 'a'.repeat(40)};unsafe.promptDigest=sha256(unsafe.prompt);expect(()=>exportHandoff(unsafe,'json')).toThrow();
 }finally{f.store.close();}
},30000);
it('invalidates a prepared handoff when the workspace is rebound in another connection',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
 const db=new Database(join(f.dataDir,'threadport.sqlite'));try{db.prepare('UPDATE workspaces SET canonical_root=? WHERE id=?').run(f.root+'-moved','w');}finally{db.close();}
 await expect(service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 }finally{f.store.close();}
},30000);
