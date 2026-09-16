import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
const id=z.string().min(1).max(512);
export const bindingSchema=z.object({id,projectId:id,canonicalRoot:z.string().min(1).max(32768)}).strict();
export type WorkspaceBinding=z.infer<typeof bindingSchema>;
export const snapshotReasonSchema=z.enum(['WORKSPACE_UNBOUND','SOURCE_MISSING','READ_FAILED','LIMIT_EXCEEDED','RACED','NO_GIT','NO_COMMIT','SENSITIVE_EXCLUDED','SUBMODULE_UNSUPPORTED','PATH_ENCODING_UNSUPPORTED','SYMLINK_OUTSIDE','SYMLINK_UNSUPPORTED']);
export type SnapshotReason=z.infer<typeof snapshotReasonSchema>;
const digest=z.string().regex(/^[a-f0-9]{64}$/).nullable();
export const snapshotSchema=z.object({
 id,workspaceId:id,capturedAt:z.string().datetime(),head:z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/).nullable(),
 digest,bindingDigest:digest,algorithm:z.enum(['threadport.workspace.raw.v1','threadport.workspace.raw.v2']),policy:z.literal('threadport.workspace.scope.v1').optional(),omissions:z.array(z.object({reason:z.union([snapshotReasonSchema,z.literal('GIT_IGNORED')]),count:z.number().int().positive()}).strict()).max(20).optional(),scope:z.literal('head-tracked-diff-untracked'),
 incompleteReasons:z.array(snapshotReasonSchema).max(12),
}).strict().refine(value=>value.algorithm==='threadport.workspace.raw.v1'||(value.policy!==undefined&&value.omissions!==undefined)).refine(value=>value.incompleteReasons.length ? value.digest===null : value.digest!==null&&value.head!==null&&value.bindingDigest!==null);
export type WorkspaceSnapshot=z.infer<typeof snapshotSchema>;
export const limitSchema=z.object({maxFiles:z.number().int().min(1).max(10000).default(10000),maxBytes:z.number().int().min(1).max(64*1024*1024).default(64*1024*1024)}).strict();
export interface CaptureOptions {limits?:{maxFiles?:number;maxBytes?:number};signal?:AbortSignal}
export function workspaceInput<T extends z.ZodTypeAny>(schema:T,input:unknown):z.output<T>{
 const result=schema.safeParse(input);if(!result.success)throw new DomainError('INVALID_INPUT','Invalid workspace snapshot input.');return result.data;
}
export type VerificationReasonCode=SnapshotReason|'HEAD_CHANGED'|'CONTENT_CHANGED'|'SCOPE_CHANGED';
export interface VerificationReport {
 status:'matched'|'drifted'|'unverifiable';
 snapshotId:string;
 workspaceId:string;
 verifiedAt:string;
 scope:WorkspaceSnapshot['scope'];
 reasons:Array<{code:VerificationReasonCode;message:string;path?:string}>;
}
