import type { GitState } from '../types.js';
import { randomUUID } from 'node:crypto';
import type { SqliteStore } from '../storage/sqlite-store.js';
import { DomainError } from '../domain/errors.js';
import { bindingSchema, limitSchema, snapshotSchema, workspaceInput, type CaptureOptions, type WorkspaceBinding, type WorkspaceSnapshot, type SnapshotReason } from './contracts.js';
import { WORKSPACE_ALGORITHM, WORKSPACE_POLICY } from './policy.js';
import { CaptureFault, readSnapshot } from './reader.js';
/** Capture now, never reconstruct or certify a historical command's execution environment. */
async function capture(input:WorkspaceBinding,options:CaptureOptions,projection:boolean):Promise<{snapshot:WorkspaceSnapshot;git:GitState|null}>{
 const binding=workspaceInput(bindingSchema,input);const limits=workspaceInput(limitSchema,options.limits??{});
 const deadline=AbortSignal.timeout(30000);const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
 options.signal?.throwIfAborted();
 const base={id:randomUUID(),workspaceId:binding.id,capturedAt:new Date().toISOString(),head:null,bindingDigest:null,digest:null,algorithm:WORKSPACE_ALGORITHM,policy:WORKSPACE_POLICY,omissions:[],scope:'head-tracked-diff-untracked' as const};
 for(let attempt=0;attempt<2;attempt++){
  try{const {git,...captured}=await readSnapshot(binding,limits,signal,projection);signal.throwIfAborted();return {snapshot:workspaceInput(snapshotSchema,{...base,...captured,incompleteReasons:[]}),git};}
  catch(error){
   options.signal?.throwIfAborted();let reason:SnapshotReason=deadline.aborted?'LIMIT_EXCEEDED':error instanceof CaptureFault?error.reason:(error as NodeJS.ErrnoException).code==='ENOENT'?'SOURCE_MISSING':'READ_FAILED';
   if(reason==='RACED'&&attempt===0)continue;
   return {snapshot:{...base,omissions:error instanceof CaptureFault?error.omissions:[],incompleteReasons:[reason]},git:null};
  }
 }
 throw new DomainError('IO_FAILED','Snapshot capture did not finish.');
}
export async function captureWorkspace(input:WorkspaceBinding,options:CaptureOptions={}):Promise<WorkspaceSnapshot>{
 return (await capture(input,options,false)).snapshot;
}
/** Internal handoff projection. The digest is raw.v2, not the legacy diff algorithm. */
export async function captureWorkspaceWithGit(input:WorkspaceBinding,options:CaptureOptions={}):Promise<{snapshot:WorkspaceSnapshot;git:GitState|null}>{
 return capture(input,options,true);
}
export class SnapshotService {
 constructor(private readonly store:Pick<SqliteStore,'getWorkspace'|'saveSnapshot'>){}
 async capture(workspaceId:string,options:CaptureOptions={}):Promise<WorkspaceSnapshot>{
  const workspace=this.store.getWorkspace(workspaceId);if(!workspace)throw new DomainError('NOT_FOUND','Workspace does not exist.');
  const snapshot=await captureWorkspace(workspace,options);options.signal?.throwIfAborted();this.store.saveSnapshot(snapshot,workspace);return snapshot;
 }
}
