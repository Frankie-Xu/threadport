import { expect, it } from 'vitest';
import { chmod, copyFile, writeFile, open, truncate } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fixture, authorizeTestPlan } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { continueHandoff } from '../../src/targets/launch.js';
import type { TargetRunner } from '../../src/targets/contracts.js';
import { freezeLaunchPlan, launchPlanDigest, verifyLaunchPlan } from '../../src/targets/review.js';
import { temporary } from '../helpers.js';
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

const target={agent:'claude' as const,installed:true,version:'2.1.312',auth:'unknown' as const,newSessionWithContext:true,nativeResume:true,reason:null};
const handoffId='11111111-1111-4111-8111-111111111111';
const handoffDigest='a'.repeat(64);
function syntheticSpec(executable:string,cwd:string){return {executable,args:['synthetic identity inspection only'],cwd,input:{kind:'argv' as const,value:'synthetic identity inspection only'}};}

it('streams a current-sized launcher above the old 256 MiB bound and still rejects changed bytes',async()=>{
 const root=await temporary();const executable=join(root,'large-synthetic-launcher');await writeFile(executable,'synthetic');
 // Measured Claude 2.1.312 arm64 size; this sparse file is never executed.
 await truncate(executable,275988512);
 const spec=syntheticSpec(executable,root);const expires=new Date(Date.now()+60000).toISOString();
 const plan=await freezeLaunchPlan(spec,target,handoffId,handoffDigest,expires);
 expect(plan.executable.digest).toMatch(/^[a-f0-9]{64}$/);
 await expect(verifyLaunchPlan(plan,spec,target)).resolves.toBeUndefined();
 const file=await open(executable,'r+');try{await file.write(Buffer.from('changed'),0,7,260*1024*1024);}finally{await file.close();}
 await expect(verifyLaunchPlan(plan,spec,target)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
},30000);

it('keeps a finite 320 MiB launcher bound without reading an oversized target',async()=>{
 const root=await temporary();const executable=join(root,'oversized-synthetic-launcher');await writeFile(executable,'');
 await truncate(executable,320*1024*1024+1);
 await expect(freezeLaunchPlan(syntheticSpec(executable,root),target,handoffId,handoffDigest,new Date(Date.now()+60000).toISOString())).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});

it.skipIf(process.platform==='win32')('rejects a no-writer FIFO promptly without starting a target',async()=>{
 const root=await temporary();const executable=join(root,'synthetic-launcher-fifo');execFileSync('mkfifo',[executable]);
 // A regression to blocking open is released after 1.5 s so this test fails
 // on latency rather than hanging the entire test worker.
 let rescue:Promise<void>|undefined;
 const timer=setTimeout(()=>{rescue=open(executable,constants.O_WRONLY|constants.O_NONBLOCK).then(file=>file.close()).catch(()=>{});},1500);
 const started=Date.now();
 try{
  await expect(freezeLaunchPlan(syntheticSpec(executable,root),target,handoffId,handoffDigest,new Date(Date.now()+60000).toISOString())).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect(Date.now()-started).toBeLessThan(1000);
 }finally{clearTimeout(timer);await rescue;}
},10000);
