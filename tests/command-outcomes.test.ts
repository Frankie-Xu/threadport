import { describe, expect, it } from 'vitest';
import { tracesFromEvents, toolResult, sessionIdFrom } from '../src/adapters/common.js';

const event = (exitCode: number | null, cwd: string | null = '/repo', sessionId = 'session-a') =>
  ({ type: 'command' as const, command: 'npm test', exitCode, cwd, sessionId });

describe('command history projection', () => {
  it('keeps missing command context null rather than inventing a project binding', () => {
    const traces = tracesFromEvents([{ type: 'command', command: ' npm test ', exitCode: 0 }], 'vendor-session');
    expect(traces.commandRuns[0]).toMatchObject({ sessionId: 'vendor-session', command: ' npm test ', cwd: null,
      startedAt: null, completedAt: null, snapshotId: null });
  });
  it('rejects concatenated session identities in the single-session legacy adapter', () => {
    expect(() => sessionIdFrom([{ sessionId: 'one' }, { sessionId: 'two' }], undefined, 'fallback')).toThrow(/Multiple session IDs/);
  });
  it('does not resolve a failure with success in another cwd or session', () => {
    for (const success of [event(0, '/other'), event(0, '/repo', 'session-b'), event(0, null)]) {
      const traces = tracesFromEvents([event(1), success]);
      expect(traces.status).toBe('blocked');
      expect(traces.failures[0].resolution).toBeUndefined();
    }
  });
  it('preserves failure/success/failure history and resolves only the earlier failure', () => {
    const traces = tracesFromEvents([event(1), event(0), event(1)]);
    expect(traces.commands.map(run => run.exit_code)).toEqual([1, 0, 1]);
    expect(traces.failures).toHaveLength(2);
    expect(traces.failures[0].resolution).toMatch(/passed/);
    expect(traces.failures[1].resolution).toBeUndefined();
    expect(traces.status).toBe('blocked');
  });
  it('retains every failed attempt and its own output', () => {
    const traces = tracesFromEvents([{ ...event(1), output: 'first failure' }, { ...event(2), output: 'second failure' }]);
    expect(traces.failures.map(f => f.summary)).toEqual(['first failure', 'second failure']);
  });
  it('does not turn null exit status into failure or recover an earlier failure', () => {
    const traces = tracesFromEvents([event(1), event(null)]);
    expect(traces.tests.map(test => test.status)).toEqual(['failed', 'unknown']);
    expect(traces.commands[1]).not.toHaveProperty('exit_code');
    expect(traces.failures).toHaveLength(1);
    expect(traces.failures[0].resolution).toBeUndefined();
  });
  it('keeps an explicit null result unknown even when its prose mentions exit zero', () => {
    expect(toolResult({ exit_code: null, output: 'previous exit_code: 0' }).exitCode).toBeUndefined();
  });
  it('does not invent an exit code for an explicitly null tool error result', () => {
    const result = toolResult({ exit_code: null, output: 'interrupted' }, true);
    expect(result.exitCode).toBeUndefined();
    expect(result.outcome).toBe('failed');
  });
  it.each(['npm test', 'npm run test:unit', 'pnpm test', 'pnpm run test', 'pnpm exec vitest run',
    'yarn test', 'yarn run test', 'yarn vitest run', 'npx vitest run', 'pytest -q', 'go test ./...', 'cargo test'])('recognizes a test invocation: %s', command => {
    expect(tracesFromEvents([{ type: 'command', command, exitCode: 0 }]).tests[0]?.status).toBe('passed');
  });
  it.each(['echo "npm test"', 'cat pytest', 'npm run build', 'npm testing', 'npm test; echo done',
    'false || npm test', 'custom-test-runner'])('keeps unrecognized or compound commands out of tests: %s', command => {
    const traces = tracesFromEvents([{ type: 'command', command, exitCode: 0 }]);
    expect(traces.tests).toEqual([]);
    expect(traces.commands).toHaveLength(1);
  });
});
