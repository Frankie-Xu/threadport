import { describe, expect, it } from 'vitest';
import { createClaudeAdapter } from '../../src/index.js';
import { project } from '../helpers.js';

describe('legacy Capsule evidence projection', () => {
  it('uses a later user correction, preserves original goal evidence and does not adopt assistant plans', async () => {
    const root = await project();
    const records = [
      { type: 'user', message: { content: 'Build feature A' } },
      { type: 'assistant', message: { content: "I'll adopt design X." } },
      { type: 'user', message: { content: 'Actually build feature B\n禁止修改数据库。' } },
    ];
    const capsule = await createClaudeAdapter().extract({ sessionText: JSON.stringify(records), project: { name: 'synthetic', root } });
    expect(capsule.objective).toBe('Actually build feature B');
    expect(capsule.constraints).toContain('禁止修改数据库。');
    expect(capsule.decisions).toEqual([]);
    expect(capsule.evidence.some(item => item.title.includes('Build feature A'))).toBe(true);
    expect(capsule.evidence.some(item => item.title.includes('design X'))).toBe(true);
  });
  it('labels historical passing tests as unknown for the current workspace', async () => {
    const root = await project();
    const records = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'call', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'call', content: 'exit_code: 0' }] } },
    ];
    const capsule = await createClaudeAdapter().extract({ sessionText: JSON.stringify(records), project: { name: 'synthetic', root } });
    expect(capsule.tests[0].status).toBe('passed');
    expect(capsule.tests[0].summary).toContain('current workspace validity unknown');
    expect(capsule.status).not.toBe('completed');
    expect(capsule.objective).toBe('Unknown objective; review the session evidence.');
    expect(capsule.acceptance_criteria).toEqual([]);
  });
});
