import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { advanceReceipt, createReceipt, validateReceipt } from '../../src/control-plane/receipts.js';

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
  it('rejects unknown transition stages and sources even for terminal receipts',()=>{
    const now='2026-09-20T01:00:00.000Z',pending=createReceipt(input,{manifest,targetSessionId:'session-target',targetRunId:'run-target',now});
    for(const receipt of [pending,{...pending,status:'expired' as const}]){
      expect(()=>advanceReceipt(receipt,'imaginary' as never,'runtime',now)).toThrowError(ZodError);
      expect(()=>advanceReceipt(receipt,'accepted','untrusted-source' as never,now)).toThrowError(ZodError);
    }
    expect(advanceReceipt(pending,'accepted','agent-report',now).status).toBe('unknown');
  });
  it('does not advance receipts at or beyond their deadline and preserves the original record',()=>{
    const pending=createReceipt(input,{manifest,targetSessionId:'session-target',targetRunId:'run-target',now:'2026-09-20T01:00:00.000Z'});
    for(const now of [input.expiresAt,'2026-09-22T00:00:00.000Z'])expect(advanceReceipt(pending,'accepted','runtime',now)).toMatchObject({status:'expired',stage:'received',confirmedAt:null});
    expect(pending.status).toBe('pending');
    expect(advanceReceipt(pending,'accepted','runtime','2026-09-20T02:00:00.000Z')).toMatchObject({status:'confirmed',stage:'accepted',confirmedAt:'2026-09-20T02:00:00.000Z'});
  });
  it('rejects invalid injected clocks instead of bypassing expiry with NaN',()=>{
    for(const now of ['tomorrow','2026-09-20T01:00:00+99:99'])expect(()=>validateReceipt(input,{manifest,targetSessionId:'session-target',targetRunId:'run-target',now})).toThrow();
  });
  it('binds receipts to the manifest handoff and target even if caller context agrees with a different identity',()=>{
    const context={manifest,targetSessionId:'session-target',targetRunId:'run-target',now:'2026-09-20T01:00:00.000Z'};
    expect(()=>createReceipt({...input,handoffId:'other-handoff'},context)).toThrowError(expect.objectContaining({code:'RECEIPT_TARGET_MISMATCH'}));
    expect(()=>createReceipt({...input,targetSessionId:'other',targetRunId:'other'},{...context,targetSessionId:'other',targetRunId:'other'})).toThrowError(expect.objectContaining({code:'RECEIPT_TARGET_MISMATCH'}));
    const unbound=createContextManifest({handoffId:manifest.handoffId,taskId:manifest.taskId,taskRevision:1});
    expect(()=>createReceipt({...input,manifestDigest:unbound.digest},{...context,manifest:unbound})).toThrowError(expect.objectContaining({code:'RECEIPT_TARGET_MISMATCH'}));
  });
  it('does not allow an unverified input to create a verified-complete receipt', () => {
    expect(() => createReceipt({ ...input, stage: 'verified-complete' }, { manifest, targetSessionId: 'session-target', targetRunId: 'run-target', now: '2026-09-20T01:00:00.000Z' })).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
  });

  it('requires trusted evidence before advancing to verified-complete', () => {
    const pending = createReceipt(input, { manifest, targetSessionId: 'session-target', targetRunId: 'run-target', now: '2026-09-20T01:00:00.000Z' });
    expect(() => advanceReceipt(pending, 'verified-complete', 'agent-report','2026-09-20T01:00:00.000Z')).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
    expect(() => advanceReceipt(pending, 'verified-complete', 'threadport','2026-09-20T01:00:00.000Z')).toThrowError(expect.objectContaining({ code: 'RECEIPT_VERIFICATION_REQUIRED' }));
    const withEvidence = { ...pending, evidenceIds: ['evidence-1'] };
    expect(advanceReceipt(withEvidence, 'verified-complete', 'threadport','2026-09-20T01:00:00.000Z')).toMatchObject({ stage: 'verified-complete', status: 'confirmed', evidenceIds: ['evidence-1'] });
  });
});
