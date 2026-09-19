import { createInterface } from 'node:readline';
import { openStore } from './storage/sqlite-store.js';
import { DomainError } from './domain/errors.js';
import { targetRunners } from './targets/registry.js';
import { continueHandoff } from './targets/launch.js';
import { runProcess } from './platform/process.js';
import type { CliIo } from './cli.js';
function confirm():Promise<boolean>{return new Promise(resolve=>{
 const reader=createInterface({input:process.stdin,output:process.stdout,terminal:true});let settled=false;
 const cancel=()=>finish(false);const finish=(accepted:boolean)=>{if(settled)return;settled=true;process.off('SIGINT',cancel);process.off('SIGTERM',cancel);reader.close();resolve(accepted);};
 reader.once('SIGINT',cancel);reader.once('close',cancel);process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 reader.question('> ',answer=>finish(answer.trim()==='CONTINUE'));
 });}
export async function runContinue(options:{handoffId:string;dataDir?:string},io:CliIo):Promise<number>{
 if(!process.stdin.isTTY||!process.stdout.isTTY){io.stderr.write('continue requires interactive terminal stdin and stdout; no --yes bypass is supported.\n');return 2;}
 let store:Awaited<ReturnType<typeof openStore>>|undefined;
 try{store=await openStore({dataDir:options.dataDir});const h=store.handoffStore().read(options.handoffId).record.handoff;
  return await continueHandoff(store,options.handoffId,{isTTY:true,write:text=>io.stdout.write(text),confirm,run:(spec,onSpawn)=>runProcess(spec,undefined,onSpawn)},targetRunners()[h.target]);
 }catch(error){io.stderr.write((error instanceof DomainError?error.code+': '+error.message:'Continuation failed.')+'\n');return error instanceof DomainError&&error.code==='TARGET_UNSUPPORTED'?3:error instanceof DomainError&&error.code==='REVISION_CONFLICT'?4:error instanceof DomainError&&['INVALID_INPUT','NOT_FOUND','REDACTION_REQUIRED'].includes(error.code)?2:5;}
 finally{store?.close();}
}
