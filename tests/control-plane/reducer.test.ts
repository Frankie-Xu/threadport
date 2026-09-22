import { describe, expect, it } from 'vitest';
import { applyControlEvent, rebuildControlState, emptyControlState } from '../../src/control-plane/reducer.js';
import type { ControlEvent } from '../../src/control-plane/contracts.js';
import { createContextManifest } from '../../src/control-plane/manifest.js';
const event = (patch: Partial<ControlEvent>): ControlEvent => ({
 eventId: 'e-1', protocol: 'threadport.control-event.v1', occurredAt: '2026-09-20T00:00:00.000Z', recordedAt: '2026-09-20T00:00:00.000Z',
 source: { kind: 'runtime', sourceId: 'src', parserVersion: '1', coverage: 'full' }, taskId: 'task', sessionId: 's1', runId: 'r1', ordinal: 1,
 type: 'run.started', payload: {}, idempotencyKey: null, evidenceIds: ['e-1'], ...patch
});
describe('control plane reducer', () => {
 it('rebuilds observed run state and keeps agent reports unverified', () => {
  const state = rebuildControlState([event({ type: 'run.started' }), event({ eventId: 'e-2', type: 'run.ended', ordinal: 2, evidenceIds: ['e-2'], source: { kind: 'agent-report', sourceId: 'src', parserVersion: '1', coverage: 'partial' } })]);
  expect(state.sessions.s1).toMatchObject({ runState: 'ended', health: 'unverified', lastEvidenceId: 'e-2' });
 });
 it('never promotes inferred lineage or agent reports to confirmed', () => {
  const candidate = event({ eventId: 'e-3', type: 'lineage.relation', payload: { parentSessionId: 's1', childSessionId: 's2', relation: 'handoff', evidenceLevel: 'inferred', status: 'candidate' } });
  const reported = event({ eventId: 'e-4', type: 'lineage.relation', payload: { parentSessionId: 's1', childSessionId: 's2', relation: 'handoff', evidenceLevel: 'runtime-explicit', status: 'confirmed' }, source: { kind: 'agent-report', sourceId: 'src', parserVersion: '1', coverage: 'partial' } });
  const state = rebuildControlState([candidate, reported]);
  expect(state.lineage[0].status).toBe('candidate');
 });
 it('deduplicates replay and produces the same projection incrementally or from rebuild', () => {
  const events = [event({}), event({ eventId: 'e-2', ordinal: 2, type: 'run.waiting' }), event({ eventId: 'e-3', ordinal: 3, type: 'run.interrupted' })];
  let incremental = emptyControlState(); for (const item of [events[2], events[0], events[1], events[1]]) incremental = applyControlEvent(incremental, item);
  expect(incremental).toEqual(rebuildControlState(events));
 });
 it('does not create a child lineage edge for compaction', () => {
  const state = rebuildControlState([event({
   eventId: 'compact-1', type: 'lineage.relation',
   payload: { parentSessionId: 's1', childSessionId: 's2', relation: 'compact', evidenceLevel: 'runtime-explicit', status: 'confirmed' }
  })]);
  expect(state.lineage).toEqual([]);
 });
 it('surfaces conflicting replay IDs during a full rebuild', () => {
  const first = event({ eventId: 'same-id', type: 'run.started' });
  const second = event({ eventId: 'same-id', type: 'run.ended', ordinal: 2 });
  const state = rebuildControlState([first, second]);
  expect(state.attention).toEqual(expect.arrayContaining([
   expect.objectContaining({ kind: 'event-conflict', severity: 'error' })
  ]));
 });
  it('does not mark an agent-reported verified completion as confirmed', () => {
   const manifest = createContextManifest({ handoffId: 'h-agent-min', taskId: 'task', taskRevision: 1, targetSessionId: 's1', targetRunId: 'r1', createdAt: '2026-09-20T00:00:00.000Z' });
   const state = rebuildControlState([event({
    eventId: 'agent-manifest', type: 'manifest.saved', evidenceIds: ['agent-manifest'], payload: { handoffId: manifest.handoffId, manifest }
   }), event({
    eventId: 'agent-receipt', type: 'receipt.confirmed',
    source: { kind: 'agent-report', sourceId: 'src', parserVersion: '1', coverage: 'partial' },
    payload: { receipt: { receiptId: 'receipt-1', handoffId: manifest.handoffId, targetSessionId: 's1', targetRunId: 'r1', manifestDigest: manifest.digest, stage: 'verified-complete', nonce: 'agent-receipt-nonce', expiresAt: '2026-09-21T00:00:00.000Z' } }
   })]);
   expect(state.receipts['receipt-1']).toMatchObject({ status: 'unknown' });
  });
  it('downgrades an agent-reported verified stage and keeps an attention item', () => {
   const prepared = createContextManifest({ handoffId: 'h-agent', taskId: 'task', taskRevision: 1, targetSessionId: 's1', targetRunId: 'r1', createdAt: '2026-09-20T00:00:00.000Z' });
   const state = rebuildControlState([
    event({ eventId: 'manifest-agent', ordinal: 0, type: 'manifest.saved', evidenceIds: ['manifest-agent'], payload: { handoffId: prepared.handoffId, manifest: prepared } }),
    event({ eventId: 'agent-verified', ordinal: 1, type: 'receipt.confirmed', source: { kind: 'agent-report', sourceId: 'agent', parserVersion: '1', coverage: 'partial' }, evidenceIds: ['agent-verified'], payload: { receipt: { receiptId: 'receipt-agent', handoffId: 'h-agent', targetSessionId: 's1', targetRunId: 'r1', manifestDigest: prepared.digest, stage: 'verified-complete', nonce: 'agent-nonce-123456', expiresAt: '2026-09-21T00:00:00.000Z' } } }),
   ]);
   expect(state.receipts['receipt-agent']).toMatchObject({ stage: 'reported-complete', status: 'unknown' });
   expect(state.attention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'unverified-completion', status: 'open' })]));
  });
  it('requires a valid manifest, target and evidence before confirming a receipt', () => {
   const prepared = createContextManifest({ handoffId: 'h-valid', taskId: 'task', taskRevision: 1, targetSessionId: 's1', targetRunId: 'r1', createdAt: '2026-09-20T00:00:00.000Z' });
   const base = { receiptId: 'receipt-valid', handoffId: 'h-valid', targetSessionId: 's1', targetRunId: 'r1', manifestDigest: prepared.digest, stage: 'received' as const, nonce: 'valid-nonce-123456', expiresAt: '2026-09-21T00:00:00.000Z' };
   const valid = rebuildControlState([
    event({ eventId: 'manifest-valid', type: 'manifest.saved', evidenceIds: ['manifest-valid'], payload: { handoffId: 'h-valid', manifest: prepared } }),
    event({ eventId: 'receipt-valid-event', type: 'receipt.confirmed', evidenceIds: ['receipt-valid-event'], payload: { receipt: base } }),
   ]);
   expect(valid.receipts['receipt-valid']).toMatchObject({ status: 'confirmed', stage: 'received' });
   const verified = rebuildControlState([
    event({ eventId: 'manifest-verified', ordinal: 0, type: 'manifest.saved', evidenceIds: ['manifest-verified'], payload: { handoffId: 'h-valid', manifest: prepared } }),
    event({ eventId: 'receipt-verified-event', ordinal: 1, type: 'receipt.confirmed', evidenceIds: ['receipt-verified-event'], payload: { receipt: { ...base, stage: 'verified-complete', nonce: 'verified-nonce-123456' } } }),
   ]);
   expect(verified.receipts['receipt-valid']).toMatchObject({ status: 'confirmed', stage: 'verified-complete' });
   const forged = rebuildControlState([
    event({ eventId: 'manifest-valid', type: 'manifest.saved', evidenceIds: ['manifest-valid'], payload: { handoffId: 'h-valid', manifest: prepared } }),
    event({ eventId: 'receipt-forged-event', type: 'receipt.confirmed', evidenceIds: [], payload: { receipt: { ...base, manifestDigest: 'b'.repeat(64), targetSessionId: 'wrong' } } }),
   ]);
   expect(forged.receipts['receipt-valid']).toMatchObject({ status: 'unknown' });
   expect(forged.attention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'receipt-integrity' })]));
  });
 it('ends a confirmed responsibility only on an explicit ended event', () => {
  const base = event({ eventId: 'responsibility-1', type: 'responsibility.confirmed', taskId: 'task', payload: { id: 'resp-1', ownerSessionId: 's1', scope: 'task', roles: { executor: 's1' } } });
  const ended = event({ eventId: 'responsibility-2', type: 'responsibility.ended', taskId: 'task', ordinal: 2, payload: { id: 'resp-1', ownerSessionId: 's1', scope: 'task' } });
  expect(rebuildControlState([base, ended]).responsibilities[0]).toMatchObject({ id: 'resp-1', status: 'ended', roles: { executor: 's1' } });
 });
 it('does not let an agent report overwrite a confirmed executor', () => {
  const confirmed = event({ eventId: 'responsibility-3', type: 'responsibility.confirmed', taskId: 'task', payload: { id: 'resp-2', ownerSessionId: 's1', scope: 'task', roles: { executor: 's1' } } });
  const report = event({ eventId: 'responsibility-4', type: 'responsibility.proposed', taskId: 'task', ordinal: 2, source: { kind: 'agent-report', sourceId: 'src', parserVersion: '1', coverage: 'partial' }, payload: { id: 'resp-2', ownerSessionId: 's2', scope: 'task', roles: { executor: 's2' } } });
  expect(rebuildControlState([confirmed, report]).responsibilities[0]).toMatchObject({ status: 'confirmed', roles: { executor: 's1' } });
 });
});
