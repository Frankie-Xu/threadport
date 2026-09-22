import { randomUUID } from 'node:crypto';
import { receiptInputSchema, receiptSummarySchema, type ReceiptInput, type ReceiptSummary, type ContextManifestV1, canonicalDigest } from './contracts.js';
import { assertManifestDigest } from './manifest.js';
import { DomainError } from '../domain/errors.js';
export interface ReceiptContext { manifest: ContextManifestV1; targetSessionId: string; targetRunId: string; now?: string }
const order = ['prepared','authorized','transported','received','accepted','observed-start','reported-complete','verified-complete'] as const;
export function receiptDigest(input: ReceiptInput): string { return canonicalDigest(input); }
export function validateReceipt(input: ReceiptInput, context: ReceiptContext): ReceiptInput {
  const receipt = receiptInputSchema.parse(input); assertManifestDigest(context.manifest);
  if (receipt.manifestDigest !== context.manifest.digest) throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt manifest digest does not match the prepared manifest.');
  if (receipt.targetSessionId !== context.targetSessionId || receipt.targetRunId !== context.targetRunId) throw new DomainError('RECEIPT_TARGET_MISMATCH','Receipt target does not match the prepared target.');
  const now = Date.parse(context.now ?? new Date().toISOString()); if (Date.parse(receipt.expiresAt) <= now) throw new DomainError('REVISION_CONFLICT','Receipt has expired.');
  return receipt;
}
export function createReceipt(input: ReceiptInput, context: ReceiptContext): ReceiptSummary {
  const receipt = validateReceipt(input, context); const createdAt = context.now ?? new Date().toISOString();
  return receiptSummarySchema.parse({ ...receipt, receiptId:`receipt-${randomUUID()}`, status:'pending', createdAt, confirmedAt:null, evidenceIds:[] });
}
export function advanceReceipt(current: ReceiptSummary, nextStage: ReceiptInput['stage'], source: 'runtime'|'threadport'|'user'|'agent-report' = 'threadport'): ReceiptSummary {
  const receipt = receiptSummarySchema.parse(current); if (receipt.status === 'expired' || receipt.status === 'rejected') return receipt;
  if (source === 'agent-report' && nextStage === 'verified-complete') throw new DomainError('RECEIPT_VERIFICATION_REQUIRED','Agent-reported completion requires independent verification evidence.');
  const currentIndex = order.indexOf(receipt.stage), nextIndex = order.indexOf(nextStage); if (nextIndex < currentIndex) throw new DomainError('REVISION_CONFLICT','Receipt stages cannot move backwards.');
  const status = source === 'agent-report' ? 'unknown' : 'confirmed';
  return { ...receipt, stage: nextStage, status, confirmedAt: status === 'confirmed' ? new Date().toISOString() : receipt.confirmedAt };
}
