import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { runCli } from '../src/cli.js';
import { parseCapsule } from '../src/capsule.js';
import { renderCapsuleMarkdown } from '../src/markdown.js';
import { project, temporary } from './helpers.js';

const fault = vi.hoisted(() => ({ operation: '', destination: '', jsonPath: '', observedJson: '' }));
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  async function inject(operation: string, destination: unknown) {
    if (fault.operation !== operation || fault.destination !== String(destination)) return;
    if (fault.jsonPath) fault.observedJson = await fs.readFile(fault.jsonPath, 'utf8');
    throw Object.assign(new Error(`Synthetic ${operation} publication failure`), { code: 'EIO' });
  }
  return { ...fs,
    link: async (...args: Parameters<typeof fs.link>) => { await inject('link', args[1]); return fs.link(...args); },
    rename: async (...args: Parameters<typeof fs.rename>) => { await inject('rename', args[1]); return fs.rename(...args); }
  };
});
afterEach(() => { Object.assign(fault, { operation: '', destination: '', jsonPath: '', observedJson: '' }); });

async function cli(args: string[], cwd: string) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { cwd: () => cwd, stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } });
  return { code, stdout, stderr };
}

describe('publication faults after destination preflight', () => {
  for (const operation of ['link', 'rename']) {
    it(`retains authoritative JSON and cleans temporary files after Markdown ${operation} fails`, async () => {
      const root = await project(), cwd = await temporary();
      const jsonPath = join(cwd, 'capsule.json'), markdownPath = join(cwd, 'capsule.md');
      if (operation === 'rename') await writeFile(markdownPath, 'previous Markdown cache');
      Object.assign(fault, { operation, destination: markdownPath, jsonPath });
      const result = await cli(['extract', '--from', 'claude', '--session', resolve('tests/fixtures/claude/session-basic.jsonl'), '--project', root, '--out', jsonPath, ...(operation === 'rename' ? ['--force'] : [])], cwd);
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(jsonPath);
      expect(result.stderr).toContain('Capsule JSON saved; Markdown cache failed');
      expect(result.stderr).toContain(`Synthetic ${operation} publication failure`);
      const saved = await readFile(jsonPath, 'utf8');
      expect(saved).toBe(fault.observedJson);
      const capsule = parseCapsule(saved);
      expect((await readdir(cwd)).sort()).toEqual(operation === 'rename' ? ['capsule.json', 'capsule.md'] : ['capsule.json']);
      if (operation === 'rename') expect(await readFile(markdownPath, 'utf8')).toBe('previous Markdown cache');
      fault.operation = '';
      const regenerated = await cli(['render', jsonPath], cwd);
      expect(regenerated.code, regenerated.stderr).toBe(0);
      expect(regenerated.stdout).toBe(`${renderCapsuleMarkdown(capsule)}\n`);
      await writeFile(markdownPath, regenerated.stdout);
      expect(await readFile(markdownPath, 'utf8')).toContain('ThreadPort Context Capsule');
    });
  }
  it('does not publish Markdown or success paths when JSON publication fails', async () => {
    const root = await project(), cwd = await temporary();
    Object.assign(fault, { operation: 'link', destination: join(cwd, 'capsule.json') });
    const result = await cli(['extract', '--from', 'claude', '--session', resolve('tests/fixtures/claude/session-basic.jsonl'), '--project', root, '--out', 'capsule.json'], cwd);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Synthetic link publication failure');
    expect(await readdir(cwd)).toEqual([]);
  });
});
