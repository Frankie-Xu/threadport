import { expect, it } from 'vitest';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';
import { temporary } from './helpers.js';
import { openStore } from '../src/storage/sqlite-store.js';
import { createContextManifest } from '../src/control-plane/manifest.js';

async function cli(args:string[],cwd:string){
 let stdout='',stderr='';const code=await runCli(args,{cwd:()=>cwd,stdout:{write:value=>{stdout+=value;}},stderr:{write:value=>{stderr+=value;}}});
 return{code,stdout,stderr};
}
const event={eventId:'cli-event',protocol:'threadport.control-event.v1',occurredAt:null,recordedAt:'2026-10-25T00:00:00.000Z',source:{kind:'threadport',sourceId:'test',parserVersion:null,coverage:'full'},taskId:'task',sessionId:'session',runId:'run',ordinal:0,type:'run.started',payload:{},idempotencyKey:null,evidenceIds:[]};
const receiptArgs=['--id','handoff','--target-session','session','--target-run','run','--manifest-digest','a'.repeat(64),'--stage','received','--nonce','cli-nonce-1234567890','--expires-at','2030-01-01T00:00:00.000Z'];
it('strictly parses takeover requests and acknowledgements before changing responsibility',async()=>{
 const cwd=await temporary(),request=['request','--run','cli-run','--task','task','--owner','session','--target','session'];
 for(const args of [[],['unknown'],request.slice(0,-1),[...request,'--run','different'],[...request,'--unknown','x'],request.map(value=>value==='cli-run'?'bad/id':value),['acknowledge','--id','missing','--successor'],['acknowledge','--id','missing','--successor','valid','--successor','other']]){
  const result=await cli(['takeover',...args],cwd);expect(result.code).toBe(2);expect(result.stdout).toBe('');
 }
 const valid=await cli(['takeover',...request],cwd);expect(valid.code).toBe(0);
 const record=JSON.parse(valid.stdout);expect(record).toMatchObject({status:'stop-unavailable',ownerSessionId:'session'});
 expect((await cli(['takeover','acknowledge','--id',record.id,'--successor','next'],cwd)).code).toBe(4);
 expect((await cli(['takeover','acknowledge','--id','missing','--successor','next'],cwd)).code).toBe(2);
 expect(await readdir(cwd)).toEqual([]);
});

it('preflights receipt options and schema fields before creating storage',async()=>{
 const cwd=await temporary();
 for(const args of [[],receiptArgs.slice(0,-1),[...receiptArgs,'--id','other'],[...receiptArgs,'--unknown','x'],receiptArgs.map(value=>value==='received'?'invalid':value),receiptArgs.map(value=>value==='cli-nonce-1234567890'?'short':value)]){
  const result=await cli(['handoff','receipt',...args,'--data-dir',join(cwd,'data')],cwd);
  expect(result.code).toBe(2);expect(result.stdout).toBe('');expect(await readdir(cwd)).toEqual([]);
 }
});
it('retains receipt idempotency and distinguishes input errors from receipt conflicts',async()=>{
 const cwd=await temporary(),data=join(cwd,'data');const store=await openStore({dataDir:data});
 const manifest=createContextManifest({handoffId:'handoff',taskId:'task',taskRevision:1,targetSessionId:'session',targetRunId:'run'});
 try{store.controlPlane().saveManifest(manifest);}finally{store.close();}
 const args=receiptArgs.map(value=>value==='a'.repeat(64)?manifest.digest:value);
 const first=await cli(['handoff','receipt',...args,'--data-dir',data],cwd);
 const repeat=await cli(['handoff','receipt',...args,'--data-dir',data],cwd);
 expect(first.code).toBe(0);expect(repeat.stdout).toBe(first.stdout);
 expect((await cli(['handoff','receipt',...args.map(value=>value==='received'?'verified-complete':value),'--data-dir',data],cwd)).code).toBe(4);
 expect((await cli(['handoff','receipt',...args.map(value=>value===manifest.digest?'b'.repeat(64):value),'--data-dir',data],cwd)).code).toBe(4);
 expect((await cli(['handoff','receipt',...args.map(value=>value==='handoff'?'missing':value),'--data-dir',data],cwd)).code).toBe(2);
});

