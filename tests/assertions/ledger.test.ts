import { expect,it } from 'vitest';
import { rm } from 'node:fs/promises';
import { fixture } from '../handoff/helpers.js';
import { compileAssertions } from '../../src/assertions/compile.js';
const input={kind:'decision' as const,topic:'storage',text:'Use A',scope:{workspaceId:null,path:null},confirmed:true,applicability:'applicable' as const,supersedes:[]};
it('replaces A only through explicit confirmed B and preserves immutable history',async()=>{
 const f=await fixture();try{
  const ledger=f.store.assertionStore();const a=ledger.append(f.taskId,2,input);
  expect(()=>ledger.append(f.taskId,3,{...input,text:'Maybe B',confirmed:false,supersedes:[a.id]})).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));
  const candidate=ledger.append(f.taskId,3,{...input,text:'Maybe B',confirmed:false});
  expect(compileAssertions(ledger.view(f.taskId).entries,'w').decisions.map(e=>e.text)).toEqual(['Use A']);
  const b=ledger.append(f.taskId,4,{...input,text:'Use B',supersedes:[a.id,candidate.id]});
  const view=ledger.view(f.taskId);expect(view.history.filter(e=>e.id===a.id).map(e=>e.state)).toEqual(['confirmed','superseded']);
  expect(compileAssertions(view.entries,'w').decisions.map(e=>e.text)).toEqual(['Use B']);
  expect(()=>ledger.transition(f.taskId,5,a.id,'confirmed')).toThrow();expect(b.supersedes).toEqual([a.id,candidate.id]);
  expect(()=>ledger.append(f.taskId,4,input)).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}));
 }finally{f.store.close();}
});
it('shows conflicting confirmations without a timestamp winner; checks task and scope',async()=>{
 const f=await fixture();try{
  const ledger=f.store.assertionStore();const a=ledger.append(f.taskId,2,input);ledger.append(f.taskId,3,{...input,text:'Use B'});
  expect(compileAssertions(ledger.view(f.taskId).entries,'w').conflicts).toHaveLength(1);
  const other=await f.tasks.create({projectId:'p',title:'Other'});
  expect(()=>ledger.append(other.id,1,{...input,supersedes:[a.id]})).toThrow();
  expect(()=>ledger.append(f.taskId,4,{...input,scope:{workspaceId:'w',path:'src'},supersedes:[a.id]})).toThrow();
  expect(()=>ledger.append(f.taskId,4,{...input,scope:{workspaceId:'w',path:'../outside'}})).toThrow();
  expect(f.store.getTask(f.taskId)?.revision).toBe(4);
 }finally{f.store.close();}
});
it('retains manual revisions after indexing cache loss and marks missing provenance unavailable',async()=>{
 const f=await fixture();try{
  const event=f.store.listEvents(f.input.sourceSessionId)[0];const ledger=f.store.assertionStore();
  const a=ledger.append(f.taskId,2,{...input,source:{sessionId:event.sessionId,eventId:event.id}});
  expect(ledger.view(f.taskId).entries[0].sourceAvailability).toBe('indexed-only');
  await rm(f.logs,{recursive:true});expect(ledger.view(f.taskId).entries[0].sourceAvailability).toBe('unavailable');
  f.store.maintenance().clearIndex();expect(ledger.view(f.taskId).entries[0]).toMatchObject({id:a.id,state:'confirmed',text:'Use A',sourceAvailability:'unavailable'});
 }finally{f.store.close();}
});
it('does not let assistant candidates remove confirmed constraints and rejects reverse edges',async()=>{
 const f=await fixture();try{
  const {writeFile}=await import('node:fs/promises');const {join}=await import('node:path');const {IndexService}=await import('../../src/indexing/service.js');
  await writeFile(join(f.logs,'session.jsonl'),JSON.stringify({type:'assistant',sessionId:'synthetic',message:{role:'assistant',content:'Maybe publish now'}})+'\n');
  const index=new IndexService(f.store);await index.refresh('s');await index.stop();
  const event=f.store.listEvents(f.input.sourceSessionId)[0],ledger=f.store.assertionStore();
  const a=ledger.append(f.taskId,2,{...input,kind:'constraint',text:'Never publish'});
  expect(()=>ledger.append(f.taskId,3,{...input,kind:'constraint',confirmed:false,text:'Publish now',source:{sessionId:event.sessionId,eventId:event.id},supersedes:[a.id]})).toThrow();
  const b=ledger.append(f.taskId,3,{...input,text:'Use B',topic:'other'});
  expect(()=>ledger.append(f.taskId,4,{...input,id:a.id,supersedes:[b.id]} as never)).toThrow();
  expect(f.store.getTask(f.taskId)?.constraints.map(c=>c.text)).toContain('Do not publish');
  expect(ledger.view(f.taskId).entries.find(e=>e.id===a.id)?.state).toBe('confirmed');
 }finally{f.store.close();}
});

it('records explicit disputes across differently named topics without changing either statement',async()=>{
 const f=await fixture();try{
  const ledger=f.store.assertionStore(),a=ledger.append(f.taskId,2,input),b=ledger.append(f.taskId,3,{...input,topic:'deployment',text:'Use B'});
  expect(ledger.view(f.taskId).conflicts).toEqual([]);ledger.declareConflict(f.taskId,4,[a.id,b.id]);
  expect(ledger.view(f.taskId).conflicts[0].ids.sort()).toEqual([a.id,b.id].sort());
  ledger.transition(f.taskId,5,b.id,'rejected');expect(ledger.view(f.taskId).conflicts).toEqual([]);
 }finally{f.store.close();}
});
