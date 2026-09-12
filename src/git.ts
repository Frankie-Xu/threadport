import { execFile } from "node:child_process";
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
  return status.split("\0").filter(Boolean).map((entry) => entry.length > 3 ? entry.slice(3) : entry);
}

export async function readGitState(cwd: string): Promise<GitState> {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const branch = (await git(root, ["symbolic-ref", "--short", "HEAD"])).trim();
  const head = (await git(root, ["rev-parse", "HEAD"])).trim();
  const status = await git(root, ["status", "--porcelain=v1", "-z"]);
  const diff = await git(root, ["diff", "--binary", "HEAD"]);
  const dirtyDiffHash = createHash("sha256").update(`${status}\0${diff}`).digest("hex");
  const changedFiles = parseStatus(status);
  return {
    root,
    branch,
    head,
    dirty: changedFiles.length > 0,
    dirty_diff_hash: dirtyDiffHash,
    changed_files: changedFiles
  };
}

export function gitStateMatches(expected: GitState, actual: GitState): boolean {
  return expected.root === actual.root &&
    expected.branch === actual.branch &&
    expected.head === actual.head &&
    expected.dirty_diff_hash === actual.dirty_diff_hash;
}
