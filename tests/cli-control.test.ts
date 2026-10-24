import { expect, it } from 'vitest';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';
import { temporary } from './helpers.js';

async function cli(args:string[],cwd:string){
 let stdout='',stderr='';const code=await runCli(args,{cwd:()=>cwd,stdout:{write:value=>{stdout+=value;}},stderr:{write:value=>{stderr+=value;}}});
 return{code,stdout,stderr};
}
const event={eventId:'cli-event',protocol:'threadport.control-event.v1',occurredAt:null,recordedAt:'2026-10-25T00:00:00.000Z',source:{kind:'threadport',sourceId:'test',parserVersion:null,coverage:'full'},taskId:'task',sessionId:'session',runId:'run',ordinal:0,type:'run.started',payload:{},idempotencyKey:null,evidenceIds:[]};

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
