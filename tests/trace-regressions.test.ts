import { describe, it, expect } from 'vitest';
import { tracesFromEvents } from '../src/adapters/common.js';
import { createClaudeAdapter, createCodexAdapter, createGeminiAdapter } from '../src/index.js';
import { project } from './helpers.js';

describe('verified observable state', () => {
  it('reopens a failure after a successful retry', () => {
    const traces = tracesFromEvents([1, 0, 1].map(exitCode => ({ type: 'command', command: 'npm test', exitCode })));
    expect(traces.status).toBe('blocked');
    expect(traces.failures.some(f => !f.resolution)).toBe(true);
  });
  it('does not report rejected edits as completed', async () => {
    const root = await project();
    const records = [
      { type: 'user', timestamp: '2020-01-02T03:04:05Z', message: { role: 'user', content: 'Fix file' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', id: 'a', input: { file_path: 'missing.ts' } }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'File not found' }] } }
    ];
    const capsule = await createClaudeAdapter().extract({ sessionText: records.map(r => JSON.stringify(r)).join('\n'), project: { name: 'test', root } });
    expect(capsule.completed).toEqual([]);
    expect(capsule.failures.length).toBe(1);
    expect(capsule.status).toBe('blocked');
    expect(capsule.created_at).toBe('2020-01-02T03:04:05.000Z');
  });
  it('rejects unrecognized transcripts', async () => {
    const root = await project();
    await expect(createGeminiAdapter().extract({ sessionText: '{}', project: { name: 'test', root } })).rejects.toThrow(/observable/i);
  });
  it('reads explicit process exit status', async () => {
    const root = await project();
    const records = [
      { type: 'message', role: 'user', content: 'Run tests' },
      { type: 'function_call', name: 'exec_command', call_id: 'a', arguments: { cmd: 'npm test' } },
      { type: 'function_call_output', call_id: 'a', output: 'Process exited with code 1\nFAIL' }
    ];
    const capsule = await createCodexAdapter().extract({ sessionText: records.map(r => JSON.stringify(r)).join('\n'), project: { name: 'test', root } });
    expect(capsule.tests[0].status).toBe('failed');
  });
  it('pairs Gemini results by ID even when responses are reversed', async () => {
    const root = await project();
    const session = { messages: [
      { role: 'user', parts: [{ text: 'Test suites' }] },
      { role: 'model', parts: ['A', 'B'].map(id => ({ functionCall: { id, name: 'run_shell_command', args: { command: `npm test -- ${id}` } } })) },
      { role: 'user', parts: [{ functionResponse: { id: 'B', name: 'run_shell_command', response: { output: 'exit_code: 0' } } }, { functionResponse: { id: 'A', name: 'run_shell_command', response: { output: 'exit_code: 1' } } }] }
    ] };
    const capsule = await createGeminiAdapter().extract({ sessionText: JSON.stringify(session), project: { name: 'test', root } });
    expect(capsule.tests.map(t => t.status)).toEqual(['failed', 'passed']);
  });
});
