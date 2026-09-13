import type { CommandRun } from './models.js';

/** Exact identity: do not trim commands, normalize cwd, or mix unknown and known cwd. */
export function commandGroupKey(run: Pick<CommandRun, 'sessionId' | 'cwd' | 'command'>): string {
  return JSON.stringify([run.sessionId, run.cwd, run.command]);
}

/** Select greatest source ordinal per group without mutating or discarding input history.
 * Ordinals are unique within a session. Output is ordered by session then source ordinal.
 */
export function latestCommandRuns(runs: readonly CommandRun[]): CommandRun[] {
  const latest = new Map<string, CommandRun>();
  for (const run of runs) {
    const key = commandGroupKey(run);
    const previous = latest.get(key);
    if (!previous || previous.ordinal < run.ordinal) latest.set(key, run);
  }
  return [...latest.values()].sort((a, b) => a.sessionId === b.sessionId
    ? a.ordinal - b.ordinal : a.sessionId < b.sessionId ? -1 : 1);
}

/** Redaction can make distinct source commands or directories indistinguishable. */
export function hasCompleteCommandIdentity(run: CommandRun): boolean {
  return !/\[REDACTED(?::|\])/.test(run.command + (run.cwd ?? ''));
}
