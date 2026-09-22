import { describe, expect, it } from 'vitest';
import { advanceReceipt } from '../../src/control-plane/receipts.js';
import type { ReceiptSummary } from '../../src/control-plane/contracts.js';

const receipt = (): ReceiptSummary => ({
  receiptId: 'receipt-1', handoffId: 'handoff-1', targetSessionId: 'session-2', targetRunId: 'run-2',
  manifestDigest: 'a'.repeat(64), stage: 'received', status: 'pending', nonce: 'nonce-1234567890',
  expiresAt: '2026-09-30T00:00:00.000Z', createdAt: '2026-09-20T00:00:00.000Z', confirmedAt: null, evidenceIds: []
});

describe('receipt evidence boundaries', () => {
  it('rejects an agent report that claims verified completion', () => {
    expect(() => advanceReceipt(receipt(), 'verified-complete', 'agent-report'))
      .toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
  });
});
