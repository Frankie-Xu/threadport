import { execFile } from "node:child_process";
import { lstat, open, readlink } from "node:fs/promises";
import { constants } from 'node:fs';
import { resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { GitState } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", ['--no-optional-locks', '-c', 'color.ui=false', "-C", cwd, ...args], { maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
    return result.stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git command failed (${args.join(" ")}): ${message}`);
  }
}

function parseStatus(status: string): string[] {
  const parts = status.split("\0");
  const files: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    files.push(entry.length > 3 ? entry.slice(3) : entry);
    if (/[RC]/.test(code) && parts[i + 1]) {
      files.push(parts[++i]);
    }
  }
  return [...new Set(files)].sort();
}

export async function readGitState(cwd: string): Promise<GitState> {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const detached = branch === 'HEAD';
  const head = (await git(root, ["rev-parse", "HEAD"])).trim();
  const status = await git(root, ["status", "--porcelain=v1", "-z"]);
  const diffOptions = ['--binary', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', '--diff-algorithm=myers', '--no-indent-heuristic', '--unified=3', '--inter-hunk-context=0', '--submodule=short', '--no-relative'];
  const staged = await git(root, ['diff', '--cached', ...diffOptions, 'HEAD']);
  const unstaged = await git(root, ['diff', ...diffOptions]);
  const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
    .split("\0").filter(Boolean).sort();
  // Domain separation intentionally invalidates older, incomplete fingerprints.
  const hash = createHash("sha256").update('threadport.git.index-worktree.v2\0');
  const field = (value: string | Buffer) => { hash.update(String(Buffer.byteLength(value))).update(':').update(value); };
  field(status); field(staged); field(unstaged);
  let bytes = 0;
  for (const file of untracked) {
    const absolute = resolve(root, file);
    const rel = relative(root, absolute);
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Untracked path escapes project root.');
    const info = await lstat(absolute);
    field(file);
    if (info.isSymbolicLink()) {
      field('symlink'); field(await readlink(absolute));
    } else if (info.isFile()) {
      bytes += info.size;
      if (bytes > 64 * 1024 * 1024) throw new Error('Untracked content exceeds the 64 MiB snapshot limit. Ignore generated files before extracting.');
      const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.ino !== info.ino || opened.size !== info.size) throw new Error('File changed during Git snapshot; retry.');
        field((info.mode & 0o111) ? 'executable' : 'file');
        const content = Buffer.alloc(info.size);
        let offset = 0;
        while (offset < content.length) {
          const { bytesRead } = await handle.read(content, offset, content.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        const after = await handle.stat();
        if (offset !== info.size || after.size !== info.size || after.mtimeMs !== opened.mtimeMs) throw new Error('File changed during Git snapshot; retry.');
        field(content);
      } finally { await handle.close(); }
    } else {
      throw new Error(`Unsupported untracked file type: ${file}`);
    }
  }
  if (status !== await git(root, ['status', '--porcelain=v1', '-z']) || head !== (await git(root, ['rev-parse', 'HEAD'])).trim()) throw new Error('Git state changed during snapshot; retry.');
  const dirtyDiffHash = hash.digest("hex");
  const changedFiles = parseStatus(status);
  return {
    root,
    branch,
    head,
    dirty: changedFiles.length > 0,
    dirty_diff_hash: dirtyDiffHash,
    changed_files: changedFiles,
    ...(detached ? { detached: true } : {})
  };
}

export function gitStateMatches(expected: GitState, actual: GitState): boolean {
  // This compares work state only. Bind/verify repository identity separately before use.
  return (expected.root === '.' || actual.root === '.' || expected.root === actual.root) &&
    expected.branch === actual.branch &&
    expected.head === actual.head &&
    expected.dirty_diff_hash === actual.dirty_diff_hash;
}
