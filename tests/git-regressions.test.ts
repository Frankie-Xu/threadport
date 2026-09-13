import { writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { readGitState, gitStateMatches } from '../src/git.js';
import { project, git, temporary } from './helpers.js';

describe('Git snapshot edge cases', () => {
  it('fingerprints staging contents independently of the worktree', async () => {
    const root = await project();
    await writeFile(join(root, 'README.md'), 'index one\n'); git(root, 'add', '.');
    await writeFile(join(root, 'README.md'), 'same worktree\n'); const a = await readGitState(root);
    await writeFile(join(root, 'README.md'), 'index two\n'); git(root, 'add', '.');
    await writeFile(join(root, 'README.md'), 'same worktree\n'); const b = await readGitState(root);
    expect(gitStateMatches(a, b)).toBe(false);
  });
  it('parses modified renames without truncating the source filename', async () => {
    const root = await project(); git(root, 'mv', 'README.md', 'renamed.md');
    await writeFile(join(root, 'renamed.md'), 'initial\nextra\n');
    expect((await readGitState(root)).changed_files.sort()).toEqual(['README.md', 'renamed.md']);
  });
  it('normalizes diff presentation independently of user configuration', async () => {
    const root = await project();
    await writeFile(join(root, 'README.md'), 'one\ntwo\nthree\nfour\nfive\n');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'multiline');
    await writeFile(join(root, 'README.md'), 'one\ntwo\nchanged\nfour\nfive\n');
    const before = await readGitState(root);
    git(root, 'config', 'diff.context', '0');
    git(root, 'config', 'diff.algorithm', 'patience');
    git(root, 'config', 'diff.mnemonicPrefix', 'true');
    git(root, 'config', 'diff.interHunkContext', '99');
    expect((await readGitState(root)).dirty_diff_hash).toBe(before.dirty_diff_hash);
  });
  it.skipIf(process.platform === 'win32')('hashes links, not their targets, and permits broken links', async () => {
    const root = await project(); const outside = join(await temporary(), 'outside');
    await writeFile(outside, 'one'); await symlink(outside, join(root, 'link'));
    const a = await readGitState(root); await writeFile(outside, 'two'); const b = await readGitState(root);
    expect(a.dirty_diff_hash).toBe(b.dirty_diff_hash);
    await symlink(`${outside}-missing`, join(root, 'broken'));
    await expect(readGitState(root)).resolves.toMatchObject({ dirty: true });
  });
  it('supports detached HEAD, untracked content, and portable state comparison', async () => {
    const root = await project(); git(root, 'checkout', '--detach', 'HEAD');
    await writeFile(join(root, 'new.txt'), 'one'); const a = await readGitState(root);
    expect(a.detached).toBe(true);
    expect(gitStateMatches({ ...a, root: '.' }, a)).toBe(true);
    await writeFile(join(root, 'new.txt'), 'two'); const b = await readGitState(root);
    expect(a.dirty_diff_hash).not.toBe(b.dirty_diff_hash);
  });
});
