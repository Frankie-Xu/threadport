import { expect, it } from 'vitest';
import { chmod, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, authorizeTestPlan } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { continueHandoff } from '../../src/targets/launch.js';
import type { TargetRunner } from '../../src/targets/contracts.js';
import { launchPlanDigest } from '../../src/targets/review.js';
import { recordDigest } from '../../src/storage/handoff-store.js';

it.each(['argv','cwd','transport','version','executable'] as const)('rejects %s changes made during terminal approval',async change=>{
 const f=await fixture();try{
  const executable=join(f.dataDir,'target');await writeFile(executable,'#!/bin/sh\nexit 0\n');await chmod(executable,0o700);
  const h=await new HandoffService(f.store).prepareHandoff(f.input);let approved=false;let launched=false;let preparedBeforeReview=false;
  const runner:TargetRunner={agent:'codex',detect:async()=>({agent:'codex',installed:true,version:approved&&change==='version'?'changed':'synthetic',auth:'unknown',nativeResume:true,newSessionWithContext:true,reason:null}),prepare:async input=>{
   if(!approved)preparedBeforeReview=true;
   return {executable,args:[...(approved&&change==='argv'?['--dangerously-bypass-approvals-and-sandbox']:[]),input.handoff.prompt],cwd:approved&&change==='cwd'?f.dataDir:input.workspaceRoot,input:{kind:approved&&change==='transport'?'stdin':'argv',value:input.handoff.prompt}};
  }};
  await expect(continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>{expect(preparedBeforeReview).toBe(true);approved=true;if(change==='executable')await writeFile(executable,'#!/bin/sh\nexit 1\n');return true;},run:async()=>{launched=true;return {status:'exited',exitCode:0,errorCode:null};}},runner)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect(launched).toBe(false);expect(f.store.launchStore().attempts(h.id)).toHaveLength(0);
 }finally{f.store.close();}
},30000);

it('rejects another terminal replacing the grant between approval and consumption',async()=>{
 const f=await fixture();try{
  const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
  await service.confirmHandoff({id:h.id,promptDigest:h.promptDigest,acknowledgeUncertainty:true});
  const first=await authorizeTestPlan(f.store,h);const second=await authorizeTestPlan(f.store,h);
  const digest=recordDigest(f.store.handoffStore().read(h.id).record);
  expect(()=>f.store.launchStore().claim(h.id,digest,launchPlanDigest(first))).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}));
  const attempt=f.store.launchStore().claim(h.id,digest,launchPlanDigest(second));
  f.store.launchStore().finish(h.id,attempt,{status:'exited',exitCode:0,errorCode:null});
 }finally{f.store.close();}
},30000);
