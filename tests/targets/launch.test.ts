import { expect,it } from 'vitest';
import { fixture } from '../handoff/helpers.js';
import { HandoffService } from '../../src/handoff/prepare.js';
import { continueHandoff } from '../../src/targets/launch.js';
import type { TargetRunner } from '../../src/targets/contracts.js';
function runner():TargetRunner{return {agent:'codex',detect:async()=>({agent:'codex',installed:true,version:'synthetic',auth:'unknown',nativeResume:true,newSessionWithContext:true,reason:null}),prepare:async input=>({executable:process.execPath,args:['-e','process.exit(0)','--',input.handoff.prompt],cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}})};}
it('requires a terminal, complete preview and explicit consent before a single launch',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);let launches=0;let shown='';const port={isTTY:true,write:(text:string)=>{shown+=text;},confirm:async()=>true,run:async()=>{launches++;return {status:'exited' as const,exitCode:0,errorCode:null};}};
 await expect(continueHandoff(f.store,h.id,{...port,isTTY:false},runner())).rejects.toMatchObject({code:'INVALID_INPUT'});
 expect(await continueHandoff(f.store,h.id,port,runner())).toBe(0);expect(shown).toContain(h.prompt);expect(launches).toBe(1);expect(new HandoffService(f.store).get(h.id).state).toBe('exited');
 await expect(continueHandoff(f.store,h.id,port,runner())).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(launches).toBe(1);
 }finally{f.store.close();}
},30000);
it('keeps a reservation unknown when the process gateway loses the outcome',async()=>{
 const f=await fixture();try{
  const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);
  await expect(continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:async()=>{throw new Error('Outcome unavailable after possible spawn');}},runner())).rejects.toMatchObject({code:'LAUNCH_STATE_UNKNOWN'});
  expect(service.get(h.id).state).toBe('unknown');expect(f.store.launchStore().inspectRun(h.id)?.state).toBe('unknown');
 }finally{f.store.close();}
},30000);
it('records terminal cancellation without launching or allowing implicit retry',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);let launched=false;
 expect(await continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>false,run:async()=>{launched=true;return {status:'exited',exitCode:0,errorCode:null};}},runner())).toBe(130);
 expect(launched).toBe(false);expect(new HandoffService(f.store).get(h.id).state).toBe('cancelled');
 }finally{f.store.close();}
},30000);
it('rechecks edits made during terminal review and refuses a runner that drops the prompt',async()=>{
 const f=await fixture();try{const service=new HandoffService(f.store);const h=await service.prepareHandoff(f.input);let launched=false;const port={isTTY:true,write:()=>{},confirm:async()=>{await f.tasks.update(f.taskId,2,{objective:'Changed while reviewing'});return true;},run:async()=>{launched=true;return {status:'exited' as const,exitCode:0,errorCode:null};}};
 await expect(continueHandoff(f.store,h.id,port,runner())).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(launched).toBe(false);
 const next=await service.prepareHandoff(f.input);const broken=runner();broken.prepare=async input=>({executable:process.execPath,args:['-e','process.exit(0)'],cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}});
 await expect(continueHandoff(f.store,next.id,{...port,confirm:async()=>true},broken)).rejects.toMatchObject({code:'INVALID_INPUT'});expect(launched).toBe(false);
 }finally{f.store.close();}
},30000);
it('reverifies workspace changes made while constructing the launch specification',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);const changed=runner();const original=changed.prepare;changed.prepare=async input=>{const {writeFile}=await import('node:fs/promises');const {join}=await import('node:path');await writeFile(join(f.root,'README.md'),'changed during capability probe');return original(input);};let launched=false;
 await expect(continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:async()=>{launched=true;return {status:'exited',exitCode:0,errorCode:null};}},changed)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(launched).toBe(false);
 }finally{f.store.close();}
},30000);
it('persists a real child failure as a failed attempt rather than task success',async()=>{
 const f=await fixture();try{const h=await new HandoffService(f.store).prepareHandoff(f.input);const failed=runner();failed.prepare=async input=>({executable:process.execPath,args:['-e','process.exit(7)','--',input.handoff.prompt],cwd:input.workspaceRoot,input:{kind:'argv',value:input.handoff.prompt}});const {runProcess}=await import('../../src/platform/process.js');
 await expect(continueHandoff(f.store,h.id,{isTTY:true,write:()=>{},confirm:async()=>true,run:(spec)=>runProcess(spec)},failed)).rejects.toMatchObject({code:'TARGET_EXITED'});const saved=new HandoffService(f.store).get(h.id);expect(saved.state).toBe('failed');expect(saved.attempts[0]).toMatchObject({errorCode:'TARGET_EXITED',targetExitCode:7});expect(f.store.getTask(f.taskId)?.lifecycle).toBe('active');
 }finally{f.store.close();}
},30000);