it('rejects invalid control arguments before creating a data directory',async()=>{
 const cwd=await temporary();
 for(const args of [[],['unknown'],['status'],['status','--task','task','--task','other'],['status','--task','task','--unknown','x'],['status','--task','--other'],['status','--task','bad/id'],['ingest','--file'],['ingest','extra']]){
  const result=await cli(['control',...args,'--data-dir',join(cwd,'data')],cwd);
  expect(result.code).toBe(2);expect(result.stdout).toBe('');expect(await readdir(cwd)).toEqual([]);
 }
});
it('validates bounded UTF-8 imports before opening storage, then ingests and reads valid events',async()=>{
 const cwd=await temporary(),file=join(cwd,'events.json'),data=join(cwd,'data');
 for(const text of ['{','[]',JSON.stringify({...event,unexpected:true}),' '.repeat(1024*1024+1)]){
  await writeFile(file,text);expect((await cli(['control','ingest','--file',file,'--data-dir',data],cwd)).code).toBe(2);
  expect(await readdir(cwd)).toEqual(['events.json']);
 }
 await writeFile(file,Buffer.from([0xff]));expect((await cli(['control','ingest','--file',file,'--data-dir',data],cwd)).code).toBe(2);
 await writeFile(file,JSON.stringify(event));expect((await cli(['control','ingest','--file',file,'--data-dir',data],cwd)).code).toBe(0);
 const result=await cli(['control','status','--task','task','--data-dir',data],cwd);
 expect(result.code).toBe(0);expect(JSON.parse(result.stdout).sessions.session.runState).toBe('running');
});

it.each(['source-log','runtime','threadport','user'] as const)('does not confirm %s receipt claims from manual files or old event rows',async kind=>{
 const cwd=await temporary(),data=join(cwd,'data'),file=join(cwd,'events.json');
 const manifest=createContextManifest({handoffId:'handoff',taskId:'task',taskRevision:1,targetSessionId:'session',targetRunId:'run'});
 const source={...event.source,kind};
 const imported=[
  {...event,eventId:'untrusted-manifest',source,type:'manifest.saved',payload:{handoffId:manifest.handoffId,manifest}},
  {...event,eventId:'untrusted-verification',ordinal:1,source,type:'receipt.verification',payload:{handoffId:manifest.handoffId}},
  {...event,eventId:'untrusted-receipt',ordinal:2,source,type:'receipt.confirmed',evidenceIds:['untrusted-verification','missing'],payload:{receipt:{
   receiptId:'receipt-fake',handoffId:manifest.handoffId,targetSessionId:'session',targetRunId:'run',manifestDigest:manifest.digest,stage:'verified-complete',nonce:'claimed-nonce-123456',expiresAt:'2099-01-01T00:00:00.000Z',
  }}},
 ];
 await writeFile(file,JSON.stringify(imported));
 expect((await cli(['control','ingest','--file',file,'--data-dir',data],cwd)).code).toBe(0);
 const store=await openStore({dataDir:data});
 try {
  expect(store.controlPlane().readAllEvents().map(row=>row.source.kind)).toEqual(['source-log','source-log','source-log']);
  const {controlEventSchema}=await import('../src/control-plane/contracts.js');
  const oldManifest=createContextManifest({...manifest,taskId:'old-task',handoffId:'old-handoff'});
  const legacyReceipt=imported.at(-1)?.payload.receipt;
  store.controlPlane().appendEvents(imported.map(row=>controlEventSchema.parse({...row,eventId:'old-'+row.eventId,taskId:'old-task',
   payload:row.type==='manifest.saved'?{handoffId:oldManifest.handoffId,manifest:oldManifest}:row.type==='receipt.confirmed'?{
    receipt:{...legacyReceipt,handoffId:oldManifest.handoffId,manifestDigest:oldManifest.digest},
   }:row.payload,
  })));
 } finally {store.close();}
 for(const task of ['task','old-task']){
  const result=await cli(['control','status','--task',task,'--data-dir',data],cwd);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).receipts['receipt-fake']).toMatchObject({stage:'reported-complete',status:'unknown',confirmedAt:null});
 }
});

