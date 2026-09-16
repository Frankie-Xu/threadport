import { expect, it } from 'vitest';
import type { NormalizedEvent } from '../../src/domain/models.js';
import type { WorkspaceSnapshot } from '../../src/workspace/contracts.js';
import { commandEvidenceSchema, commandEvidenceSummary, evaluateCommandEvidence } from '../../src/evidence/command.js';

const snapshot: WorkspaceSnapshot = {
  id: 'baseline', workspaceId: 'workspace', capturedAt: '2026-09-16T00:00:00.000Z',
  head: 'a'.repeat(40), digest: 'b'.repeat(64), bindingDigest: 'c'.repeat(64),
  algorithm: 'threadport.workspace.raw.v1', scope: 'head-tracked-diff-untracked', incompleteReasons: [],
};
const current: WorkspaceSnapshot = { ...snapshot, id: 'review' };
const event: NormalizedEvent = {
  id: 'event', sessionId: 'session', ordinal: 1, occurredAt: null, kind: 'command',
  text: 'npm test exited', relativePaths: [], omitted: false,
  commandRun: {
    id: 'run', sessionId: 'session', ordinal: 1, command: 'npm test', cwd: null,
    exitCode: 0, startedAt: null, completedAt: null, eventId: 'event', snapshotId: 'baseline',
  },
};

it('retains historical success but marks changed content as stale, never failed', () => {
  const evidence = evaluateCommandEvidence(event, snapshot, { ...current, digest: 'd'.repeat(64) })!;
  expect(evidence).toMatchObject({historical: {result: 'succeeded', exitCode: 0, startedAt: null, completedAt: null}, applicability: 'stale', workspace: {status: 'drifted', reasons: ['CONTENT_CHANGED']}});
  expect(evidence.reasons).toContain('WORKSPACE_CHANGED');
  expect(commandEvidenceSummary(evidence)).toContain('needs revalidation');
  expect(commandEvidenceSchema.parse(evidence)).toEqual(evidence);
});

it('does not certify test coverage or environment from a matching code snapshot', () => {
  const evidence = evaluateCommandEvidence(event, snapshot, current)!;
  expect(evidence).toMatchObject({applicability: 'unknown', workspace: {status: 'matched'}, environment: 'unknown', testScope: 'unknown'});
  expect(evidence.reasons).toContain('ENVIRONMENT_UNKNOWN');
  expect(evidence.reasons).toContain('TEST_SCOPE_UNKNOWN');
  expect(commandEvidenceSummary(evidence)).toContain('current validity unknown');
});

it.each([null, 0, 2])('preserves the recorded exit %s independently of applicability', exitCode => {
  const evidence = evaluateCommandEvidence({...event, commandRun: {...event.commandRun!, exitCode}}, snapshot, {...current, head: 'd'.repeat(40)})!;
  expect(evidence.historical).toMatchObject({exitCode, result: exitCode === null ? 'unknown' : exitCode === 0 ? 'succeeded' : 'failed'});
  expect(evidence.applicability).toBe(exitCode === null ? 'unverified' : 'stale');
  expect(evidence.workspace.reasons).toEqual(['HEAD_CHANGED']);
});

it.each([null, {...snapshot, id: 'unrelated'}, {...snapshot, workspaceId: 'other'}, {...snapshot, bindingDigest: 'e'.repeat(64)}])('does not borrow a missing or unrelated historical snapshot', historical => {
  const evidence = evaluateCommandEvidence(event, historical, current)!;
  expect(evidence.applicability).toBe('unknown');
  expect(evidence.workspace.status).toBe('unverifiable');
});

it('does not borrow the current snapshot for a command with no reference', () => {
  const evidence = evaluateCommandEvidence({...event, commandRun: {...event.commandRun!, snapshotId: null}}, current, current)!;
  expect(evidence).toMatchObject({applicability: 'unknown', workspace: {status: 'unverifiable', snapshotId: null}});
  expect(evidence.reasons).toContain('SNAPSHOT_MISSING');
});

it('treats incomplete historical or current captures as unknown, not a match', () => {
  const incomplete: WorkspaceSnapshot = {...snapshot, digest: null, incompleteReasons: ['READ_FAILED']};
  for (const [before, after] of [[incomplete, current], [snapshot, {...incomplete, id: 'review'}]]) {
    expect(evaluateCommandEvidence(event, before, after)).toMatchObject({applicability: 'unknown', workspace: {status: 'unverifiable', reasons: ['READ_FAILED']}});
  }
});

it('requires execution evidence and source identity rather than trusting assistant prose', () => {
  expect(evaluateCommandEvidence({...event, kind: 'assistant-message', text: 'All tests passed', commandRun: null}, snapshot, current)).toBeNull();
  expect(evaluateCommandEvidence({...event, omitted: true}, snapshot, current)).toMatchObject({applicability: 'unverified', reasons: expect.arrayContaining(['SOURCE_INCOMPLETE'])});
  expect(evaluateCommandEvidence({...event, commandRun: {...event.commandRun!, sessionId: 'other'}}, snapshot, current)).toMatchObject({applicability: 'unverified', reasons: expect.arrayContaining(['COMMAND_IDENTITY_MISMATCH'])});
});

it('rejects extra fields, false certainty, and malformed execution results at the contract boundary', () => {
  const evidence = evaluateCommandEvidence(event, snapshot, current)!;
  expect(commandEvidenceSchema.safeParse({...evidence, execute: true}).success).toBe(false);
  expect(commandEvidenceSchema.safeParse({...evidence, applicability: 'current'}).success).toBe(false);
  expect(commandEvidenceSchema.safeParse({...evidence, historical: {...evidence.historical, exitCode: 0.5}}).success).toBe(false);
  expect(commandEvidenceSchema.safeParse({...evidence, historical: {...evidence.historical, result: 'failed'}}).success).toBe(false);
});
