import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { NormalizedEvent } from '../domain/models.js';
import type { WorkspaceSnapshot } from '../workspace/contracts.js';
import { compareWorkspaceSnapshots } from '../workspace/verify.js';
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

/**
 * A vendor/Agent supplied result is deliberately a separate protocol from
 * `threadport.execution-observation.v1`.  The latter is the process boundary
 * owned by ThreadPort; this record can only be produced by a structured hook
 * or export that supplies all of the fields below.  Prose and terminal text
 * are not valid inputs to this schema.
 */
const innerSourceSchema=z.object({
 protocol:z.string().min(1).max(128),
 agent:z.string().min(1).max(64),
 version:z.string().min(1).max(128).nullable(),
 origin:z.enum(['agent-hook','structured-export','native-import']),
}).strict();
const innerWorkspaceSchema=z.object({
 beforeSnapshotId:id.nullable(), afterSnapshotId:id.nullable(),
 scope:z.literal('head-tracked-diff-untracked'),
}).strict();
const innerEnvironmentSchema=z.object({
 scope:z.string().min(1).max(128), digest:hash.nullable(), complete:z.boolean(),
}).strict();
export const innerObservationSchema=z.object({
 protocol:z.literal('threadport.inner-agent-observation.v1'),
 source:innerSourceSchema,
 eventId:id,
 kind:z.enum(['command','test']),
 command:z.string().min(1).nullable(),
 status:z.enum(['succeeded','passed','failed','running','pending','interrupted','unknown']),
 exitCode:z.number().int().safe().nullable(),
 startedAt:z.string().datetime().nullable(), completedAt:z.string().datetime().nullable(),
 workspace:innerWorkspaceSchema,
 environment:innerEnvironmentSchema,
}).strict().superRefine((value,ctx)=>{
 if(value.kind==='command'&&value.command===null)ctx.addIssue({code:z.ZodIssueCode.custom,path:['command'],message:'A structured command result requires its command.'});
 if(value.status==='succeeded'&&value.exitCode!==null&&value.exitCode!==0)ctx.addIssue({code:z.ZodIssueCode.custom,path:['exitCode'],message:'Succeeded results cannot have a non-zero exit code.'});
 if(value.status==='failed'&&value.exitCode===0)ctx.addIssue({code:z.ZodIssueCode.custom,path:['exitCode'],message:'Failed results cannot have exit code zero.'});
});
export type InnerAgentObservation=z.infer<typeof innerObservationSchema>;
/** Short aliases used by callers that treat the record as an inner observation. */
export type InnerObservation=InnerAgentObservation;

export const innerEvidenceSchema=z.object({
 protocol:z.literal('threadport.inner-agent-evidence.v1'),
 eventId:id, kind:z.enum(['command','test']),
 sourceProtocol:z.string().min(1).nullable(),
 resultStatus:z.enum(['succeeded','passed','failed','running','pending','interrupted','unknown']),
 exitCode:z.number().int().safe().nullable(),
 applicability:z.enum(['current','stale','unverified','unknown']),
 workspace:z.object({
   status:z.enum(['matched','drifted','unverifiable']),
   beforeSnapshotId:id.nullable(), afterSnapshotId:id.nullable(),
 }).strict(),
 environment:z.object({scope:z.string().min(1).nullable(),digest:hash.nullable(),complete:z.boolean()}).strict(),
 reasons:z.array(z.enum([
   'NO_STRUCTURED_RESULT','PENDING_TOOL','INTERRUPTED','PARTIAL_LOG','RESULT_UNKNOWN',
   'SNAPSHOT_MISSING','SNAPSHOT_UNVERIFIABLE','NATIVE_IMPORT_UNBOUND','WORKSPACE_CHANGED',
   'ENVIRONMENT_UNKNOWN','EXECUTION_WORKSPACE_CHANGED',
   'EVENT_MISMATCH','KIND_MISMATCH','SNAPSHOT_WORKSPACE_MISMATCH','DUPLICATE_EVENT',
 ])),
 observation:innerObservationSchema.nullable(),
}).strict();
export type InnerAgentEvidence=z.infer<typeof innerEvidenceSchema>;
export type InnerEvidence=InnerAgentEvidence;

export type InnerEvidenceReason=InnerAgentEvidence['reasons'][number];

/** Produce an explicit unknown record when a hook/export did not provide a result. */
export function unknownInnerEvidence(
 eventId:string, kind:'command'|'test', reason:InnerEvidenceReason|readonly InnerEvidenceReason[]='NO_STRUCTURED_RESULT',
):InnerAgentEvidence{
 const reasons=[...new Set(Array.isArray(reason)?reason:[reason])];
 return innerEvidenceSchema.parse({
  protocol:'threadport.inner-agent-evidence.v1',eventId,kind,sourceProtocol:null,
  resultStatus:'unknown',exitCode:null,applicability:'unverified',
  workspace:{status:'unverifiable',beforeSnapshotId:null,afterSnapshotId:null},
  environment:{scope:null,digest:null,complete:false},reasons,observation:null,
 });
}

export interface InnerObservationContext {
 current:WorkspaceSnapshot;
 /** Snapshot captured before the Agent command/test. */
 before:WorkspaceSnapshot|null;
 /** Snapshot captured after the Agent command/test, when available. */
 after:WorkspaceSnapshot|null;
 /** Expected outer event identity, when evaluating a result attached to an event. */
 eventId?:string;
 kind?:'command'|'test';
}

function innerUnknownReason(value:InnerAgentObservation):InnerEvidenceReason {
 if(value.status==='pending'||value.status==='running')return 'PENDING_TOOL';
 if(value.status==='interrupted')return 'INTERRUPTED';
 if(value.status==='unknown')return 'RESULT_UNKNOWN';
 if(!value.startedAt||!value.completedAt||!value.workspace.afterSnapshotId)return 'PARTIAL_LOG';
 return 'PARTIAL_LOG';
}

