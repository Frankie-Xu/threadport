import { createInterface } from 'node:readline';
import { openStore } from './storage/sqlite-store.js';
import { observeProcess } from './platform/process-identity.js';
import { DomainError } from './domain/errors.js';
import type { CliIo } from './cli.js';

export async function runRecovery(command:'inspect-run'|'recover-run',handoffId:string,dataDir:string|undefined,io:CliIo):Promise<number>{
 if(command==='recover-run'&&(!process.stdin.isTTY||!process.stdout.isTTY)){io.stderr.write('Recovery requires an interactive terminal; no --yes bypass is supported.\n');return 2;}
 let store:Awaited<ReturnType<typeof openStore>>|undefined;
 try{
  store=await openStore({dataDir});const launches=store.launchStore();launches.reconcile(handoffId);
  const run=launches.inspectRun(handoffId);if(!run)throw new DomainError('NOT_FOUND','No workspace reservation exists for this handoff.');
  io.stdout.write(JSON.stringify({...run,executionObservation:store.observationStore().get(run.id),approvedPlan:store.observationStore().plan(run.id),ownerObservation:observeProcess(run.owner),targetObservation:run.target?observeProcess(run.target):'unavailable'},null,2)+'\n');
  if(command==='inspect-run')return 0;
  if(run.state!=='unknown')throw new DomainError('REVISION_CONFLICT','Only an unknown attempt can be recovered.');
  io.stdout.write('Inspect the original terminal and stop any target first. Releasing does not stop a process or prove it exited. This handoff remains consumed.\n');
  const phrase=`RELEASE ${run.nonce}`;
  io.stdout.write(`After checking the target has stopped, type ${phrase}\n`);
  const accepted=await new Promise<boolean>(resolve=>{
   const reader=createInterface({input:process.stdin,output:process.stdout,terminal:true});let done=false;
   const finish=(value:boolean)=>{if(done)return;done=true;reader.close();resolve(value);};
   reader.once('SIGINT',()=>finish(false));reader.once('close',()=>finish(false));reader.question('> ',answer=>finish(answer===phrase));
  });
  if(!accepted)return 130;
  launches.recover(handoffId,run.nonce,'I checked the target has stopped');
  io.stdout.write('Workspace reservation released; prepare a new handoff to continue.\n');return 0;
 }catch(error){io.stderr.write(error instanceof DomainError?`${error.code}: ${error.message}\n`:'Run inspection failed.\n');return error instanceof DomainError&&error.code==='NOT_FOUND'?2:4;}
 finally{store?.close();}
}
