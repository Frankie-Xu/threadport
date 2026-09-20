export { controlEventSchema, sourceSchema, safePayloadSchema, contextManifestSchema, receiptInputSchema, receiptSummarySchema, manifestStatusSchema } from './contracts.js';
export type { ControlEvent, ContextManifestV1, ReceiptInput, ReceiptSummary, SafePayload } from './contracts.js';

import { z } from 'zod';
import { controlIdSchema, receiptStageSchema, safePayloadSchema } from './contracts.js';

export const runPayloadSchema = z.object({ reason: z.string().max(2000).nullable().optional(), exitCode: z.number().int().safe().nullable().optional() }).strict();
export const lineagePayloadSchema = z.object({ id: controlIdSchema.optional(), parentSessionId: controlIdSchema, childSessionId: controlIdSchema, relation: z.enum(['fork','delegate','handoff','resume','compact','host-move','manual-takeover']), evidenceLevel: z.enum(['runtime-explicit','trusted-integration','user-confirmed','inferred']).optional(), status: z.enum(['candidate','confirmed','rejected']).optional() }).strict();
export const responsibilityPayloadSchema = z.object({ id: controlIdSchema.optional(), responsibilityId: controlIdSchema.optional(), taskId: controlIdSchema.optional(), ownerSessionId: controlIdSchema.optional(), scope: z.string().max(160).optional(), roles: z.record(controlIdSchema).optional() }).strict();
export const attentionPayloadSchema = z.object({ id: controlIdSchema.optional(), kind: z.string().max(160).optional(), severity: z.enum(['info','warning','error']).optional(), message: z.string().max(2000).optional() }).strict();
export const receiptPayloadSchema = z.object({ receiptId: controlIdSchema.optional(), handoffId: controlIdSchema.optional(), targetSessionId: controlIdSchema.optional(), targetRunId: controlIdSchema.optional(), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), stage: receiptStageSchema.optional(), nonce: z.string().max(256).optional(), expiresAt: z.string().datetime({offset:true}).optional(), status: z.enum(['pending','confirmed','rejected','unknown','expired']).optional() }).strict();
export function parseControlPayload(type: string, value: unknown): unknown {
  if (type.startsWith('run.')) return runPayloadSchema.parse(value);
  if (type === 'lineage.relation') return lineagePayloadSchema.parse(value);
  if (type.startsWith('responsibility.')) return responsibilityPayloadSchema.parse(value);
  if (type.startsWith('receipt.')) return receiptPayloadSchema.parse(value);
  if (type.startsWith('attention.')) return attentionPayloadSchema.parse(value);
  return safePayloadSchema.parse(value);
}
