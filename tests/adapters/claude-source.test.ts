import { describe, expect, it } from 'vitest';
import { createClaudeAdapter } from '../../src/adapters/claude.js';
import { project } from '../helpers.js';

describe('Claude structured-source boundary', () => {
  it('leaves an unmatched tool call unknown even when assistant prose says exit 0', async () => {
    const capsule = await createClaudeAdapter().extract({
      sessionText: JSON.stringify([
        { type: 'user', sessionId: 'claude-pending', message: { role: 'user', content: 'Run the tests.' } },
        { type: 'assistant', sessionId: 'claude-pending', message: { role: 'assistant', content: [
          { type: 'text', text: 'The tests passed; exit_code: 0.' },
          { type: 'tool_use', id: 'pending-test', name: 'Bash', input: { command: 'npm test' } },
        ] } },
      ]),
      project: { name: 'claude-source-boundary', root: await project() },
      now: new Date('2026-09-18T00:00:00.000Z'),
    });
    expect(capsule.tests).toHaveLength(1);
    expect(capsule.tests[0]?.status).toBe('unknown');
    expect(capsule.commands[0]?.exit_code).toBeUndefined();
  });
});