/**
 * Classify only a structured inner result.  Missing snapshots and incomplete
 * environment scope remain unknown; workspace drift is stale, and complete
 * evidence whose snapshots still match is current.
 */
export function evaluateInnerObservation(value:InnerAgentObservation, context:InnerObservationContext):InnerAgentEvidence{
 const reasons:InnerEvidenceReason[]=[];
 const workspace={
  status:'unverifiable' as 'matched'|'drifted'|'unverifiable',
  beforeSnapshotId:value.workspace.beforeSnapshotId,afterSnapshotId:value.workspace.afterSnapshotId,
 };
 if(context.eventId!==undefined&&value.eventId!==context.eventId)reasons.push('EVENT_MISMATCH');
 if(context.kind!==undefined&&value.kind!==context.kind)reasons.push('KIND_MISMATCH');
 const workspaceId=context.current.workspaceId;
 const beforeWorkspaceMismatch=context.before!==null&&context.before.workspaceId!==workspaceId;
 const afterWorkspaceMismatch=context.after!==null&&context.after.workspaceId!==workspaceId;
 if(beforeWorkspaceMismatch||afterWorkspaceMismatch||(
   context.before!==null&&context.after!==null&&context.before.workspaceId!==context.after.workspaceId
 ))reasons.push('SNAPSHOT_WORKSPACE_MISMATCH');
 if(value.status==='pending'||value.status==='running'||value.status==='interrupted'||value.status==='unknown'||!value.startedAt||!value.completedAt||!value.workspace.afterSnapshotId){
  reasons.push(innerUnknownReason(value));
 }
 if(!context.before||!value.workspace.beforeSnapshotId){
  reasons.push(value.source.origin==='native-import'?'NATIVE_IMPORT_UNBOUND':'SNAPSHOT_MISSING');
 } else if(context.before.id!==value.workspace.beforeSnapshotId){
  reasons.push('SNAPSHOT_UNVERIFIABLE');
 } else if(!beforeWorkspaceMismatch) {
  const review=compareWorkspaceSnapshots(context.before,context.current);
  workspace.status=review.status;
  if(review.status==='drifted')reasons.push('WORKSPACE_CHANGED');
  if(review.status==='unverifiable')reasons.push('SNAPSHOT_UNVERIFIABLE');
 }
 if(value.workspace.afterSnapshotId&&!context.after)reasons.push('SNAPSHOT_UNVERIFIABLE');
 if(context.before&&context.after&&value.workspace.beforeSnapshotId===context.before.id&&value.workspace.afterSnapshotId===context.after.id&&!beforeWorkspaceMismatch&&!afterWorkspaceMismatch){
  const during=compareWorkspaceSnapshots(context.before,context.after);
  if(during.status!=='matched')reasons.push(during.status==='drifted'?'EXECUTION_WORKSPACE_CHANGED':'SNAPSHOT_UNVERIFIABLE');
 }
 if(!value.environment.complete||value.environment.digest===null){
  reasons.push('ENVIRONMENT_UNKNOWN');
 }
 const uniqueReasons=[...new Set(reasons)];
 let applicability:InnerAgentEvidence['applicability'];
 if(uniqueReasons.some(reason=>['EVENT_MISMATCH','KIND_MISMATCH','DUPLICATE_EVENT'].includes(reason))) applicability='unverified';
 else if(value.source.origin==='native-import'&&(!value.workspace.beforeSnapshotId||!context.before)) applicability='unknown';
 else if(uniqueReasons.some(reason=>['PENDING_TOOL','INTERRUPTED','PARTIAL_LOG','RESULT_UNKNOWN'].includes(reason))) applicability='unverified';
 else if(uniqueReasons.includes('WORKSPACE_CHANGED')||uniqueReasons.includes('EXECUTION_WORKSPACE_CHANGED')) applicability='stale';
 else if(uniqueReasons.length) applicability='unknown';
 else applicability='current';
 return innerEvidenceSchema.parse({
  protocol:'threadport.inner-agent-evidence.v1',eventId:context.eventId??value.eventId,kind:context.kind??value.kind,
  sourceProtocol:value.source.protocol,resultStatus:value.status,exitCode:value.exitCode,
  applicability,workspace,environment:value.environment,reasons:uniqueReasons,observation:value,
 });
}
export const classifyInnerObservation=evaluateInnerObservation;
/** No raw env values are retained. This cannot certify external Agent configuration or child commands. */
export function observeEnvironment():ExecutionObservation['environmentBefore']{
 const values=['PATH','LANG','LC_ALL','NODE_ENV','CI'].map(key=>[key,process.env[key]??null]);
 return {scope:'observer-and-inherited-allowlist.v1',observerNode:process.version,platform:process.platform,arch:process.arch,digest:createHash('sha256').update(JSON.stringify([process.version,process.platform,process.arch,values])).digest('hex'),complete:false};
}
export function observationEvent(value:ExecutionObservation,ordinal:number):NormalizedEvent{
 const id='observed:'+value.id;
 return {id,sessionId:value.sessionId,ordinal,occurredAt:value.startedAt,kind:'command',text:'ThreadPort observed the approved target process only. This is not an observation of commands or tests inside the Agent.',relativePaths:[],omitted:!value.startedAt||!value.completedAt||!value.afterSnapshotId||value.status==='unknown',commandRun:{id,eventId:id,sessionId:value.sessionId,ordinal,command:`Historical target process; launch plan ${value.planDigest} (review record only, not an executable command)`,cwd:null,exitCode:value.exitCode,startedAt:value.startedAt,completedAt:value.completedAt,snapshotId:value.beforeSnapshotId}};
}
