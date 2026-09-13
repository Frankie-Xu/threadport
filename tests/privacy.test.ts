import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter, createGeminiAdapter } from '../src/index.js';
import { project } from './helpers.js';
import { portablePath } from '../src/privacy.js';

const factories = { claude: createClaudeAdapter, codex: createCodexAdapter, cursor: createCursorAdapter, gemini: createGeminiAdapter };
describe('privacy boundary', () => {
  it('preserves nested identity on POSIX, Windows and UNC paths', () => {
    expect(portablePath('/project/src/a.ts', '/project')).toBe('src/a.ts');
    expect(portablePath('/project/other/a.ts', '/project')).toBe('other/a.ts');
    expect(portablePath('C:\\project\\src\\a.ts', 'C:\\project')).toBe('src/a.ts');
    expect(portablePath('\\\\server\\share\\src\\a.ts', '\\\\server\\share')).toBe('src/a.ts');
    expect(portablePath('/outside/a.ts', '/project')).not.toBe(portablePath('/other/a.ts', '/project'));
    expect(portablePath('C:\\private\\a.ts', '/project')).toMatch(/^external\//);
  });
  for (const [agent, factory] of Object.entries(factories)) {
    it(`${agent}: preserves nested paths and hides paths throughout the capsule`, async () => {
      const root = await project();
      const fixture = resolve(`tests/fixtures/${agent}/session-basic.${agent === 'gemini' ? 'json' : 'jsonl'}`);
      // Re-encode both outer JSON and nested Codex argument JSON on Windows.
      function replace(value: unknown): unknown {
        if (typeof value === 'string') {
          if (value.startsWith('{')) { try { return JSON.stringify(replace(JSON.parse(value))); } catch { /* ordinary prose */ } }
          return value.replaceAll('src/rate-limit.ts', join(root, 'src/rate-limit.ts'));
        }
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, replace(v)]));
        return value;
      }
      const original = await readFile(fixture, 'utf8');
      const text = agent === 'gemini' ? JSON.stringify(replace(JSON.parse(original))) : original.trim().split('\n').map(line => JSON.stringify(replace(JSON.parse(line)))).join('\n');
      const capsule = await factory().extract({ sessionText: text, sessionPath: fixture, project: { name: 'test', root } });
      expect(capsule.files.some(f => f.path === 'src/rate-limit.ts')).toBe(true);
      expect(JSON.stringify(capsule)).not.toContain(JSON.stringify(root).slice(1, -1));
    });
  }
  it('redacts full output before truncation and protects session identifiers', async () => {
    const root = await project();
    const token = `ghp_${'A'.repeat(32)}`;
    const secret = '-----BEGIN PRIVATE KEY-----' + 'SYNTHETIC_PRIVATE_MATERIAL_'.repeat(20) + '-----END PRIVATE KEY-----';
    const records = [
      { type: 'user', sessionId: token, message: { role: 'user', content: 'Fix tests' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: secret + '\nexit_code: 1', is_error: true }] } }
    ];
    const capsule = await createClaudeAdapter().extract({ sessionText: records.map(r => JSON.stringify(r)).join('\n'), project: { name: 'test', root } });
    expect(JSON.stringify(capsule)).not.toContain(token);
    expect(JSON.stringify(capsule)).not.toContain('SYNTHETIC_PRIVATE_MATERIAL_');
    expect(capsule.redaction?.applied).toBe(true);
    expect(capsule.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  });
});
