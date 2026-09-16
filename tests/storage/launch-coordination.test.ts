import { expect,it } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { fixture,authorizeTestPlan } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { recordDigest } from '../../src/storage/handoff-store.js';
import { launchPlanDigest } from '../../src/targets/review.js';
import { project } from '../helpers.js';
import { realpath } from 'node:fs/promises';

async function approved(f:Awaited<ReturnType<typeof fixture>>,workspaceId=f.input.workspaceId){
 const service=new HandoffService(f.store);const h=await service.prepareHandoff({...f.input,workspaceId});
 await service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true});
 const plan=await authorizeTestPlan(f.store,h);const digest=recordDigest(f.store.handoffStore().read(h.id).record);
 return {h,claim:()=>f.store.launchStore().claim(h.id,digest,launchPlanDigest(plan))};
}
it('blocks different handoffs for the same workspace until an observed exit releases it',async()=>{
 const f=await fixture();try{
  const one=await approved(f),two=await approved(f);const attempt=one.claim();
  expect(()=>two.claim()).toThrowError(expect.objectContaining({code:'WORKSPACE_BUSY'}));
  f.store.launchStore().finish(one.h.id,attempt,{status:'exited',exitCode:0,errorCode:null});
  const second=two.claim();expect(second).not.toBe(attempt);
  f.store.launchStore().finish(two.h.id,second,{status:'exited',exitCode:0,errorCode:null});
 }finally{f.store.close();}
},30000);
it('allows independent workspaces in the same store to run separately',async()=>{
 const f=await fixture();try{
  f.store.createWorkspace('other','p',await realpath(await project()));
  const one=await approved(f),two=await approved(f,'other');const a=one.claim(),b=two.claim();
  expect(a).not.toBe(b);
  f.store.launchStore().finish(one.h.id,a,{status:'exited',exitCode:0,errorCode:null});
  f.store.launchStore().finish(two.h.id,b,{status:'exited',exitCode:0,errorCode:null});
 }finally{f.store.close();}
},30000);
it('keeps a reused PID unknown and occupied; recovery checks the exact nonce and retains history',async()=>{
 const f=await fixture();try{
  const one=await approved(f),two=await approved(f);one.claim();
  const db=new Database(join(f.dataDir,'threadport.sqlite'));
  try{db.prepare("UPDATE workspace_runs SET owner_json=json_set(owner_json,'$.instance','different-process','$.start','different-start')").run();}finally{db.close();}
  const launches=f.store.launchStore();launches.reconcile(one.h.id);
  expect(new HandoffService(f.store).get(one.h.id).state).toBe('unknown');
  expect(()=>two.claim()).toThrowError(expect.objectContaining({code:'WORKSPACE_BUSY'}));
  expect(()=>f.store.maintenance().clearIndex()).toThrowError(expect.objectContaining({code:'STORAGE_BUSY'}));
  const run=launches.inspectRun(one.h.id)!;
  expect(()=>launches.recover(one.h.id,'wrong-nonce','I checked the target has stopped')).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}));
  launches.recover(one.h.id,run.nonce,'I checked the target has stopped');
  expect(launches.inspectRun(one.h.id)?.state).toBe('released');
  expect(new HandoffService(f.store).get(one.h.id).state).toBe('recovered');
  const next=two.claim();launches.finish(two.h.id,next,{status:'exited',exitCode:0,errorCode:null});
  const check=new Database(join(f.dataDir,'threadport.sqlite'));try{expect(check.prepare('SELECT count(*) FROM run_recoveries').pluck().get()).toBe(1);}finally{check.close();}
 }finally{f.store.close();}
},30000);
it('does not allow recovery while the recorded target is still alive',async()=>{
 const f=await fixture();try{
  const one=await approved(f);const id=one.claim();const launches=f.store.launchStore();
  launches.recordTarget(one.h.id,id,process.pid);
  launches.finish(one.h.id,id,{status:'unknown',exitCode:5,errorCode:'OBSERVER_FAILED'});
  const run=launches.inspectRun(one.h.id)!;
  expect(()=>launches.recover(one.h.id,run.nonce,'I checked the target has stopped')).toThrowError(expect.objectContaining({code:'WORKSPACE_BUSY'}));
 }finally{f.store.close();}
},30000);
