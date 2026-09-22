import { describe, expect, it } from 'vitest';
import { applyControlEvent, rebuildControlState, emptyControlState } from '../../src/control-plane/reducer.js';
import type { ControlEvent } from '../../src/control-plane/contracts.js';
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
  const state = rebuildControlState([event({
   eventId: 'agent-receipt', type: 'receipt.confirmed',
   source: { kind: 'agent-report', sourceId: 'src', parserVersion: '1', coverage: 'partial' },
   payload: { receiptId: 'receipt-1', stage: 'verified-complete', status: 'confirmed' }
  })]);
  expect(state.receipts['receipt-1']).toMatchObject({ status: 'unknown' });
 });
 it('does not confirm a receipt event without a prepared manifest binding', () => {
  const state = rebuildControlState([event({
   eventId: 'forged-runtime-receipt', type: 'receipt.confirmed',
   payload: { receipt: { receiptId: 'receipt-forged', handoffId: 'missing-manifest', targetSessionId: 's2', targetRunId: 'r2', manifestDigest: 'b'.repeat(64), stage: 'received' } }
  })]);
  expect(state.receipts['receipt-forged']).toMatchObject({ status: 'unknown' });
  expect(state.attention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'unverified-completion' })]));
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
