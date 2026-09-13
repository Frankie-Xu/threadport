import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { GitState } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], { maxBuffer: 4 * 1024 * 1024 });
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
    if ((code === "R " || code === " R" || code === "C " || code === " C") && parts[i + 1]) {
      files.push(parts[++i]);
    }
  }
  return files;
}

export async function readGitState(cwd: string): Promise<GitState> {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  let branch = "HEAD";
  let detached = false;
  try {
    branch = (await git(root, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    detached = true;
  }
  const head = (await git(root, ["rev-parse", "HEAD"])).trim();
  const status = await git(root, ["status", "--porcelain=v1", "-z"]);
  const diff = await git(root, ["diff", "--binary", "HEAD"]);
  const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
    .split("\0").filter(Boolean);
  const hash = createHash("sha256").update(status).update("\0").update(diff);
  for (const file of untracked) {
    const absolute = resolve(root, file);
    if (relative(root, absolute).startsWith("..")) continue;
    hash.update("\0").update(file).update("\0").update(await readFile(absolute));
  }
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
  return expected.root === actual.root &&
    expected.branch === actual.branch &&
    expected.head === actual.head &&
    expected.dirty_diff_hash === actual.dirty_diff_hash;
}
