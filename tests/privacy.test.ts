import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createClaudeAdapter, createCodexAdapter, createCursorAdapter, createGeminiAdapter } from '../src/index.js';
import { project } from './helpers.js';
import { portablePath, protectCapsule } from '../src/privacy.js';
import { validateCapsule } from '../src/capsule.js';
import example from '../examples/capsule-v1.json' with { type: 'json' };

const factories = { claude: createClaudeAdapter, codex: createCodexAdapter, cursor: createCursorAdapter, gemini: createGeminiAdapter };
describe('privacy boundary', () => {
  for (const [root, outside] of [
    ['/project', '/project-sibling/private/file.ts'],
    ['/project', '/project/../private/file.ts'],
    ['C:\\project', 'C:\\project-sibling\\private\\file.ts'],
    ['\\\\server\\share', '\\\\server\\share-other\\private\\file.ts']
  ]) {
    it(`does not treat a sibling or traversal as inside ${root}`, () => {
      const capsule = validateCapsule({ ...example, objective: `Read ${outside}`, project: { name: 'test', root }, git: { ...example.git, root }, files: [], evidence: [] });
      const protectedCapsule = protectCapsule(capsule, 'portable', [root]);
      expect(protectedCapsule.objective).toBe(`Read ${portablePath(outside, root)}`);
      expect(protectedCapsule.objective).toMatch(/^Read external\/[0-9a-f]{24}$/);
      expect(protectCapsule(capsule, 'local', [root]).objective).toBe(capsule.objective);
    });
  }
  it('handles complete quoted paths with spaces and leaves URLs intact', () => {
    const capsule = validateCapsule({ ...example, objective: 'Read "/work/my project/src/a file.ts" and "/work/my project-other/private file.ts"; https://example.test/work/my%20project', files: [], evidence: [] });
    const protectedCapsule = protectCapsule(capsule, 'portable', ['/work/my project']);
    expect(protectedCapsule.objective).toBe(`Read "src/a file.ts" and "${portablePath('/work/my project-other/private file.ts', '/work/my project')}"; https://example.test/work/my%20project`);
  });
  it('does not replace a known external filename inside a longer filename', () => {
    const capsule = validateCapsule({ ...example, objective: 'Read /outside/a.ts.backup', files: [{ path: '/outside/a.ts', action: 'modified' }], evidence: [] });
    expect(protectCapsule(capsule, 'portable', ['/project']).objective).toBe(`Read ${portablePath('/outside/a.ts.backup', '/project')}`);
  });
  it('keeps an in-project directory literally named external relative', () => {
    const capsule = validateCapsule({ ...example, objective: 'Read /project/external/a.ts', files: [], evidence: [] });
    expect(protectCapsule(capsule, 'portable', ['/project']).objective).toBe('Read external/a.ts');
  });
  it('redacts an absolute path following an unmatched quote in a truncated summary', () => {
    const capsule = validateCapsule({ ...example, objective: 'Read `/project-sibling/private.ts', files: [], evidence: [] });
    expect(protectCapsule(capsule, 'portable', ['/project']).objective).toBe(`Read \`${portablePath('/project-sibling/private.ts', '/project')}`);
  });
  it('preserves nested identity on POSIX, Windows and UNC paths', () => {
    expect(portablePath('/project/src/a.ts', '/project')).toBe('src/a.ts');
    expect(portablePath('/project/other/a.ts', '/project')).toBe('other/a.ts');
    expect(portablePath('C:\\project\\src\\a.ts', 'C:\\project')).toBe('src/a.ts');
    expect(portablePath('\\\\server\\share\\src\\a.ts', '\\\\server\\share')).toBe('src/a.ts');
    expect(portablePath('/outside/a.ts', '/project')).not.toBe(portablePath('/other/a.ts', '/project'));
    expect(portablePath('C:\\private\\a.ts', '/project')).toMatch(/^external\//);
  });
  it.each([
    ['C:\\repo', 'C:private.ts', 'win32'],
    ['C:\\repo', '\\repo\\private.ts', 'win32'],
    ['//server/share/repo', '//server/share/repo/src/a.ts', 'win32'],
    ['//server/share/repo', '//server/other/private/a.ts', 'win32'],
  ] as const)('maps prose paths consistently with file locators: %s, %s', (root, value, platform) => {
    const capsule = validateCapsule({ ...example, objective: `Read ${value}`, files: [], evidence: [] });
    const output = protectCapsule(capsule, 'portable', [root], 0, platform);
    expect(output.objective).toBe(`Read ${portablePath(value, root, platform)}`);
  });
  for (const [agent, factory] of Object.entries(factories)) {
    it(`${agent}: preserves nested paths and hides paths throughout the capsule`, async () => {
      const root = await project();
      const fixture = resolve(`tests/fixtures/${agent}/session-basic.${agent === 'gemini' ? 'json' : 'jsonl'}`);
      // Re-encode both outer JSON and nested Codex argument JSON on Windows.
      function replace(value: unknown): unknown {
        if (typeof value === 'string') {
          if (value.startsWith('{')) { try { return JSON.stringify(replace(JSON.parse(value))); } catch { /* ordinary prose */ } }
          return value.replaceAll('src/rate-limit.ts', join(root, 'src/rate-limit.ts'))
            .replaceAll('tests/rate-limit.test.ts', join(root, 'other/rate-limit.ts'));
        }
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, replace(v)]));
        return value;
      }
      const original = await readFile(fixture, 'utf8');
      const text = agent === 'gemini' ? JSON.stringify(replace(JSON.parse(original))) : original.trim().split('\n').map(line => JSON.stringify(replace(JSON.parse(line)))).join('\n');
      const capsule = await factory().extract({ sessionText: text, sessionPath: fixture, project: { name: 'test', root } });
      expect(capsule.files.some(f => f.path === 'src/rate-limit.ts')).toBe(true);
      expect(capsule.files.some(f => f.path === 'other/rate-limit.ts')).toBe(true);
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
