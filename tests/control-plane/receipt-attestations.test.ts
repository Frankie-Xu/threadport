import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { openStore } from '../../src/storage/sqlite-store.js';
import { createContextManifest } from '../../src/control-plane/manifest.js';
import { temporary } from '../helpers.js';

it('confirms only persisted attestations bound to the exact prepared receipt and stage', async () => {
  const dataDir = await temporary();
  const store = await openStore({dataDir});
  const cp = store.controlPlane();
  const manifest = createContextManifest({handoffId:'prepared-h',taskId:'task-1',taskRevision:1,targetSessionId:'s1',targetRunId:'r1'});
  const request = {handoffId:manifest.handoffId,manifestDigest:manifest.digest,targetSessionId:'s1',targetRunId:'r1',stage:'received' as const,nonce:'approved-nonce-123456',expiresAt:'2099-01-01T00:00:00.000Z'};
  try {
    cp.saveManifest(manifest);
    const receipt = cp.saveReceipt(request);
    const other = cp.saveReceipt({...request,nonce:'another-nonce-123456'});
    const binding = {receiptId:receipt.receiptId,taskId:manifest.taskId,handoffId:manifest.handoffId,manifestDigest:manifest.digest,targetSessionId:'s1',targetRunId:'r1'};
    const verification = {...binding,stage:'verified-complete' as const};
    for (const patch of [{taskId:'other-task'},{targetSessionId:'other-session'},{targetRunId:'other-run'},{manifestDigest:'b'.repeat(64)}]) {
      expect(() => cp.recordReceiptAttestation({...verification,...patch})).toThrow(expect.objectContaining({code:'RECEIPT_TARGET_MISMATCH'}));
    }
    const claim = {receiptId:receipt.receiptId,stage:'verified-complete' as const};
    const unrelated = cp.recordReceiptAttestation({...verification,receiptId:other.receiptId});
    const observed = cp.recordReceiptAttestation({...binding,stage:'received'});
    for (const id of [unrelated,observed,'nonexistent']) {
      expect(() => cp.confirmReceipt({...claim,evidenceIds:[id]})).toThrow(expect.objectContaining({code:'RECEIPT_VERIFICATION_REQUIRED'}));
    }
    const received = cp.confirmReceipt({receiptId:receipt.receiptId,stage:'received',evidenceIds:[observed]});
    expect(received).toMatchObject({stage:'received',status:'confirmed',evidenceIds:[observed]});
    const proof = cp.recordReceiptAttestation(verification);
    expect(() => cp.confirmReceipt({...claim,evidenceIds:[proof,'nonexistent']})).toThrow(expect.objectContaining({code:'RECEIPT_VERIFICATION_REQUIRED'}));
    const confirmed = cp.confirmReceipt({...claim,evidenceIds:[proof]});
    expect(confirmed).toMatchObject({stage:'verified-complete',status:'confirmed',evidenceIds:[proof]});
    expect(cp.confirmReceipt({...claim,evidenceIds:[proof]})).toEqual(confirmed);
    expect(cp.saveReceipt(request)).toEqual(confirmed);
    expect(() => cp.confirmReceipt({receiptId:receipt.receiptId,stage:'received',evidenceIds:[observed]})).toThrow(expect.objectContaining({code:'REVISION_CONFLICT'}));
  } finally { store.close(); }
  const reopened = await openStore({dataDir});
  try {
    const receipts = reopened.controlPlane().listReceiptsForTask(manifest.taskId);
    expect(receipts).toEqual(expect.arrayContaining([expect.objectContaining({stage:'verified-complete',status:'confirmed'})]));
  } finally { reopened.close(); }
});

it('does not inherit trust from a legacy confirmed summary without attestations', async () => {
  const dataDir = await temporary(), store = await openStore({dataDir});
  const cp = store.controlPlane();
  try {
    const manifest = createContextManifest({handoffId:'h',taskId:'task',taskRevision:1,targetSessionId:'s',targetRunId:'r'});
    cp.saveManifest(manifest);
    const receipt = cp.saveReceipt({handoffId:'h',manifestDigest:manifest.digest,targetSessionId:'s',targetRunId:'r',stage:'received',nonce:'legacy-nonce-123456',expiresAt:'2099-01-01T00:00:00.000Z'});
    const db = new Database(join(dataDir,'threadport.sqlite'));
    try {
      db.prepare("UPDATE handoff_receipts SET stage='verified-complete',status='confirmed',confirmed_at=?,evidence_ids_json=? WHERE receipt_id=?")
        .run(receipt.createdAt,'["spoofed-proof"]',receipt.receiptId);
    } finally { db.close(); }
    expect(cp.listReceipts('h')).toEqual([expect.objectContaining({stage:'reported-complete',status:'unknown',confirmedAt:null})]);
  } finally { store.close(); }
});
