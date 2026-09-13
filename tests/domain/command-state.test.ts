import { describe, expect, it } from 'vitest';
import { latestCommandRuns } from '../../src/domain/command-state.js';
import type { CommandRun } from '../../src/domain/models.js';

const run = (ordinal: number, exitCode: number | null, overrides: Partial<CommandRun> = {}): CommandRun => ({
  id: `run-${ordinal}`, sessionId: 'session-a', ordinal, command: 'npm test', cwd: '/repo', exitCode,
  startedAt: null, completedAt: null, eventId: `event-${ordinal}`, snapshotId: null, ...overrides,
});

describe('latest command runs', () => {
  it('uses the greatest ordinal without modifying the full history', () => {
    const runs = Object.freeze([run(2, 1), run(0, 1), run(1, 0)].map(item => Object.freeze(item)));
    expect(latestCommandRuns(runs)).toEqual([runs[0]]);
    expect(runs.map(item => item.exitCode)).toEqual([1, 1, 0]);
  });
  it('isolates session, cwd, and exact command including null cwd', () => {
    const runs = [run(0, 1), run(1, 0, { cwd: '/other' }), run(2, 0, { sessionId: 'session-b' }),
      run(3, 0, { command: 'npm test ' }), run(4, 0, { cwd: null })];
    expect(latestCommandRuns(runs)).toHaveLength(5);
    expect(latestCommandRuns(runs).find(item => item.id === 'run-0')?.exitCode).toBe(1);
  });
  it('keeps a final unknown rather than falling back to an older known result', () => {
    expect(latestCommandRuns([run(0, 0), run(1, null)])[0].exitCode).toBeNull();
  });
  it('does not collide when identity fields contain separators', () => {
    expect(latestCommandRuns([run(0, 1, { sessionId: 'a|b', cwd: 'c' }),
      run(1, 0, { sessionId: 'a', cwd: 'b|c' })])).toHaveLength(2);
  });
  it('orders output by session then ordinal independently of input order', () => {
    const runs = [run(4, 0, { sessionId: 'session-b' }), run(3, 1), run(1, 0, { cwd: '/other' })];
    expect(latestCommandRuns(runs).map(item => item.id)).toEqual(['run-1', 'run-3', 'run-4']);
    expect(latestCommandRuns([...runs].reverse())).toEqual(latestCommandRuns(runs));
  });
  it('accepts an empty history', () => expect(latestCommandRuns([])).toEqual([]));
});
