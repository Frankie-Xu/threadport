import { expect,it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { continueHandoff } from '../../src/targets/launch.js';
import { runProcess } from '../../src/platform/process.js';
import type { TargetRunner } from '../../src/targets/contracts.js';
import { captureWorkspace } from '../../src/workspace/snapshot.js';
import { evaluateInnerObservation, innerObservationSchema } from '../../src/evidence/observations.js';
import { prepareInnerEvidence } from '../../src/handoff/evidence.js';
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

it('keeps absent, pending, interrupted, and partial inner results unknown-safe', async()=>{
 const f=await fixture();try{
  const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const prepared=prepareInnerEvidence([
   {eventId:'no-result',kind:'test'},
   {eventId:'pending',kind:'command',result:{protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'codex',version:'1',origin:'agent-hook'},eventId:'pending',kind:'command',command:'npm test',status:'pending',exitCode:null,startedAt:null,completedAt:null,workspace:{beforeSnapshotId:null,afterSnapshotId:null,scope:'head-tracked-diff-untracked'},environment:{scope:'agent-runtime.v1',digest:null,complete:false}}},
   {eventId:'interrupted',kind:'test',result:{protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'claude',version:'1',origin:'agent-hook'},eventId:'interrupted',kind:'test',command:null,status:'interrupted',exitCode:null,startedAt:'2026-09-18T00:00:00.000Z',completedAt:null,workspace:{beforeSnapshotId:null,afterSnapshotId:null,scope:'head-tracked-diff-untracked'},environment:{scope:'agent-runtime.v1',digest:null,complete:false}}},
   {eventId:'partial',kind:'test',result:'assistant said all tests passed'},
  ],snapshot,()=>null);
  expect([...prepared.byEvent.values()].map(value=>value.applicability)).toEqual(['unverified','unverified','unverified','unverified']);
  expect(prepared.warnings[0]).toContain('4 unverified');
 }finally{f.store.close();}
},30000);

it('classifies complete structured inner results as current, stale, or native-import unknown', async()=>{
 const f=await fixture();try{
  const before=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const current=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const complete=innerObservationSchema.parse({
   protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'codex',version:'1',origin:'agent-hook'},eventId:'structured-1',kind:'test',command:'npm test',status:'succeeded',exitCode:0,
   startedAt:'2026-09-18T00:00:00.000Z',completedAt:'2026-09-18T00:00:01.000Z',workspace:{beforeSnapshotId:before.id,afterSnapshotId:current.id,scope:'head-tracked-diff-untracked'},environment:{scope:'agent-runtime.v1',digest:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',complete:true}
  });
  expect(evaluateInnerObservation(complete,{current,before,after:current}).applicability).toBe('current');
  await writeFile(join(f.root,'README.md'),'workspace drift');
  const drifted=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  expect(evaluateInnerObservation(complete,{current:drifted,before,after:current}).applicability).toBe('stale');
  const imported=innerObservationSchema.parse({...complete,eventId:'native',source:{...complete.source,origin:'native-import'},workspace:{...complete.workspace,beforeSnapshotId:null}});
  expect(evaluateInnerObservation(imported,{current:drifted,before:null,after:null}).applicability).toBe('unknown');
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

it('rejects inner results whose event identity or kind does not match the outer event',async()=>{
 const f=await fixture();try{
  const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const result={
   protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'codex',version:'1',origin:'agent-hook'},
   eventId:'vendor-event',kind:'test' as const,command:null,status:'passed' as const,exitCode:0,
   startedAt:'2026-09-18T00:00:00.000Z',completedAt:'2026-09-18T00:00:01.000Z',
   workspace:{beforeSnapshotId:snapshot.id,afterSnapshotId:snapshot.id,scope:'head-tracked-diff-untracked' as const},
   environment:{scope:'agent-runtime.v1',digest:'a'.repeat(64),complete:true},
  };
  const prepared=prepareInnerEvidence([{eventId:'outer-event',kind:'command',result}],snapshot,id=>id===snapshot.id?snapshot:null);
  expect(prepared.byEvent.get('outer-event')).toMatchObject({applicability:'unverified',reasons:['EVENT_MISMATCH','KIND_MISMATCH'],observation:null});
  const direct=evaluateInnerObservation(innerObservationSchema.parse(result),{current:snapshot,before:snapshot,after:snapshot,eventId:'outer-event',kind:'command'});
  expect(direct).toMatchObject({eventId:'outer-event',kind:'command',applicability:'unverified',reasons:expect.arrayContaining(['EVENT_MISMATCH','KIND_MISMATCH'])});
 }finally{f.store.close();}
},30000);

it('collapses duplicate event IDs to one stable unverified record',async()=>{
 const f=await fixture();try{
  const snapshot=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const result={protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'codex',version:'1',origin:'agent-hook'},eventId:'same',kind:'test' as const,command:null,status:'unknown' as const,exitCode:null,startedAt:null,completedAt:null,workspace:{beforeSnapshotId:null,afterSnapshotId:null,scope:'head-tracked-diff-untracked' as const},environment:{scope:'agent-runtime.v1',digest:null,complete:false}};
  const prepared=prepareInnerEvidence([{eventId:'same',kind:'test',result},{eventId:'same',kind:'test',result:{...result,status:'passed',eventId:'same'}}],snapshot,()=>null);
  expect(prepared.byEvent.size).toBe(1);
  expect(prepared.byEvent.get('same')).toMatchObject({applicability:'unverified',reasons:['DUPLICATE_EVENT'],resultStatus:'unknown',observation:null});
  expect(prepared.warnings[0]).toContain('1 unverified');
 }finally{f.store.close();}
},30000);

it('never evaluates snapshots captured for a foreign workspace as current or stale',async()=>{
 const f=await fixture();try{
  const current=await captureWorkspace({id:'w',projectId:'p',canonicalRoot:f.root});
  const foreign=await captureWorkspace({id:'foreign',projectId:'other',canonicalRoot:f.root});
  const result=innerObservationSchema.parse({
   protocol:'threadport.inner-agent-observation.v1',source:{protocol:'vendor.hook.v1',agent:'codex',version:'1',origin:'agent-hook'},eventId:'foreign-event',kind:'test',command:null,status:'passed',exitCode:0,
   startedAt:'2026-09-18T00:00:00.000Z',completedAt:'2026-09-18T00:00:01.000Z',workspace:{beforeSnapshotId:foreign.id,afterSnapshotId:foreign.id,scope:'head-tracked-diff-untracked'},environment:{scope:'agent-runtime.v1',digest:'a'.repeat(64),complete:true},
  });
  const prepared=prepareInnerEvidence([{eventId:'foreign-event',kind:'test',result}],current,id=>id===foreign.id?foreign:null);
  expect(prepared.byEvent.get('foreign-event')).toMatchObject({applicability:'unknown',reasons:['SNAPSHOT_WORKSPACE_MISMATCH']});
  expect(evaluateInnerObservation(result,{current,before:foreign,after:foreign}).applicability).toBe('unknown');
 }finally{f.store.close();}
},30000);
