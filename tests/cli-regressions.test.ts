import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runCli } from '../src/cli.js';
import { readGitState } from '../src/git.js';
import { temporary, project } from './helpers.js';

async function cli(args: string[], cwd: string) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { cwd: () => cwd, stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } });
  return { code, stdout, stderr };
}
const example = resolve('examples/capsule-v1.json');
describe('strict CLI and project identity', () => {
  for (const tail of [['--unknown'], ['--out'], ['--out', '--force'], ['--to', 'claude'], ['extra.json']]) {
    it(`rejects invalid handoff args before writing: ${tail.join(' ')}`, async () => {
      const cwd = await temporary();
      const result = await cli(['handoff', '--to', 'codex', example, ...tail], cwd);
      expect(result.code).toBe(1); expect(await readdir(cwd)).toEqual([]);
    });
  }
  it('accepts input before options and uses .md', async () => {
    const cwd = await temporary();
    const result = await cli(['handoff', example, '--to', 'codex', '--out', 'handoff.md'], cwd);
    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(join(cwd, 'handoff.md'), 'utf8')).toContain('Target agent: codex');
  });
  it('isolates projects with the same session ID and leaves each project clean', async () => {
    const a = await project(), b = await project();
    const session = resolve('tests/fixtures/claude/session-basic.jsonl');
    const args = (root: string) => ['extract', '--from', 'claude', '--session', session, '--project', root];
    const first = await cli(args(a), a); const second = await cli(args(b), a);
    expect(first.code, first.stderr).toBe(0); expect(second.code, second.stderr).toBe(0);
    expect(first.stdout).not.toBe(second.stdout);
    expect((await readGitState(a)).dirty).toBe(false);
    expect((await readGitState(b)).dirty).toBe(false);
  });
  it('exports local privacy only when explicitly requested', async () => {
    const root = await project(), cwd = await temporary();
    const result = await cli(['extract', '--from', 'claude', '--session', resolve('tests/fixtures/claude/session-basic.jsonl'), '--project', root, '--privacy', 'local', '--out', 'local.json'], cwd);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(cwd, 'local.json'), 'utf8')).project.root).toBe(root);
  });
  it('validates a handoff only through its explicit envelope route', async () => {
    const cwd = await temporary();
    const saved = await cli(['handoff', example, '--to', 'codex', '--format', 'json', '--out', 'handoff.json'], cwd);
    expect(saved.code, saved.stderr).toBe(0);
    expect((await cli(['validate', '--handoff', 'handoff.json'], cwd)).code).toBe(0);
    expect((await cli(['validate', 'handoff.json'], cwd)).code).toBe(1);
  });
  it('rejects a non-file Markdown destination before publishing JSON', async () => {
    const root = await project(), cwd = await temporary();
    await mkdir(join(cwd, 'capsule.md'));
    const result = await cli(['extract', '--from', 'claude', '--session', resolve('tests/fixtures/claude/session-basic.jsonl'), '--project', root, '--out', 'capsule.json', '--force'], cwd);
    expect(result.code).toBe(1);
    expect(await readdir(cwd)).toEqual(['capsule.md']);
  });
});
