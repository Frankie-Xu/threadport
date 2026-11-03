import { mkdir, writeFile, symlink, lstat, readlink, unlink, readFile, realpath } from 'node:fs/promises';
import { delimiter, join, relative, resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { readGitState, gitStateMatches, createClaudeAdapter } from '../src/index.js';
import { runCli } from '../src/cli.js';
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
  it('hashes real file symlinks, not their targets, on every supported platform', async () => {
    const root = await project(); const outside = join(await temporary(), 'outside');
    await writeFile(outside, 'one'); await symlink(outside, join(root, 'link'), 'file');
    expect((await lstat(join(root, 'link'))).isSymbolicLink()).toBe(true);
    const originalTarget = await readlink(join(root, 'link'));
    const a = await readGitState(root); await writeFile(outside, 'two'); const b = await readGitState(root);
    expect(a.dirty_diff_hash).toBe(b.dirty_diff_hash);
    await symlink(`${outside}-missing`, join(root, 'broken'), 'file');
    expect((await lstat(join(root, 'broken'))).isSymbolicLink()).toBe(true);
    await expect(readGitState(root)).resolves.toMatchObject({ dirty: true });
    await unlink(join(root, 'broken'));
    expect((await readGitState(root)).dirty_diff_hash).toBe(b.dirty_diff_hash);
    await unlink(join(root, 'link'));
    await symlink(`${outside}-missing`, join(root, 'link'), 'file');
    expect(await readlink(join(root, 'link'))).not.toBe(originalTarget);
    expect((await readGitState(root)).dirty_diff_hash).not.toBe(b.dirty_diff_hash);
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

it.skipIf(process.platform === 'win32')('does not run repository programs through the CLI or extraction SDK', async () => {
  const root = await project(), other = await project(), scratch = await temporary();
  const script = join(scratch, 'marker.sh'), marker = join(scratch, 'marker.sh.invoked');
  await writeFile(script, '#!/bin/sh\nprintf "called\\n" >> "$0.invoked"\nprintf "fixture-token\\000"\n', { mode: 0o700 });
  const command = "'"+script.replaceAll("'", "'\\''")+"'";
  for (const [key, value] of [
    ['core.fsmonitor', script], ['filter.marker.clean', command], ['filter.marker.process', command],
    ['filter.marker.required', 'true'], ['diff.external', command], ['diff.marker.command', command],
    ['diff.marker.textconv', command],
  ]) git(root, 'config', key, value);
  await writeFile(join(root, '.gitattributes'), 'README.md filter=marker diff=marker\n');
  await writeFile(join(root, 'README.md'), 'raw changed bytes\n');
  const sessionPath = resolve('tests/fixtures/claude/session-basic.jsonl');
  const head = git(root, 'rev-parse', 'HEAD').trim();
  vi.stubEnv('GIT_DIR', join(other, '.git'));
  vi.stubEnv('GIT_WORK_TREE', other);
  vi.stubEnv('GIT_INDEX_FILE', join(other, '.git', 'index'));
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', 'core.fsmonitor');
  vi.stubEnv('GIT_CONFIG_VALUE_0', script);
  vi.stubEnv('GIT_EXTERNAL_DIFF', script);
  try {
    const capsule = await createClaudeAdapter().extract({ sessionPath, project: { root, name: 'fixture' } });
    expect(capsule.git).toMatchObject({ head, dirty: true, changed_files: ['.gitattributes', 'README.md'] });
    expect((await readGitState(root)).root).toBe(await realpath(root));
    const out = join(scratch, 'capsule.json');
    const errors: string[] = [];
    const status = await runCli(['extract', '--from', 'claude', '--session', sessionPath, '--project', root, '--out', out], {
      cwd: () => scratch, stdout: { write: () => {} }, stderr: { write: value => { errors.push(value); } },
    });
    expect(status, errors.join('')).toBe(0);
    expect(JSON.parse(await readFile(out, 'utf8')).git).toEqual(capsule.git);
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { vi.unstubAllEnvs(); }
}, 30000);

it('recognizes linked worktrees and fails explicitly for a gitlink without entering it', async () => {
  const root = await project(), parent = await temporary();
  const linked = join(parent, 'linked');
  git(root, 'worktree', 'add', '--detach', linked, 'HEAD');
  expect(await readGitState(linked)).toMatchObject({ detached: true, dirty: false });
  const head = git(root, 'rev-parse', 'HEAD').trim();
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${head},nested`);
  await expect(readGitState(root)).rejects.toThrow('SUBMODULE_UNSUPPORTED');
}, 30000);

it('does not select Git through a relative PATH entry', async () => {
  const root=await project(), fake=await temporary();
  const program=join(fake,process.platform==='win32'?'git.exe':'git');
  await writeFile(program,'#!/bin/sh\nexit 93\n',{mode:0o700});
  const key=Object.keys(process.env).find(name=>name.toUpperCase()==='PATH')??'PATH';
  vi.stubEnv(key,relative(process.cwd(),fake)+delimiter+process.env[key]);
  try {
    expect(await readGitState(root)).toMatchObject({dirty:false});
  } finally {vi.unstubAllEnvs();}
}, 30000);

it('binds discovery from a subdirectory and blocks a nested repository redirected to its parent', async () => {
  const outer=await project(), inner=join(outer,'inner'), sub=join(inner,'sub');
  await mkdir(sub,{recursive:true});
  git(inner,'init','-b','main');
  await writeFile(join(inner,'sub','tracked.txt'),'inner repository');
  git(inner,'add','sub/tracked.txt');
  git(inner,'-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-m','inner fixture');
  const head=git(inner,'rev-parse','HEAD').trim();
  expect(await readGitState(sub)).toMatchObject({root:await realpath(inner),head,dirty:false});
  await writeFile(join(outer,'parent-only.txt'),'parent repository');
  git(inner,'config','core.worktree',outer);
  await expect(readGitState(inner)).rejects.toThrow('WORKSPACE_UNBOUND');
  await expect(readGitState(sub)).rejects.toThrow('WORKSPACE_UNBOUND');
}, 30000);

it('distinguishes sparse omissions from deletions and still checks the index and present files', async () => {
  const root=await project();
  for(const directory of ['selected','skipped']){
    await mkdir(join(root,directory));
    await writeFile(join(root,directory,'file.txt'),directory);
  }
  git(root,'add','selected','skipped');
  git(root,'commit','-m','sparse fixture');
  git(root,'sparse-checkout','set','--cone','--sparse-index','selected');
  const clean=await readGitState(root);
  expect(clean).toMatchObject({dirty:false,changed_files:[]});
  expect(git(root,'status','--porcelain=v1')).toBe('');
  await expect(lstat(join(root,'skipped','file.txt'))).rejects.toMatchObject({code:'ENOENT'});

  // Change an out-of-cone index entry while leaving the checkout absent.
  git(root,'sparse-checkout','reapply','--no-sparse-index');
  const staged=join(await temporary(),'staged');
  await writeFile(staged,'staged outside cone');
  const oid=git(root,'hash-object','-w',staged).trim();
  git(root,'update-index','--cacheinfo',`100644,${oid},skipped/file.txt`);
  git(root,'update-index','--skip-worktree','skipped/file.txt');
  const withStaging=await readGitState(root);
  expect(withStaging.changed_files).toEqual(['skipped/file.txt']);
  expect(withStaging.dirty_diff_hash).not.toBe(clean.dirty_diff_hash);

  await mkdir(join(root,'skipped'),{recursive:true});
  await writeFile(join(root,'skipped','file.txt'),'present modified worktree bytes');
  const present=await readGitState(root);
  expect(present.changed_files).toEqual(['skipped/file.txt']);
  expect(present.dirty_diff_hash).not.toBe(withStaging.dirty_diff_hash);
  await unlink(join(root,'selected','file.txt'));
  expect((await readGitState(root)).changed_files).toEqual(['selected/file.txt','skipped/file.txt']);
}, 30000);
