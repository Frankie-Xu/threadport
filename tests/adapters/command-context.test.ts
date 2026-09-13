import { describe, expect, it } from 'vitest';
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter, createGeminiAdapter } from '../../src/index.js';
import { project } from '../helpers.js';

type Execution = { cwd: string | null; code: number; command?: string };
function messages(runs: Execution[]) {
  return runs.flatMap((run, index) => [
    { type: 'assistant', sessionId: 'synthetic-session', cwd: run.cwd, message: { content: [
      { type: 'tool_use', name: 'Bash', id: `call-${index}`, input: { command: run.command ?? 'pnpm test' } },
    ] } },
    { type: 'user', sessionId: 'synthetic-session', message: { content: [
      { type: 'tool_result', tool_use_id: `call-${index}`, content: `exit_code: ${run.code}` },
    ] } },
  ]);
}
function codex(runs: Execution[]) {
  return runs.flatMap((run, index) => [
    { type: 'turn_context', payload: { cwd: '/context' } },
    { type: 'function_call', name: 'exec_command', call_id: `call-${index}`,
      arguments: { cmd: run.command ?? 'pnpm test', workdir: run.cwd } },
    { type: 'function_call_output', call_id: `call-${index}`, output: { exit_code: run.code } },
  ]);
}
function gemini(runs: Execution[]) {
  return { messages: runs.flatMap((run, index) => [
    { role: 'model', parts: [{ functionCall: { name: 'run_shell_command', id: `call-${index}`,
      args: { command: run.command ?? 'pnpm test', cwd: run.cwd } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'run_shell_command', id: `call-${index}`,
      response: { exit_code: run.code } } }] },
  ]) };
}

const sources = [
  { factory: createClaudeAdapter, session: messages }, { factory: createCursorAdapter, session: messages },
  { factory: createCodexAdapter, session: codex }, { factory: createGeminiAdapter, session: gemini },
];
describe('observed command context reaches Capsule failure projection', () => {
  for (const { factory, session } of sources) {
    it.each(['/a', '/b', null])(`${factory().agent}: resolves only in the same observed cwd (%s)`, async cwd => {
      const root = await project();
      const capsule = await factory().extract({ project: { name: 'synthetic', root },
        sessionText: JSON.stringify(session([{ cwd: '/a', code: 1 }, { cwd, code: 0 }])) });
      expect(capsule.commands.map(run => run.exit_code)).toEqual([1, 0]);
      expect(capsule.tests.map(test => test.status)).toEqual(['failed', 'passed']);
      expect(Boolean(capsule.failures[0].resolution)).toBe(cwd === '/a');
      expect(capsule.status).toBe(cwd === '/a' ? 'active' : 'blocked');
      expect(capsule.commands[0]).not.toHaveProperty('cwd');
    });
    it(`${factory().agent}: keeps exact command strings instead of trimming identities`, async () => {
      const root = await project();
      const capsule = await factory().extract({ project: { name: 'synthetic', root },
        sessionText: JSON.stringify(session([{ cwd: '/a', code: 1, command: 'pnpm test' },
          { cwd: '/a', code: 0, command: ' pnpm test ' }])) });
      expect(capsule.commands.map(run => run.command)).toEqual(['pnpm test', ' pnpm test ']);
      expect(capsule.status).toBe('blocked');
    });
  }
  it('does not resolve distinct commands that collapse to the same redacted text', async () => {
    const root = await project();
    const first = `ghp_${'A'.repeat(24)}`, second = `ghp_${'B'.repeat(24)}`;
    const capsule = await createClaudeAdapter().extract({ project: { name: 'synthetic', root },
      sessionText: JSON.stringify(messages([
        { cwd: '/a', code: 1, command: `npm test --token ${first}` },
        { cwd: '/a', code: 0, command: `npm test --token ${second}` },
      ])) });
    expect(capsule.commands[0].command).toBe(capsule.commands[1].command);
    expect(capsule.status).toBe('blocked');
    expect(capsule.failures[0].resolution).toBeUndefined();
    expect(JSON.stringify(capsule)).not.toContain(first);
    expect(JSON.stringify(capsule)).not.toContain(second);
  });
  it('Codex retains per-turn cwd metadata when a tool omits workdir', async () => {
    const root = await project();
    const records = ['/a', '/b'].flatMap((cwd, index) => [
      { type: 'turn_context', payload: { cwd } },
      { type: 'function_call', name: 'exec_command', call_id: `c-${index}`, arguments: { cmd: 'npm test' } },
      { type: 'function_call_output', call_id: `c-${index}`, output: { exit_code: index === 0 ? 1 : 0 } },
    ]);
    const capsule = await createCodexAdapter().extract({ project: { name: 'synthetic', root }, sessionText: JSON.stringify(records) });
    expect(capsule.status).toBe('blocked');
  });
});
