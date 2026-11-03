import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { receiptInputSchema, receiptSummarySchema, receiptStageSchema, type ReceiptInput, type ReceiptSummary, type ContextManifestV1, canonicalDigest } from './contracts.js';
import { assertManifestDigest } from './manifest.js';
import { DomainError } from '../domain/errors.js';
import { isoTimestampSchema } from '../contracts/timestamp.js';
export interface ReceiptContext { manifest: ContextManifestV1; targetSessionId: string; targetRunId: string; now?: string }
export function receiptStageOrder(stage: ReceiptInput['stage']): number { return receiptStageSchema.options.indexOf(stage); }
export function sameReceiptIdentity(left: ReceiptInput, right: ReceiptInput): boolean {
  return left.handoffId===right.handoffId && left.targetSessionId===right.targetSessionId && left.targetRunId===right.targetRunId
    && left.manifestDigest===right.manifestDigest && left.nonce===right.nonce && left.expiresAt===right.expiresAt;
}
const transitionSourceSchema=z.enum(['runtime','threadport','user','agent-report']);
export function receiptDigest(input: ReceiptInput): string { return canonicalDigest(input); }
export function assertReceiptInputAllowed(input: ReceiptInput): void {
  if (input.stage === 'verified-complete') throw new DomainError('RECEIPT_VERIFICATION_REQUIRED','A verified-complete receipt requires trusted evidence.');
}
export function validateReceipt(input: ReceiptInput, context: ReceiptContext): ReceiptInput {
  const receipt = receiptInputSchema.parse(input); assertManifestDigest(context.manifest);
  assertReceiptInputAllowed(receipt);
  if (receipt.manifestDigest !== context.manifest.digest) throw new DomainError('RECEIPT_DIGEST_MISMATCH','Receipt manifest digest does not match the prepared manifest.');
  if (receipt.handoffId!==context.manifest.handoffId||receipt.targetSessionId!==context.manifest.targetSessionId||receipt.targetRunId!==context.manifest.targetRunId||receipt.targetSessionId !== context.targetSessionId || receipt.targetRunId !== context.targetRunId) throw new DomainError('RECEIPT_TARGET_MISMATCH','Receipt handoff or target does not match the prepared manifest.');
  const now = Date.parse(isoTimestampSchema.parse(context.now ?? new Date().toISOString())); if (Date.parse(receipt.expiresAt) <= now) throw new DomainError('REVISION_CONFLICT','Receipt has expired.');
  return receipt;
}
export function createReceipt(input: ReceiptInput, context: ReceiptContext): ReceiptSummary {
  const receipt = validateReceipt(input, context); const createdAt = context.now ?? new Date().toISOString();
  return receiptSummarySchema.parse({ ...receipt, receiptId:`receipt-${randomUUID()}`, status:'pending', createdAt, confirmedAt:null, evidenceIds:[] });
}
export function advanceReceipt(current: ReceiptSummary, nextStage: ReceiptInput['stage'], source: 'runtime'|'threadport'|'user'|'agent-report' = 'threadport', now=new Date().toISOString()): ReceiptSummary {
  receiptStageSchema.parse(nextStage);transitionSourceSchema.parse(source);
  const receipt = receiptSummarySchema.parse(current),clock=isoTimestampSchema.parse(now); if (receipt.status === 'expired' || receipt.status === 'rejected') return receipt;
  if (receipt.status === 'confirmed' && receipt.stage === 'verified-complete') return receipt;
  if(Date.parse(receipt.expiresAt)<=Date.parse(clock))return {...receipt,status:'expired'};
  if (receiptStageOrder(nextStage) < receiptStageOrder(receipt.stage)) throw new DomainError('REVISION_CONFLICT','Receipt stages cannot move backwards.');
  if (nextStage === 'verified-complete') throw new DomainError('RECEIPT_VERIFICATION_REQUIRED','A verified-complete receipt requires trusted evidence.');
  const status = source === 'agent-report' ? 'unknown' : 'confirmed';
  return { ...receipt, stage: nextStage, status, confirmedAt: status === 'confirmed' ? clock : receipt.confirmedAt };
}
