import Database from 'better-sqlite3';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCapsule } from '../capsule.js';
import { applicationDataDir } from '../platform/paths.js';
import { DomainError } from '../domain/errors.js';
import { SCHEMA_VERSION } from '../storage/migrations.js';
import { bindingSchema, snapshotSchema, type VerificationReport } from './contracts.js';
import { verifyWorkspace } from './verify.js';
const prefix='threadport:workspace-snapshot:';
type UnknownReport=Omit<VerificationReport,'status'|'snapshotId'|'workspaceId'|'scope'> & {
 status:'unverifiable';snapshotId:string|null;workspaceId:string|null;scope:VerificationReport['scope']|null;
};
export type CapsuleVerificationReport=VerificationReport|UnknownReport;
function unknown(snapshotId:string|null,message:string):UnknownReport{
 return{status:'unverifiable',snapshotId,workspaceId:null,scope:null,verifiedAt:new Date().toISOString(),reasons:[{code:'WORKSPACE_UNBOUND',message}]};
}
/** Resolve only an explicit evidence reference. Never choose the latest snapshot or capture a baseline. */
export async function verifyCapsule(text:string,projectRoot:string,dataDir?:string):Promise<CapsuleVerificationReport>{
 const capsule=parseCapsule(text);
 const references=capsule.evidence.filter(item=>item.kind==='other'&&item.locator?.startsWith(prefix));
 if(!references.length)return unknown(null,'This Capsule has no explicit local workspace snapshot reference.');
 if(references.length!==1)throw new DomainError('INVALID_INPUT','Exactly one workspace snapshot reference is allowed.');
 const id=references[0].locator!.slice(prefix.length);
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,511}$/.test(id))throw new DomainError('INVALID_INPUT','Invalid workspace snapshot reference.');
 const path=join(applicationDataDir({dataDir}),'threadport.sqlite');
 let db:Database.Database|undefined;
 try{
  let info;
  try{info=await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return unknown(id,'The referenced local snapshot store is missing.');throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||(process.getuid&&info.uid!==process.getuid()))throw new Error('Unsafe database');
  db=new Database(path,{readonly:true,fileMustExist:true,timeout:5000});
  if(db.pragma('user_version',{simple:true})!==SCHEMA_VERSION)throw new Error('Incompatible database');
  const body=db.prepare('SELECT body_json FROM snapshots WHERE id=?').pluck().get(id);
  if(body===undefined)return unknown(id,'The referenced local snapshot is missing.');
  const snapshot=snapshotSchema.parse(JSON.parse(body as string));
  if(snapshot.id!==id)throw new Error('Snapshot identity mismatch');
  const query=db.prepare('SELECT id,project_id AS projectId,canonical_root AS canonicalRoot FROM workspaces WHERE id=?');
  const row=query.get(snapshot.workspaceId);
  const binding=row===undefined?null:bindingSchema.parse(row);
  if(binding){
   // Resolve the explicit CLI root; portable Capsule paths never select a workspace.
   let selected:string;
   try{selected=await realpath(projectRoot);}catch(error){
    const code=(error as NodeJS.ErrnoException).code;
    return{...unknown(id,'The selected project cannot be read.'),workspaceId:snapshot.workspaceId,scope:snapshot.scope,reasons:[{code:code==='ENOENT'?'SOURCE_MISSING':'READ_FAILED',message:'The selected project cannot be read.'}]};
   }
   if(selected!==binding.canonicalRoot)return await verifyWorkspace(snapshot,null);
  }
  const report=await verifyWorkspace(snapshot,binding);
  if(JSON.stringify(query.get(snapshot.workspaceId))!==JSON.stringify(row))return await verifyWorkspace(snapshot,null);
  return report;
 }catch{throw new DomainError('IO_FAILED','Unable to read the local verification store.');}
 finally{db?.close();}
}
