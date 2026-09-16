import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedEvent } from '../domain/models.js';
const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(512);
const environmentSchema=z.object({scope:z.literal('observer-and-inherited-allowlist.v1'),observerNode:z.string(),platform:z.string(),arch:z.string(),digest:hash,complete:z.literal(false)}).strict();
export const observationSchema=z.object({
 protocol:z.literal('threadport.execution-observation.v1'),id:z.string().uuid(),handoffId:z.string().uuid(),taskId:id,sessionId:id,
 kind:z.literal('threadport-target-process'),planDigest:hash,beforeSnapshotId:id,afterSnapshotId:id.nullable(),
 createdAt:z.string().datetime(),startedAt:z.string().datetime().nullable(),completedAt:z.string().datetime().nullable(),
 status:z.enum(['running','exited','failed','cancelled','interrupted','unknown']),exitCode:z.number().int().nullable(),
 environmentBefore:environmentSchema,environmentAfter:environmentSchema.nullable(),
 testCounts:z.null(),testScope:z.null(),
}).strict();
export type ExecutionObservation=z.infer<typeof observationSchema>;
/** No raw env values are retained. This cannot certify external Agent configuration or child commands. */
export function observeEnvironment():ExecutionObservation['environmentBefore']{
 const values=['PATH','LANG','LC_ALL','NODE_ENV','CI'].map(key=>[key,process.env[key]??null]);
 return {scope:'observer-and-inherited-allowlist.v1',observerNode:process.version,platform:process.platform,arch:process.arch,digest:createHash('sha256').update(JSON.stringify([process.version,process.platform,process.arch,values])).digest('hex'),complete:false};
}
export function observationEvent(value:ExecutionObservation,ordinal:number):NormalizedEvent{
 const id='observed:'+value.id;
 return {id,sessionId:value.sessionId,ordinal,occurredAt:value.startedAt,kind:'command',text:'ThreadPort observed the approved target process only. This is not an observation of commands or tests inside the Agent.',relativePaths:[],omitted:!value.startedAt||!value.completedAt||!value.afterSnapshotId||value.status==='unknown',commandRun:{id,eventId:id,sessionId:value.sessionId,ordinal,command:`Historical target process; launch plan ${value.planDigest} (review record only, not an executable command)`,cwd:null,exitCode:value.exitCode,startedAt:value.startedAt,completedAt:value.completedAt,snapshotId:value.beforeSnapshotId}};
}
