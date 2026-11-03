import { readLegacyGitState } from './workspace/reader.js';
import type { GitState } from './types.js';

/** Read the index and raw worktree bytes without running Git worktree conversions. */
export async function readGitState(cwd: string): Promise<GitState> {
  try { return await readLegacyGitState(cwd); }
  catch (error) {
    throw new Error(`Git snapshot failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function gitStateMatches(expected: GitState, actual: GitState): boolean {
  // This compares work state only. Bind/verify repository identity separately before use.
  return (expected.root === '.' || actual.root === '.' || expected.root === actual.root) &&
    expected.branch === actual.branch &&
    expected.head === actual.head &&
    expected.dirty_diff_hash === actual.dirty_diff_hash;
}
