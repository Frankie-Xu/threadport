import { resolve } from 'node:path';
import { openStore } from './storage/sqlite-store.js';
import { controlIdSchema, receiptInputSchema } from './control-plane/contracts.js';
import { parseControlOptions, controlExitCode } from './cli-control-options.js';
import { readControlEventImport } from './control-plane/import.js';
import { rebuildControlState } from './control-plane/reducer.js';
import { TakeoverManager } from './control-plane/takeover.js';
import type { CliIo } from './cli.js';
import { DomainError } from './domain/errors.js';
const controlIds = new Set(['status','ingest']);
export async function runControlCommand(args:string[],io:CliIo):Promise<number>{
 let store:Awaited<ReturnType<typeof openStore>>|undefined;
 try{
  const sub=args[0];if(!sub||!controlIds.has(sub))throw new DomainError('INVALID_INPUT','Choose control status or ingest.');
  const required=sub==='status'?'--task':'--file';
  const options=parseControlOptions(args.slice(1),[required,'--data-dir'],[required]);
  const task=sub==='status'?controlIdSchema.parse(options['--task']):null;
  const events=sub==='ingest'?await readControlEventImport(resolve(io.cwd(),options['--file'])):null;
  store=await openStore({dataDir:options['--data-dir']?resolve(io.cwd(),options['--data-dir']):undefined});const cp=store.controlPlane();
  const result=task!==null?rebuildControlState(cp.readTaskEvents(task)):cp.appendEvents(events!);
  io.stdout.write(JSON.stringify(result)+'\n');return 0;
 }catch(error){io.stderr.write('Control plane operation failed.\n');return controlExitCode(error);}finally{store?.close();}
}
export async function runReceiptCommand(args:string[],io:CliIo):Promise<number>{
 let store:Awaited<ReturnType<typeof openStore>>|undefined;
 try{
  if(args[0]!=='receipt')throw new DomainError('INVALID_INPUT','Choose handoff receipt.');
  const required=['--id','--target-session','--target-run','--manifest-digest','--stage','--nonce','--expires-at'];
  const options=parseControlOptions(args.slice(1),[...required,'--data-dir'],required);
  const input=receiptInputSchema.parse({handoffId:options['--id'],targetSessionId:options['--target-session'],targetRunId:options['--target-run'],manifestDigest:options['--manifest-digest'],stage:options['--stage'],nonce:options['--nonce'],expiresAt:options['--expires-at']});
  store=await openStore({dataDir:options['--data-dir']?resolve(io.cwd(),options['--data-dir']):undefined});
  const manifest=store.controlPlane().getManifest(input.handoffId);if(!manifest)throw new DomainError('NOT_FOUND','Context manifest does not exist.');
  if(input.manifestDigest!==manifest.digest)throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt digest does not match manifest.');
  io.stdout.write(JSON.stringify(store.controlPlane().saveReceipt(input))+'\n');return 0;
 }catch(error){io.stderr.write('Receipt operation failed.\n');return controlExitCode(error);}finally{store?.close();}
}

const takeover = new TakeoverManager();
export async function runTakeoverCommand(args:string[],io:CliIo):Promise<number>{
 try{
  const sub=args[0];
  if(sub==='request'){
   const keys=['--run','--task','--owner','--target'];const options=parseControlOptions(args.slice(1),keys,keys);
   const input={runId:controlIdSchema.parse(options['--run']),taskId:controlIdSchema.parse(options['--task']),ownerSessionId:controlIdSchema.parse(options['--owner']),targetSessionId:controlIdSchema.parse(options['--target'])};
   io.stdout.write(JSON.stringify(await takeover.request(input))+'\n');return 0;
  }
  if(sub==='acknowledge'){
   const keys=['--id','--successor'];const options=parseControlOptions(args.slice(1),keys,keys);
   const id=controlIdSchema.parse(options['--id']),successor=controlIdSchema.parse(options['--successor']);
   io.stdout.write(JSON.stringify(takeover.acknowledge(id,successor))+'\n');return 0;
  }
  throw new DomainError('INVALID_INPUT','Choose takeover request or acknowledge.');
 }catch(error){io.stderr.write('Takeover operation failed.\n');return controlExitCode(error);}
}
