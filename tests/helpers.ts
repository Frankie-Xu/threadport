import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
export async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'threadport-test-'));
  directories.push(path);
  return path;
}
export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
export async function project(): Promise<string> {
  const root = await temporary();
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'user.name', 'Synthetic Test');
  await writeFile(join(root, 'README.md'), 'initial\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
  return root;
}
