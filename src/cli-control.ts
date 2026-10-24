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
function value(args:string[],name:string):string|undefined { const i=args.indexOf(name); return i<0?undefined:args[i+1]; }
function dataDir(args:string[],io:CliIo):string|undefined { const value=valueOf(args,'--data-dir'); return value?resolve(io.cwd(),value):undefined; }
function valueOf(args:string[],name:string):string|undefined { const i=args.indexOf(name); return i>=0?args[i+1]:undefined; }
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
 if(args[0]!=='receipt'){io.stderr.write('handoff requires receipt.\n');return 2;}const id=value(args,'--id');const required={targetSessionId:value(args,'--target-session'),targetRunId:value(args,'--target-run'),manifestDigest:value(args,'--manifest-digest'),stage:value(args,'--stage'),nonce:value(args,'--nonce'),expiresAt:value(args,'--expires-at')};if(!id||Object.values(required).some(v=>!v)){io.stderr.write('handoff receipt requires --id, target, digest, stage, nonce and expiry.\n');return 2;}let store:Awaited<ReturnType<typeof openStore>>|undefined;try{store=await openStore({dataDir:dataDir(args,io)});const manifest=store.controlPlane().getManifest(id);if(!manifest)throw new DomainError('NOT_FOUND','Context manifest does not exist.');const input=receiptInputSchema.parse({handoffId:id,...required});if(input.manifestDigest!==manifest.digest)throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt digest does not match manifest.');io.stdout.write(JSON.stringify(store.controlPlane().saveReceipt(input))+'\n');return 0;}catch(error){io.stderr.write('Receipt operation failed.\n');return error instanceof DomainError&&error.code==='INVALID_INPUT'?2:error instanceof DomainError&&error.code==='RECEIPT_DIGEST_MISMATCH'?4:5;}finally{store?.close();}}

const takeover = new TakeoverManager();
export async function runTakeoverCommand(args:string[],io:CliIo):Promise<number>{const sub=args[0];try{if(sub==='request'){const runId=value(args,'--run');const taskId=value(args,'--task');const owner=value(args,'--owner');const target=value(args,'--target');if(!runId||!taskId||!owner||!target){io.stderr.write('takeover request requires --run, --task, --owner and --target.\n');return 2;}io.stdout.write(JSON.stringify(await takeover.request({runId,taskId,ownerSessionId:owner,targetSessionId:target}))+'\n');return 0;}if(sub==='acknowledge'){const id=value(args,'--id');const successor=value(args,'--successor');if(!id||!successor){io.stderr.write('takeover acknowledge requires --id and --successor.\n');return 2;}io.stdout.write(JSON.stringify(takeover.acknowledge(id,successor))+'\n');return 0;}io.stderr.write('takeover requires request or acknowledge.\n');return 2;}catch(error){io.stderr.write('Takeover operation failed.\n');return error instanceof DomainError&&error.code==='TAKEOVER_CONFLICT'?4:5;}}