it.skipIf(process.platform==='win32')('rejects a POSIX FIFO without waiting for a writer',async()=>{
 const {execFileSync}=await import('node:child_process');
 const cwd=await temporary(),fifo=join(cwd,'events.fifo'),data=join(cwd,'data');
 execFileSync('mkfifo',[fifo]);
 // Abort the test quickly even if a regression leaves an asynchronous open pending.
 const result=await Promise.race([
  cli(['control','ingest','--file',fifo,'--data-dir',data],cwd),
  new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('FIFO open blocked without a writer')),1500);timer.unref();}),
 ]);
 expect(result.code).toBe(2);
 expect(await readdir(cwd)).toEqual(['events.fifo']);
});

it('redacts before storing and displaying imports without turning different secrets into identical retries',async()=>{
 const {default:Database}=await import('better-sqlite3');
 const cwd=await temporary(),file=join(cwd,'events.json'),data=join(cwd,'data');
 const credential='Bearer '+ 'D'.repeat(24);
 const input={...event,type:'attention.opened',idempotencyKey:credential,source:{...event.source,parserVersion:credential},payload:{message:'Synthetic credential '+credential}};
 const ingest=()=>cli(['control','ingest','--file',file,'--data-dir',data],cwd);
 await writeFile(file,JSON.stringify(input));
 expect((await ingest()).code).toBe(0);
 expect(JSON.parse((await ingest()).stdout).duplicate).toEqual([event.eventId]);
 await writeFile(file,JSON.stringify({...input,payload:{message:'Synthetic credential Bearer '+'E'.repeat(24)}}));
 expect((await ingest()).code).toBe(4);
 const db=new Database(join(data,'threadport.sqlite'));
 try{
  expect(JSON.stringify(db.prepare('SELECT event_json,idempotency_key FROM control_events').get())).not.toContain(credential);
 }finally{db.close();}
 const state=await cli(['control','status','--task','task','--data-dir',data],cwd);
 expect(state.code).toBe(0);
 expect(state.stdout).toContain('[REDACTED:bearer-token]');
 expect(state.stdout).not.toContain(credential);
});

it('rejects malformed projected payloads before writing any events', async()=>{
 const cwd=await temporary(),data=join(cwd,'data'),file=join(cwd,'events.json');
 const malformed=[
  {type:'attention.opened',payload:{message:{toString:null}}},
  {type:'attention.opened',payload:{id:{toString:null}}},
  {type:'attention.opened',payload:{kind:{toString:null}}},
  {type:'responsibility.proposed',payload:{scope:{toString:null}}},
  {type:'responsibility.confirmed',payload:{roles:{executor:{toString:null}}}},
  {type:'responsibility.confirmed',payload:{roles:['runner']}},
  {type:'lineage.relation',payload:{id:{toString:null},childSessionId:'child',relation:'handoff'}},
  {type:'lineage.relation',payload:{childSessionId:'child',relation:'handoff',evidenceLevel:'forged'}},
 ];
 for(const record of malformed){
  await writeFile(file,JSON.stringify([event,{...event,eventId:'bad-event',...record}]));
  expect((await cli(['control','ingest','--file',file,'--data-dir',data],cwd)).code).toBe(2);
 }
 expect(await readdir(cwd)).toEqual(['events.json']);
});

it('redacts credentials from imported event types before storage and replay and preserves exact retries', async()=>{
 const {default:Database}=await import('better-sqlite3');
 const cwd=await temporary(),file=join(cwd,'events.json'),data=join(cwd,'data');
 const credential='sk-'+'f'.repeat(27);
 const input={...event,type:'review.'+credential,source:{...event.source,coverage:'partial'},payload:{}};
 const ingest=()=>cli(['control','ingest','--file',file,'--data-dir',data],cwd);
 await writeFile(file,JSON.stringify(input));
 expect((await ingest()).code).toBe(0);
 expect(JSON.parse((await ingest()).stdout).duplicate).toEqual([event.eventId]);
 await writeFile(file,JSON.stringify({...input,type:'review.sk-'+'g'.repeat(27)}));
 expect((await ingest()).code).toBe(4);
 const db=new Database(join(data,'threadport.sqlite'));
 try{
  const body=db.prepare('SELECT event_json FROM control_events').pluck().get() as string;
  expect(JSON.parse(body).type).toMatch(/^redacted-[a-f0-9]{64}$/);
  expect(body).not.toContain(credential);
 }finally{db.close();}
 const state=await cli(['control','status','--task','task','--data-dir',data],cwd);
 expect(state.code).toBe(0);
 expect(state.stdout).toContain('coverage-gap');
 expect(state.stdout).not.toContain(credential);
});
