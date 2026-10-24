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
