import { writeFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { ControlPlaneService } from '../../src/index.js';
import { canonicalDigest, type ControlEvent } from '../../src/control-plane/contracts.js';
import { afterEach, expect, it } from 'vitest';
import { startLocalServer } from '../../src/server/app.js';
import { openStore } from '../../src/storage/sqlite-store.js';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { temporary } from '../helpers.js';
const servers:{close():Promise<void>}[]=[];afterEach(async()=>{for(const server of servers.splice(0))await server.close();});
it('exposes persisted control facts and rejects receipt integrity drift',async()=>{const dataDir=await temporary();const server=await startLocalServer({dataDir});servers.push(server);const expiresAt=new Date(Date.now()+3600000).toISOString();const headers={authorization:`Bearer ${server.token}`,'content-type':'application/json'};const store=await openStore({dataDir});const manifest=createContextManifest({handoffId:'handoff-1',taskId:'task-1',taskRevision:1,targetSessionId:'s-1',targetRunId:'r-1'});store.controlPlane().saveManifest(manifest);const saved=store.controlPlane().saveReceipt({handoffId:'handoff-1',targetSessionId:'s-1',targetRunId:'r-1',manifestDigest:manifest.digest,stage:'received',nonce:'nonce-1234567890',expiresAt});store.controlPlane().appendEvents([{eventId:'evt-1',protocol:'threadport.control-event.v1',occurredAt:null,recordedAt:'2026-09-20T00:00:00.000Z',source:{kind:'threadport',sourceId:'tp',parserVersion:null,coverage:'full'},taskId:'task-1',sessionId:'s-1',runId:'r-1',ordinal:0,type:'run.started',payload:{},idempotencyKey:null,evidenceIds:['evt-1']}]);store.close();const state=await fetch(server.origin+'/api/v1/tasks/task-1/control',{headers}).then(r=>r.json());expect(state.data.sessions['s-1'].runState).toBe('running');expect(state.data.manifests['handoff-1']).toMatchObject({digest:manifest.digest,targetSessionId:'s-1',targetRunId:'r-1'});expect(state.data.receipts[saved.receiptId]).toMatchObject({stage:'received',status:'pending'});const bad=await fetch(server.origin+'/api/v1/handoffs/handoff-1/receipts',{method:'POST',headers,body:JSON.stringify({targetSessionId:'s-1',targetRunId:'r-1',manifestDigest:'b'.repeat(64),stage:'received',nonce:'nonce-1234567890',expiresAt})});expect(bad.status).toBe(409);const forged=await fetch(server.origin+'/api/v1/handoffs/handoff-1/receipts',{method:'POST',headers,body:JSON.stringify({targetSessionId:'s-1',targetRunId:'r-1',manifestDigest:manifest.digest,stage:'verified-complete',nonce:'nonce-verified-123456',expiresAt})});expect(forged.status).toBe(409);const error=await forged.json();expect(error.error.code).toBe('RECEIPT_VERIFICATION_REQUIRED');});

it('replays maximum and malformed legacy receipt evidence through the same API, CLI and SDK state', async () => {
 const dataDir=await temporary(),server=await startLocalServer({dataDir,autoRefresh:false});
 servers.push(server);
 const call=async(path:string,body?:unknown)=>fetch(server.origin+'/api/v1'+path,{
  headers:{authorization:'Bearer '+server.token,'content-type':'application/json'},
  ...(body?{method:'POST',body:JSON.stringify(body)}:{}),
 });
 const prepared=await call('/tasks/task-shared/control/manifest',{handoffId:'handoff-shared',taskRevision:1,targetSessionId:'target-s',targetRunId:'target-r'});
 expect(prepared.status).toBe(200);
 const manifest=(await prepared.json()).data;
 const request={targetSessionId:'target-s',targetRunId:'target-r',manifestDigest:manifest.digest,stage:'received' as const,nonce:'api-nonce-123456789',expiresAt:'2099-01-01T00:00:00.000Z'};
 const saved=await call('/handoffs/handoff-shared/receipts',request);
 expect(saved.status).toBe(200);
 const receipt=(await saved.json()).data;
 const make=(eventId:string,ordinal:number,payload:ControlEvent['payload'],type='receipt.confirmed',evidenceIds:string[]=[]):ControlEvent=>({
  protocol:'threadport.control-event.v1',eventId,taskId:'task-shared',sessionId:'target-s',runId:'target-r',type,ordinal,occurredAt:null,recordedAt:'2026-11-03T00:00:00.000Z',
  idempotencyKey:null,source:{kind:'runtime',sourceId:'synthetic',coverage:'full',parserVersion:null},evidenceIds,payload,
 });
 const observation={...request,handoffId:manifest.handoffId,receiptId:'receipt-observed',nonce:'observed-nonce-123456',stage:'verified-complete'};
 const maximum=make('maximum',5,{receipt:observation},'receipt.confirmed',Array.from({length:128},(_,i)=>'evidence-'+i));
 const store=await openStore({dataDir});
 try{
  const cp=store.controlPlane();
  const proof=cp.recordReceiptAttestation({taskId:'task-shared',handoffId:manifest.handoffId,receiptId:receipt.receiptId,manifestDigest:manifest.digest,targetSessionId:'target-s',targetRunId:'target-r',stage:'verified-complete'});
  const confirmed=cp.confirmReceipt({receiptId:receipt.receiptId,stage:'verified-complete',evidenceIds:[proof]});
  const changed=createContextManifest({...manifest,taskRevision:2});
  cp.appendEvents([
   maximum,
   make('later-backwards',1,{receipt:{...observation,stage:'received',nonce:'changed-nonce-123456'}}),
   make('same-nonce-other-id',2,{receipt:{...observation,receiptId:'other-id'}}),
   make('counterfeit-overwrite',3,{receipt:{...request,handoffId:manifest.handoffId,receiptId:receipt.receiptId}}),
   make('conflicting-manifest',4,{handoffId:manifest.handoffId,manifest:changed},'manifest.saved'),
   make('receipt-using-prepared-manifest',6,{receipt:{...observation,receiptId:'receipt-pending',nonce:'pending-nonce-123456',stage:'received'}},'receipt.requested'),
  ]);
  const malformed={...maximum,eventId:'invalid-max',evidenceIds:[...maximum.evidenceIds,'one-too-many']};
  expect(()=>cp.appendEvents([malformed])).toThrow(expect.objectContaining({code:'INVALID_INPUT'}));
  const db=new Database(join(dataDir,'threadport.sqlite'));
  try{db.prepare('INSERT INTO control_events(event_id,payload_digest,event_json,recorded_at) VALUES(?,?,?,?)').run(malformed.eventId,canonicalDigest(malformed),JSON.stringify(malformed),malformed.recordedAt);}
  finally{db.close();}
  const api=await call('/tasks/task-shared/control');
  expect(api.status).toBe(200);
  const {data}=await api.json();
  let stdout='';
  const status=await runCli(['control','status','--task','task-shared','--data-dir',dataDir],{cwd:()=>dataDir,stdout:{write:text=>{stdout+=text;}},stderr:{write:()=>{}}});
  expect(status).toBe(0);
  expect(JSON.parse(stdout)).toEqual(data);
  expect(new ControlPlaneService(cp).state('task-shared')).toEqual(data);
  expect(data.manifests[manifest.handoffId]).toEqual(manifest);
  expect(data.receipts[receipt.receiptId]).toEqual(confirmed);
  expect(data.receipts['other-id']).toBeUndefined();
  expect(data.receipts['receipt-pending']).toMatchObject({stage:'received',status:'pending'});
  expect(data.receipts['receipt-observed']).toMatchObject({stage:'reported-complete',status:'unknown',nonce:observation.nonce,evidenceIds:['maximum',...maximum.evidenceIds.slice(0,127)]});
  expect(data.attention.map((item:{kind:string})=>item.kind)).toEqual(expect.arrayContaining(['invalid-stored-event','receipt-conflict','manifest-conflict']));
 }finally{store.close();}
});

it('keeps API responsibility authoritative and requires a privileged writer for lineage decisions',async()=>{
 const dataDir=await temporary(),server=await startLocalServer({dataDir,autoRefresh:false});
 servers.push(server);
 const taskId='authority-task';
 const call=async(route:string,body?:unknown)=>{
  const result=await fetch(server.origin+'/api/v1/tasks/'+taskId+route,{
   headers:{authorization:'Bearer '+server.token,'content-type':'application/json'},
   ...(body?{method:'POST',body:JSON.stringify(body)}:{}),
  });
  expect(result.status).toBe(200);
  return (await result.json()).data;
 };
 const proposal=await call('/responsibility/propose',{sessionId:'approved',roles:{executor:'approved'}});
 const responsibilityId=proposal.payload.id;
 const source={kind:'runtime' as const,sourceId:'self-declared',coverage:'full' as const,parserVersion:null};
 const event=(eventId:string,type:string,payload:ControlEvent['payload']):ControlEvent=>({
  eventId,taskId,protocol:'threadport.control-event.v1',type,payload,sessionId:'other',runId:null,
  occurredAt:null,recordedAt:'2026-11-04T00:00:00.000Z',ordinal:1,source,idempotencyKey:null,evidenceIds:[],
 });
 const forged=[
  event('forged-lineage','lineage.relation',{id:'edge',parentSessionId:'forged',childSessionId:'child',relation:'handoff',evidenceLevel:'user-confirmed',status:'confirmed'}),
  event('forged-roles','responsibility.confirmed',{id:responsibilityId,scope:'injected',roles:{reviewer:'forged',executor:'other'}}),
  event('forged-ending','responsibility.ended',{id:responsibilityId,roles:{executor:'other'}}),
 ];
 const file=join(dataDir,'events.json');
 await writeFile(file,JSON.stringify(forged));
 const importExit=await runCli(['control','ingest','--file',file,'--data-dir',dataDir],{
  cwd:()=>dataDir,stdout:{write:()=>{}},stderr:{write:()=>{}},
 });
 expect(importExit).toBe(0);
 const before=await call('/control');
 expect(before.lineage).toEqual([expect.objectContaining({status:'candidate',evidenceLevel:'inferred'})]);
 expect(before.responsibilities).toEqual([expect.objectContaining({status:'proposed'})]);
 await call('/responsibility/confirm',{responsibilityId,sessionId:'approved'});
 const store=await openStore({dataDir});
 try {
  const cp=store.controlPlane();
  const observed=event('duplicate-observation','lineage.relation',{id:'duplicate-edge',parentSessionId:'other',childSessionId:'child',relation:'handoff',evidenceLevel:'runtime-explicit'});
  cp.appendEvents([observed]);
  expect(cp.appendAuthorizedEvents([observed])).toEqual({inserted:[],duplicate:[observed.eventId]});
  cp.appendAuthorizedEvents([event('real-lineage','lineage.relation',{id:'edge',parentSessionId:'real',childSessionId:'child',relation:'handoff',evidenceLevel:'runtime-explicit',status:'confirmed'})]);
  cp.appendImportedEvents([event('later-ending','responsibility.ended',{id:responsibilityId})]);
 }finally{store.close();}
 const state=await call('/control');
 expect(state.lineage).toEqual([
  expect.objectContaining({id:'duplicate-edge',status:'candidate'}),
  expect.objectContaining({id:'edge',parentSessionId:'real',status:'confirmed',evidenceLevel:'runtime-explicit',evidenceIds:['real-lineage']}),
 ]);
 expect(state.responsibilities).toEqual([expect.objectContaining({id:responsibilityId,status:'confirmed',scope:'task',roles:{executor:'approved'}})]);
});
