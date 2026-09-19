import { describe, expect, it } from 'vitest';
import { createCodexAdapter } from '../../src/adapters/codex.js';
import { project } from '../helpers.js';

describe('Codex structured-source boundary', () => {
  it('leaves an unmatched function call unknown instead of using assistant prose', async () => {
    const capsule = await createCodexAdapter().extract({
      sessionText: JSON.stringify([
        { type: 'session_meta', payload: { id: 'codex-pending', cwd: '/synthetic' } },
        { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Run the tests.' }] } },
        { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'All tests passed; exit_code: 0.' }] } },
        { type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'pending-test', arguments: JSON.stringify({ command: 'npm test' }) } },
      ]),
      project: { name: 'codex-source-boundary', root: await project() },
      now: new Date('2026-09-18T00:00:00.000Z'),
    });
    expect(capsule.tests).toHaveLength(1);
    expect(capsule.tests[0]?.status).toBe('unknown');
    expect(capsule.commands[0]?.exit_code).toBeUndefined();
  });
});
