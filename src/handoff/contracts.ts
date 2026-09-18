import { z } from 'zod';
import { createHash } from 'node:crypto';
import { capsuleSchema } from '../capsule.js';
import { snapshotReasonSchema } from '../workspace/contracts.js';
import { innerEvidenceSchema } from '../evidence/observations.js';
export const idSchema=z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9:._-]*$/);
export const prepareSchema=z.object({taskId:idSchema,sourceSessionId:idSchema,target:z.enum(['claude','codex']),mode:z.enum(['native-resume','new-session']),workspaceId:idSchema}).strict();
export type PrepareInput=z.infer<typeof prepareSchema>;
/** Public handoff projection. The raw structured vendor payload is deliberately omitted. */
export const innerEvidenceSummarySchema=z.object({
 eventId:idSchema,kind:z.enum(['command','test']),sourceProtocol:z.string().min(1).nullable(),
 resultStatus:z.enum(['succeeded','passed','failed','running','pending','interrupted','unknown']),
 applicability:z.enum(['current','stale','unverified','unknown']),
 workspace:z.object({status:z.enum(['matched','drifted','unverifiable']),beforeSnapshotId:idSchema.nullable(),afterSnapshotId:idSchema.nullable()}).strict(),
 environment:z.object({scope:z.string().min(1).nullable(),complete:z.boolean()}).strict(),
 reasons:z.array(z.string().min(1)),
}).strict();
export type InnerEvidenceSummary=z.infer<typeof innerEvidenceSummarySchema>;
export function summarizeInnerEvidence(value:z.infer<typeof innerEvidenceSchema>):InnerEvidenceSummary{
 return innerEvidenceSummarySchema.parse({eventId:value.eventId,kind:value.kind,sourceProtocol:value.sourceProtocol,resultStatus:value.resultStatus,applicability:value.applicability,workspace:value.workspace,environment:{scope:value.environment.scope,complete:value.environment.complete},reasons:value.reasons});
}
const claim=z.object({text:z.string(),origin:z.enum(['observed','user-confirmed','derived','unknown']),evidence:z.array(z.object({sessionId:idSchema,eventId:idSchema}).strict()),updatedAt:z.string().datetime().nullable()}).strict();
export const taskHandoffSchema=prepareSchema.extend({protocol:z.literal('threadport.task-handoff.v1'),id:z.string().uuid(),taskRevision:z.number().int().positive().safe(),createdAt:z.string().datetime(),expiresAt:z.string().datetime(),capsule:capsuleSchema,claims:z.array(claim),verification:z.object({status:z.enum(['matched','drifted','unverifiable']),snapshotId:idSchema,workspaceId:idSchema,verifiedAt:z.string().datetime(),scope:z.literal('head-tracked-diff-untracked'),reasons:z.array(z.object({code:z.union([snapshotReasonSchema,z.enum(['HEAD_CHANGED','CONTENT_CHANGED','SCOPE_CHANGED'])]),message:z.string(),path:z.string().optional()}).strict())}).strict(),innerEvidence:z.array(innerEvidenceSummarySchema).default([]),prompt:z.string().refine(value=>Buffer.byteLength(value,'utf8')<=32768),promptDigest:z.string().regex(/^[a-f0-9]{64}$/),omissions:z.array(z.string())}).strict();
export type TaskHandoff=z.infer<typeof taskHandoffSchema>;
export const confirmSchema=z.object({id:z.string().uuid(),promptDigest:z.string().regex(/^[a-f0-9]{64}$/),acknowledgeUncertainty:z.boolean()}).strict();
export type ConfirmInput=z.infer<typeof confirmSchema>;
export function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
export const sha256=(text:string)=>createHash('sha256').update(text).digest('hex');
