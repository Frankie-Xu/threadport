import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore } from './storage/sqlite-store.js';
import { controlEventSchema, receiptInputSchema } from './control-plane/contracts.js';
import { rebuildControlState } from './control-plane/reducer.js';
import { TakeoverManager } from './control-plane/takeover.js';
import type { CliIo } from './cli.js';
import { DomainError } from './domain/errors.js';
const controlIds = new Set(['status','ingest']);
function value(args:string[],name:string):string|undefined { const i=args.indexOf(name); return i<0?undefined:args[i+1]; }
function dataDir(args:string[],io:CliIo):string|undefined { const value=valueOf(args,'--data-dir'); return value?resolve(io.cwd(),value):undefined; }
function valueOf(args:string[],name:string):string|undefined { const i=args.indexOf(name); return i>=0?args[i+1]:undefined; }
export async function runControlCommand(args:string[],io:CliIo):Promise<number>{
 const sub=args[0]; if(!sub || !controlIds.has(sub)){io.stderr.write('control requires status or ingest.\n');return 2;}
 let store:Awaited<ReturnType<typeof openStore>>|undefined;
 try{store=await openStore({dataDir:dataDir(args,io)});const cp=store.controlPlane();
  if(sub==='status'){const task=value(args,'--task');if(!task){io.stderr.write('control status requires --task.\n');return 2;}const state=rebuildControlState(cp.readAllEvents().filter(e=>e.taskId===task));io.stdout.write(JSON.stringify(state)+'\n');return 0;}
  const file=value(args,'--file');if(!file){io.stderr.write('control ingest requires --file.\n');return 2;}const parsed=JSON.parse(await readFile(resolve(io.cwd(),file),'utf8'));const events=Array.isArray(parsed)?parsed:[parsed];const valid=events.map(item=>controlEventSchema.parse(item));io.stdout.write(JSON.stringify(cp.appendEvents(valid))+'\n');return 0;
 }catch(error){io.stderr.write('Control plane operation failed.\n');return error instanceof DomainError&&error.code==='INVALID_INPUT'?2:error instanceof DomainError&&error.code==='REVISION_CONFLICT'?4:5;}finally{store?.close();}
}
export async function runReceiptCommand(args:string[],io:CliIo):Promise<number>{
 if(args[0]!=='receipt'){io.stderr.write('handoff requires receipt.\n');return 2;}const id=value(args,'--id');const required={targetSessionId:value(args,'--target-session'),targetRunId:value(args,'--target-run'),manifestDigest:value(args,'--manifest-digest'),stage:value(args,'--stage'),nonce:value(args,'--nonce'),expiresAt:value(args,'--expires-at')};if(!id||Object.values(required).some(v=>!v)){io.stderr.write('handoff receipt requires --id, target, digest, stage, nonce and expiry.\n');return 2;}let store:Awaited<ReturnType<typeof openStore>>|undefined;try{store=await openStore({dataDir:dataDir(args,io)});const manifest=store.controlPlane().getManifest(id);if(!manifest)throw new DomainError('NOT_FOUND','Context manifest does not exist.');const input=receiptInputSchema.parse({handoffId:id,...required});if(input.manifestDigest!==manifest.digest)throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt digest does not match manifest.');io.stdout.write(JSON.stringify(store.controlPlane().saveReceipt(input))+'\n');return 0;}catch(error){io.stderr.write('Receipt operation failed.\n');return error instanceof DomainError&&error.code==='INVALID_INPUT'?2:error instanceof DomainError&&error.code==='RECEIPT_DIGEST_MISMATCH'?4:5;}finally{store?.close();}}

const takeover = new TakeoverManager();
export async function runTakeoverCommand(args:string[],io:CliIo):Promise<number>{const sub=args[0];try{if(sub==='request'){const runId=value(args,'--run');const taskId=value(args,'--task');const owner=value(args,'--owner');const target=value(args,'--target');if(!runId||!taskId||!owner||!target){io.stderr.write('takeover request requires --run, --task, --owner and --target.\n');return 2;}io.stdout.write(JSON.stringify(await takeover.request({runId,taskId,ownerSessionId:owner,targetSessionId:target}))+'\n');return 0;}if(sub==='acknowledge'){const id=value(args,'--id');const successor=value(args,'--successor');if(!id||!successor){io.stderr.write('takeover acknowledge requires --id and --successor.\n');return 2;}io.stdout.write(JSON.stringify(takeover.acknowledge(id,successor))+'\n');return 0;}io.stderr.write('takeover requires request or acknowledge.\n');return 2;}catch(error){io.stderr.write('Takeover operation failed.\n');return error instanceof DomainError&&error.code==='TAKEOVER_CONFLICT'?4:5;}}
