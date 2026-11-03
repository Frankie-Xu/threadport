export { controlEventSchema, sourceSchema, safePayloadSchema, contextManifestSchema, receiptInputSchema, receiptSummarySchema, manifestStatusSchema } from './contracts.js';
export type { ControlEvent, ContextManifestV1, ReceiptInput, ReceiptSummary, SafePayload } from './contracts.js';

import { z } from 'zod';
import { controlIdSchema, receiptStageSchema, safePayloadSchema, runPayloadSchema, lineagePayloadSchema, responsibilityPayloadSchema, attentionPayloadSchema } from './contracts.js';
export { runPayloadSchema, lineagePayloadSchema, responsibilityPayloadSchema, attentionPayloadSchema } from './contracts.js';

export const receiptPayloadSchema = z.object({ receiptId: controlIdSchema.optional(), handoffId: controlIdSchema.optional(), targetSessionId: controlIdSchema.optional(), targetRunId: controlIdSchema.optional(), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), stage: receiptStageSchema.optional(), nonce: z.string().max(256).optional(), expiresAt: z.string().datetime({offset:true}).optional(), status: z.enum(['pending','confirmed','rejected','unknown','expired']).optional() }).strict();
export function parseControlPayload(type: string, value: unknown): unknown {
  if (type.startsWith('run.')) return runPayloadSchema.parse(value);
  if (type === 'lineage.relation') return lineagePayloadSchema.parse(value);
  if (type.startsWith('responsibility.')) return responsibilityPayloadSchema.parse(value);
  if (type.startsWith('receipt.')) return receiptPayloadSchema.parse(value);
  if (type.startsWith('attention.')) return attentionPayloadSchema.parse(value);
  return safePayloadSchema.parse(value);
}
