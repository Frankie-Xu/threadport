import { z } from 'zod';
const id=z.string().min(1).max(512);
const relativePath=z.string().min(1).max(1024).refine(value=>!value.startsWith('/')&&!value.includes('\\')&&!/^[A-Za-z]:/.test(value)&&value.split('/').every(part=>part!=='.'&&part!=='..'&&part!==''));
export const assertionScope=z.object({workspaceId:id.nullable(),path:relativePath.nullable()}).strict().refine(value=>value.path===null||value.workspaceId!==null);
export const assertionInput=z.object({
 kind:z.enum(['decision','constraint']),topic:z.string().trim().min(1).max(80),text:z.string().trim().min(1).max(2000),
 scope:assertionScope,confirmed:z.boolean().default(false),applicability:z.enum(['applicable','unknown']).default('applicable'),
 supersedes:z.array(z.string().uuid()).max(200).default([]),source:z.object({sessionId:id,eventId:id}).strict().nullable().default(null),
}).strict();
export type AssertionInput=z.input<typeof assertionInput>;
export const assertionSchema=assertionInput.omit({confirmed:true}).extend({
 disputedWith:z.array(z.string().uuid()).max(200).default([]),protocol:z.literal('threadport.assertion.v1'),id:z.string().uuid(),taskId:id,revision:z.number().int().positive(),taskRevision:z.number().int().positive(),
 state:z.enum(['candidate','confirmed','rejected','superseded']),origin:z.enum(['manual','user-message','assistant-message','file-change','command']),
 sourceDigest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
}).strict();
export type Assertion=z.infer<typeof assertionSchema>;
export type AssertionView=Assertion&{sourceAvailability:'none'|'indexed-only'|'unavailable'};
