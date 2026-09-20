import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import * as api from '../src/index.js';
import { runCli } from '../src/cli.js';
import example from '../examples/capsule-v1.json' with { type: 'json' };
import { temporary } from './helpers.js';

it('keeps the documented v1 entry point usable without internal module imports', () => {
  const capsule = api.parseCapsule(JSON.stringify(example));
  expect(api.parseCapsule(api.serializeCapsule(capsule))).toEqual(capsule);
  for (const target of ['claude', 'codex', 'cursor', 'gemini'] as const) {
    const handoff = api.createHandoff(capsule, target);
    expect(api.parseHandoff(JSON.stringify(handoff))).toEqual({
      protocol: 'threadport.handoff.v1',
      target_agent: target,
      capsule,
      safety: { execute_commands: false, modify_workspace: false },
    });
  }
  expect(api.renderCapsuleMarkdown(capsule)).toContain('ThreadPort Context Capsule');
  for (const factory of [api.createClaudeAdapter, api.createCodexAdapter, api.createCursorAdapter, api.createGeminiAdapter]) {
    expect(factory).toBeTypeOf('function');
  }
});

it('emits CLI JSON that the existing public v1 consumer accepts', async () => {
  const cwd = await temporary();
  let stdout = '';
  let stderr = '';
  const code = await runCli([
    'handoff', resolve('examples/capsule-v1.json'), '--to', 'codex',
    '--format', 'json', '--out', 'handoff.json',
  ], {
    cwd: () => cwd,
    stdout: { write: text => { stdout += text; } },
    stderr: { write: text => { stderr += text; } },
  });
  expect(code, stderr).toBe(0);
  expect(stdout.trim()).toBe(join(cwd, 'handoff.json'));
  const handoff = api.parseHandoff(await readFile(join(cwd, 'handoff.json'), 'utf8'));
  expect(handoff).toEqual(api.createHandoff(api.validateCapsule(example), 'codex'));
});
