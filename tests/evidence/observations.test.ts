import { expect,it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { continueHandoff } from '../../src/targets/launch.js';
import { runProcess } from '../../src/platform/process.js';
import type { TargetRunner } from '../../src/targets/contracts.js';
const runner:TargetRunner={agent:'codex',detect:async()=>({agent:'codex',installed:true,version:'synthetic',auth:'unknown',nativeResume:true,newSessionWithContext:true,reason:null}),prepare:async input=>({executable:process.execPath,args:['-e','process.exit(0)','--',input.handoff.prompt],cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}})};
it('records actual launch argv, snapshots and environment, then displays later workspace drift as stale',async()=>{
 const f=await fixture();try{
  const service=new HandoffService(f.store),h=await service.prepareHandoff(f.input);
  await continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:(spec,onSpawn)=>runProcess(spec,undefined,onSpawn)},runner);
  const [observation]=f.store.observationStore().list(f.taskId);expect(observation).toMatchObject({status:'exited',exitCode:0,testCounts:null,testScope:null,environmentBefore:{complete:false}});
  expect(observation.startedAt).toBeTruthy();expect(observation.afterSnapshotId).toBeTruthy();
  const approved=f.store.observationStore().plan(observation.id)!;expect(approved.spec.args).toEqual(['-e','process.exit(0)','--',h.prompt]);expect(approved.spec.cwd).toBe(f.root);
  await writeFile(join(f.root,'README.md'),'changed after execution');const next=await service.prepareHandoff(f.input);
  expect(next.omissions.join('\n')).toContain('1 stale');expect(next.prompt).toContain('threadport-target-process');expect(next.prompt).toContain('"testCounts": null');
  expect(()=>f.store.observationStore().finish(observation.id,{status:'exited',exitCode:0,errorCode:null},null)).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}));
 }finally{f.store.close();}
},30000);
it('preserves incomplete spawn evidence and unknown outcomes without fabricating counts',async()=>{
 const f=await fixture();try{
  const service=new HandoffService(f.store),h=await service.prepareHandoff(f.input);
  await expect(continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:async()=>{throw new Error('lost');}},runner)).rejects.toMatchObject({code:'LAUNCH_STATE_UNKNOWN'});
  const [observation]=f.store.observationStore().list(f.taskId);expect(observation).toMatchObject({status:'unknown',exitCode:null,startedAt:null,testCounts:null});
  expect((await service.prepareHandoff(f.input)).omissions.join('\n')).toContain('1 unverified');
 }finally{f.store.close();}
},30000);

it('marks a process that changed its own workspace unverified even when it exited successfully',async()=>{
 const f=await fixture();try{
  const service=new HandoffService(f.store),h=await service.prepareHandoff(f.input);
  const changing:TargetRunner={...runner,prepare:async input=>({executable:process.execPath,args:['-e',"require('node:fs').writeFileSync('README.md','changed during execution')",'--',input.handoff.prompt],cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}})};
  await continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:(spec,onSpawn)=>runProcess(spec,undefined,onSpawn)},changing);
  const next=await service.prepareHandoff(f.input);expect(next.omissions.join('\n')).toContain('1 unverified');expect(next.prompt).toContain('EXECUTION_WORKSPACE_CHANGED');
  const [observation]=f.store.observationStore().list(f.taskId);
  f.store.maintenance().prune(Date.now()+40*86400000);
  expect(f.store.getSnapshot(observation.beforeSnapshotId)).not.toBeNull();expect(f.store.getSnapshot(observation.afterSnapshotId!)).not.toBeNull();expect(f.store.observationStore().plan(observation.id)).toBeNull();
 }finally{f.store.close();}
},30000);
