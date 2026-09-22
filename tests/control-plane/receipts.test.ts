import { describe, expect, it } from 'vitest';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { advanceReceipt, createReceipt } from '../../src/control-plane/receipts.js';

const manifest = createContextManifest({
  handoffId: 'handoff-receipt',
  taskId: 'task-receipt',
  taskRevision: 1,
  targetSessionId: 'session-target',
  targetRunId: 'run-target',
  createdAt: '2026-09-20T00:00:00.000Z',
});

const input = {
  handoffId: manifest.handoffId,
  targetSessionId: manifest.targetSessionId!,
  targetRunId: manifest.targetRunId!,
  manifestDigest: manifest.digest,
  stage: 'received' as const,
  nonce: 'receipt-nonce-123456',
  expiresAt: '2026-09-21T00:00:00.000Z',
};

describe('receipt verification integrity', () => {
  it('does not allow an unverified input to create a verified-complete receipt', () => {
    expect(() => createReceipt({ ...input, stage: 'verified-complete' }, { manifest, targetSessionId: 'session-target', targetRunId: 'run-target', now: '2026-09-20T01:00:00.000Z' })).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
  });

  it('requires trusted evidence before advancing to verified-complete', () => {
    const pending = createReceipt(input, { manifest, targetSessionId: 'session-target', targetRunId: 'run-target', now: '2026-09-20T01:00:00.000Z' });
    expect(() => advanceReceipt(pending, 'verified-complete', 'agent-report')).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
    expect(() => advanceReceipt(pending, 'verified-complete', 'threadport')).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
    const withEvidence = { ...pending, evidenceIds: ['evidence-1'] };
    expect(advanceReceipt(withEvidence, 'verified-complete', 'threadport')).toMatchObject({ stage: 'verified-complete', status: 'confirmed', evidenceIds: ['evidence-1'] });
  });
});
