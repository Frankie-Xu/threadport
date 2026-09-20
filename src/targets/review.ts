import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { canonical, sha256 } from '../handoff/contracts.js';
import { DomainError } from '../domain/errors.js';
import type { LaunchSpec, TargetCapability } from './contracts.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const launchPlanSchema=z.object({
 protocol:z.literal('threadport.launch-plan.v1'),nonce:z.string().uuid(),handoffId:z.string().uuid(),handoffDigest:hash,
 target:z.enum(['claude','codex']),version:z.string().nullable(),expiresAt:z.string().datetime(),
 executable:z.object({path:z.string(),digest:hash,identity:z.string()}).strict(),
 spec:z.object({executable:z.string(),args:z.array(z.string()),cwd:z.string(),input:z.object({kind:z.literal('argv'),value:z.string()}).strict()}).strict(),
 permissions:z.literal('Exact argv shown; inherited Agent settings, interpreter and environment are not certified.'),
 transmission:z.literal('Full context in process arguments; visible to processes allowed to inspect argv.'),
}).strict();
export type LaunchPlan=z.infer<typeof launchPlanSchema>;
export const launchPlanDigest=(plan:LaunchPlan)=>sha256(canonical(launchPlanSchema.parse(plan)));

/** Hash the actual canonical launcher, not just its PATH name. This is not an OS execution sandbox. */
async function executableIdentity(path:string):Promise<LaunchPlan['executable']>{
 try{
  if(!isAbsolute(path))throw new Error();
  const resolved=await realpath(path);const file=await open(resolved,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const before=await file.stat({bigint:true});
   if(!before.isFile()||before.size>256n*1024n*1024n)throw new Error();
   const signature=(info:typeof before)=>[info.dev,info.ino,info.mode,info.size,info.mtimeNs,info.ctimeNs].join(':');
   const digest=createHash('sha256');const buffer=Buffer.alloc(1024*1024);let offset=0;
   while(offset<Number(before.size)){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,Number(before.size)-offset),offset);if(!bytesRead)throw new Error();digest.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}
   if(signature(before)!==signature(await file.stat({bigint:true}))||await realpath(path)!==resolved)throw new Error();
   return {path:resolved,digest:digest.digest('hex'),identity:signature(before)};
  }finally{await file.close();}
 }catch{throw new DomainError('REVISION_CONFLICT','Target executable is unavailable or changed; prepare and review again.');}
}

export async function freezeLaunchPlan(spec:LaunchSpec,target:TargetCapability,handoffId:string,handoffDigest:string,expiresAt:string):Promise<LaunchPlan>{
 const executable=await executableIdentity(spec.executable);
 return launchPlanSchema.parse({protocol:'threadport.launch-plan.v1',nonce:randomUUID(),handoffId,handoffDigest,target:target.agent,version:target.version,expiresAt,executable,spec:{...spec,executable:executable.path},permissions:'Exact argv shown; inherited Agent settings, interpreter and environment are not certified.',transmission:'Full context in process arguments; visible to processes allowed to inspect argv.'});
}

export async function verifyLaunchPlan(plan:LaunchPlan,spec:LaunchSpec,target:TargetCapability):Promise<void>{
 try{
  const current=await freezeLaunchPlan(spec,target,plan.handoffId,plan.handoffDigest,plan.expiresAt);
  current.nonce=plan.nonce;
  if(Date.now()>=Date.parse(plan.expiresAt)||launchPlanDigest(current)!==launchPlanDigest(plan))throw new Error();
 }catch{throw new DomainError('REVISION_CONFLICT','The reviewed launch plan changed; prepare and review again.');}
}
