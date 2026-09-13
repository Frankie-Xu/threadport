import { describe, expect, it } from 'vitest';
import { deriveTask, resolveTaskState } from '../../src/domain/derive-task.js';
import type { NormalizedEvent, Task } from '../../src/domain/models.js';

const event = (ordinal: number, text: string, changes: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  id: `event-${ordinal}`, sessionId: 'session-a', ordinal, occurredAt: '2026-09-14T00:00:00Z',
  kind: 'user-message', text, commandRun: null, relativePaths: [], omitted: false, ...changes,
});
const command = (ordinal: number, exitCode: number | null, cwd = '/repo'): NormalizedEvent => event(ordinal, 'historical output', {
  kind: 'command', commandRun: { id: `run-${ordinal}`, eventId: `event-${ordinal}`, sessionId: 'session-a', ordinal,
    command: 'npm test', cwd, exitCode, startedAt: null, completedAt: null, snapshotId: null },
});

describe('evidence-derived task candidates', () => {
  it('uses source order for a user correction and retains the original source references', () => {
    const original = event(0, 'Build feature A');
    const correction = event(1, 'Actually build feature B', { occurredAt: '2020-01-01T00:00:00Z' });
    const events = Object.freeze([Object.freeze(correction), Object.freeze(original)]);
    expect(deriveTask(events).objective).toEqual({ text: 'Actually build feature B', origin: 'derived',
      evidence: [{ sessionId: 'session-a', eventId: 'event-1' }], updatedAt: '2020-01-01T00:00:00Z' });
    expect(events[1]).toEqual(original);
    expect(original.text).toBe('Build feature A');
  });
  it('does not promote an assistant plan to a goal or an adopted decision', () => {
    const derived = deriveTask([event(0, "I'll adopt design X.", { kind: 'assistant-message' })]);
    expect(derived.objective).toBeNull();
    expect(derived).not.toHaveProperty('decisions');
    expect(derived.attention).toContain('OBJECTIVE_UNKNOWN');
  });
  it('preserves Chinese prohibition text as a derived constraint with provenance', () => {
    const text = '改进页面\n  - 请勿修改数据库结构。\n禁止上传日志。';
    const derived = deriveTask([event(0, text)]);
    expect(derived.constraints.map(claim => claim.text)).toEqual(['  - 请勿修改数据库结构。', '禁止上传日志。']);
    expect(derived.constraints.every(claim => claim.origin === 'derived')).toBe(true);
    expect(derived.constraints[0].evidence).toEqual([{ sessionId: 'session-a', eventId: 'event-0' }]);
  });
  it('retains evidence for repeated constraints without duplicating the claim', () => {
    const derived = deriveTask([event(0, 'Do not change the database.'), event(1, 'Do not change the database.')]);
    expect(derived.constraints).toHaveLength(1);
    expect(derived.constraints[0].evidence).toHaveLength(2);
  });
  it('retains unknown claim time rather than using the machine clock', () => {
    const events = [event(0, 'Fix tests', { occurredAt: null })];
    expect(deriveTask(events).objective?.updatedAt).toBeNull();
    expect(deriveTask(events)).toEqual(deriveTask(events));
  });
  it('separates the observed exit zero from current workspace validity', () => {
    const derived = deriveTask([event(0, 'Fix tests'), command(1, 0)]);
    expect(derived.latestRuns[0].exitCode).toBe(0);
    expect(derived.attention).toContain('HISTORICAL_VALIDITY_UNKNOWN');
    expect(derived).not.toHaveProperty('lifecycle');
    expect(derived).not.toHaveProperty('freshness');
  });
  it('keeps failure attention when a later retry is unknown or in a different cwd', () => {
    for (const retry of [command(2, null), command(2, 0, '/other')]) {
      const derived = deriveTask([event(0, 'Fix tests'), command(1, 1), retry]);
      expect(derived.attention).toContain('COMMAND_FAILED');
    }
    expect(deriveTask([command(0, 1), command(1, 0)]).attention).not.toContain('COMMAND_FAILED');
  });
  it('does not let a different session or redacted identity clear failure attention', () => {
    const failure = command(0, 1);
    const otherSession = command(1, 0);
    otherSession.sessionId = 'session-b';
    otherSession.commandRun!.sessionId = 'session-b';
    expect(deriveTask([failure, otherSession]).attention).toContain('COMMAND_FAILED');
    const redacted = [command(0, 1), command(1, 0)];
    redacted.forEach(item => { item.commandRun!.command = 'npm test [REDACTED]'; });
    expect(deriveTask(redacted).attention).toContain('COMMAND_FAILED');
    expect(deriveTask(redacted).attention).toContain('COMMAND_IDENTITY_INCOMPLETE');
  });
  it('labels incomplete evidence and competing sessions without claiming global recency', () => {
    const derived = deriveTask([event(0, 'Goal A', { omitted: true }),
      event(0, 'Goal B', { id: 'b-0', sessionId: 'session-b' })]);
    expect(derived.attention).toContain('INCOMPLETE_EVIDENCE');
    expect(derived.attention).toContain('MULTIPLE_SESSION_OBJECTIVES');
  });
  it('returns unknown when no observable input exists', () => {
    expect(deriveTask([])).toEqual({ objective: null, constraints: [], latestRuns: [], attention: ['OBJECTIVE_UNKNOWN'] });
  });
  it('rejects invalid or conflicting normalized identity without echoing source text', () => {
    const invalid = command(0, 1);
    invalid.commandRun!.sessionId = 'different-session';
    expect(() => deriveTask([invalid])).toThrow(expect.objectContaining({ code: 'INVALID_INPUT', retryable: false }));
    expect(() => deriveTask([event(0, 'one'), event(0, 'private input')])).toThrow('Duplicate normalized event identity.');
    expect(() => deriveTask([event(0, 'private input', { occurredAt: 'invalid' })])).toThrow('Invalid normalized events.');
  });
});

describe('saved task fields remain authoritative', () => {
  it('keeps manual text, lifecycle and explicit constraint deletion across rescan', () => {
    const claim = { text: '人工确认目标', origin: 'user-confirmed' as const, evidence: [], updatedAt: '2026-09-14T00:00:00Z' };
    const task: Task = { id: 'task', projectId: 'project', revision: 2, title: 'Task', objective: claim,
      constraints: [], nextAction: { ...claim, text: '只审查，不修改' }, lifecycle: 'completed', archived: true,
      createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z' };
    const before = structuredClone(task);
    const derived = deriveTask([event(0, '机器候选\n禁止修改数据库'), command(1, 1)]);
    const view = resolveTaskState(task, derived);
    expect(view.objective).toEqual(claim);
    expect(view.constraints).toEqual([]);
    expect(view.nextAction?.text).toBe('只审查，不修改');
    expect(view.lifecycle).toBe('completed');
    expect(view.archived).toBe(true);
    expect(view.attention).toContain('COMMAND_FAILED');
    view.objective!.text = 'view mutation';
    expect(task).toEqual(before);
    const edited = { ...task, constraints: [{ ...claim, text: '允许修改测试数据库，但禁止生产迁移。' }] };
    expect(resolveTaskState(edited, derived).constraints).toEqual(edited.constraints);
  });
});
